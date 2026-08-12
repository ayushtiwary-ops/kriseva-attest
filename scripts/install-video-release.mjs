import { copyFile, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

const defaultFileOps = Object.freeze({ copyFile, rename, rm, stat });

function workPath(outputPath, releaseId, purpose) {
  return resolve(
    dirname(outputPath),
    `.attest-${releaseId}-${purpose}-${basename(outputPath)}`,
  );
}

async function pathExists(path, fileOps) {
  try {
    await fileOps.stat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function cleanupPaths(paths, fileOps) {
  await Promise.all(paths.map((path) => fileOps.rm(path, { force: true })));
}

export async function installVerifiedRelease({
  candidateVideo,
  candidateThumbnail,
  outputVideo,
  outputThumbnail,
  verify,
  fileOps: injectedFileOps = {},
}) {
  const fileOps = { ...defaultFileOps, ...injectedFileOps };
  await verify(candidateVideo, candidateThumbnail);

  const releaseId = `${Date.now()}-${process.pid}`;
  const stagedVideo = workPath(outputVideo, releaseId, 'stage');
  const stagedThumbnail = workPath(outputThumbnail, releaseId, 'stage');
  const backupVideo = workPath(outputVideo, releaseId, 'backup');
  const backupThumbnail = workPath(outputThumbnail, releaseId, 'backup');
  const temporaryPaths = [stagedVideo, stagedThumbnail, backupVideo, backupThumbnail];
  let hadVideo = false;
  let hadThumbnail = false;

  try {
    await Promise.all([
      fileOps.copyFile(candidateVideo, stagedVideo),
      fileOps.copyFile(candidateThumbnail, stagedThumbnail),
    ]);

    [hadVideo, hadThumbnail] = await Promise.all([
      pathExists(outputVideo, fileOps),
      pathExists(outputThumbnail, fileOps),
    ]);
    await Promise.all([
      hadVideo ? fileOps.copyFile(outputVideo, backupVideo) : Promise.resolve(),
      hadThumbnail ? fileOps.copyFile(outputThumbnail, backupThumbnail) : Promise.resolve(),
    ]);

    let videoInstalled = false;
    let thumbnailInstalled = false;
    try {
      await fileOps.rename(stagedVideo, outputVideo);
      videoInstalled = true;
      await fileOps.rename(stagedThumbnail, outputThumbnail);
      thumbnailInstalled = true;
    } catch (installationError) {
      const rollbackResults = [];
      for (const target of [
        { backup: backupVideo, hadPrevious: hadVideo, installed: videoInstalled, output: outputVideo },
        { backup: backupThumbnail, hadPrevious: hadThumbnail, installed: thumbnailInstalled, output: outputThumbnail },
      ]) {
        try {
          if (target.hadPrevious) {
            await fileOps.rename(target.backup, target.output);
          } else if (target.installed) {
            await fileOps.rm(target.output, { force: true });
          }
        } catch (rollbackError) {
          rollbackResults.push(rollbackError);
        }
      }

      if (rollbackResults.length > 0) {
        throw new AggregateError(
          [installationError, ...rollbackResults],
          `Video release installation failed and ${rollbackResults.length} rollback operation(s) also failed. Backups were retained.`,
        );
      }
      throw installationError;
    }

    await cleanupPaths(temporaryPaths, fileOps);
  } catch (error) {
    if (error instanceof AggregateError) throw error;
    await Promise.all([
      fileOps.rm(stagedVideo, { force: true }),
      fileOps.rm(stagedThumbnail, { force: true }),
      fileOps.rm(backupVideo, { force: true }),
      fileOps.rm(backupThumbnail, { force: true }),
    ]);
    throw error;
  }
}
