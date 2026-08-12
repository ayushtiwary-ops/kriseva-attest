import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  mkdtemp,
  readFile,
  readdir,
  rename as realRename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { installVerifiedRelease } from '../scripts/install-video-release.mjs';
import {
  assertNarrationFits,
  assertVideoMedia,
  inspectVideoMedia,
} from '../scripts/video-media-contract.mjs';
import { sceneSourceSpecs } from '../scripts/video-sources.mjs';

const execFileAsync = promisify(execFile);
const projectRoot = resolve(import.meta.dirname, '..');

async function read(relativePath) {
  return readFile(resolve(projectRoot, relativePath), 'utf8');
}

test('video source package declares six bounded scenes and timed captions', async () => {
  const [storyboard, narration, captions] = await Promise.all([
    read('video/storyboard.md'),
    read('video/narration.txt'),
    read('video/captions.srt'),
  ]);

  for (const heading of [
    'Accountability problem',
    'Synthetic case',
    'Supported field',
    'Conflict and abstention',
    'Named human decision',
    'Evidence receipt and programme ask',
  ]) {
    assert.match(storyboard, new RegExp(heading, 'u'));
  }

  for (const required of ['prototype', 'synthetic', 'testing']) {
    assert.match(narration.toLowerCase(), new RegExp(`\\b${required}\\b`, 'u'));
  }
  for (const prohibited of ['solves', 'ensures compliance', 'integrates with drr', 'customer']) {
    assert.doesNotMatch(narration.toLowerCase(), new RegExp(`\\b${prohibited}\\b`, 'u'));
  }

  const cues = captions.match(/\d\d:\d\d:\d\d,\d{3} --> \d\d:\d\d:\d\d,\d{3}/gu) ?? [];
  assert.equal(cues.length, 6);
  assert.match(captions, /00:01:30,000/u);
});

test('caption cues are derived from the canonical scene contract and reject drift', async () => {
  const {
    VIDEO_SCENES,
    assertCaptionSourceMatches,
    expectedCaptionsSrt,
    splitNarrationByScene,
  } = await import('../scripts/video-scene-contract.mjs');
  const captions = await read('video/captions.srt');
  assert.equal(VIDEO_SCENES.length, 6);
  assert.equal(VIDEO_SCENES.reduce((sum, scene) => sum + scene.duration, 0), 90);
  assert.equal(captions, expectedCaptionsSrt(VIDEO_SCENES));
  assert.doesNotThrow(() => assertCaptionSourceMatches(captions, VIDEO_SCENES));
  assert.throws(
    () => assertCaptionSourceMatches(captions.replace('Accountability', 'Automation'), VIDEO_SCENES),
    /caption source does not match/u,
  );

  const narration = splitNarrationByScene(await read('video/narration.txt'), VIDEO_SCENES);
  assert.deepEqual(narration.map(({ id }) => id), VIDEO_SCENES.map(({ id }) => id));
  assert.ok(narration.every(({ text }) => text.length > 0));
});

test('rendered scene rails keep every headline inside the bounded title column', async (t) => {
  const { VIDEO_SCENES } = await import('../scripts/video-scene-contract.mjs');
  const outputRoot = await mkdtemp(resolve(tmpdir(), 'attest-video-scenes-'));
  t.after(() => rm(outputRoot, { recursive: true, force: true }));

  await execFileAsync(process.execPath, [resolve(projectRoot, 'scripts/build-video-scenes.mjs'), outputRoot]);
  const receipt = JSON.parse(await readFile(resolve(outputRoot, 'scenes.json'), 'utf8'));

  assert.equal(receipt.length, 6);
  for (const [index, scene] of receipt.entries()) {
    const contractScene = VIDEO_SCENES[index];
    assert.equal(scene.id, contractScene.id);
    assert.equal(scene.duration, contractScene.duration);
    assert.equal(scene.caption, contractScene.caption);
    assert.equal(scene.narrationMarker, contractScene.narrationMarker);
    assert.deepEqual(scene.source, contractScene.source);
    assert.ok(scene.titleLineWidths.length >= 2);
    assert.ok(
      scene.titleLineWidths.every((width) => width <= scene.titleColumnWidth),
      `scene ${scene.id} headline exceeds ${scene.titleColumnWidth}px: ${scene.titleLineWidths.join(', ')}`,
    );
  }
});

test('every video scene rebuilds from a generated route or a tracked source', async () => {
  assert.equal(sceneSourceSpecs.length, 6);

  for (const source of sceneSourceSpecs) {
    if (source.kind === 'generated-route') {
      assert.equal(source.route, '/');
      continue;
    }

    assert.equal(source.kind, 'tracked-image');
    const { stdout } = await execFileAsync('git', ['ls-files', '--error-unmatch', source.path], {
      cwd: projectRoot,
    });
    assert.equal(stdout.trim(), source.path);
  }
});

test('narration fit rejects clipping and excessive dead air before scene assembly', async (t) => {
  const outputRoot = await mkdtemp(resolve(tmpdir(), 'attest-video-narration-'));
  t.after(() => rm(outputRoot, { recursive: true, force: true }));
  const audioPath = resolve(outputRoot, 'one-second.wav');
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
    audioPath,
  ]);

  const fit = await assertNarrationFits(audioPath, 2);
  assert.ok(fit.narrationDuration >= 0.99 && fit.narrationDuration <= 1.01);
  assert.ok(fit.tailDuration >= 0.99 && fit.tailDuration <= 1.01);
  await assert.rejects(() => assertNarrationFits(audioPath, 1.2), /headroom/u);
  await assert.rejects(() => assertNarrationFits(audioPath, 4.5), /dead air/u);
});

test('narration-fit CLI is shell-safe for spaces and apostrophes and build checks awk', async (t) => {
  const outputRoot = await mkdtemp(resolve(tmpdir(), "attest video O'Brien-"));
  t.after(() => rm(outputRoot, { recursive: true, force: true }));
  const audioPath = resolve(outputRoot, "voice O'Brien sample.wav");
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
    audioPath,
  ]);

  const { stdout } = await execFileAsync(process.execPath, [
    resolve(projectRoot, 'scripts/verify-narration-fit.mjs'),
    audioPath,
    '2',
  ]);
  const fit = JSON.parse(stdout);
  assert.ok(fit.narrationDuration >= 0.99 && fit.narrationDuration <= 1.01);
  assert.ok(fit.tailDuration >= 0.99 && fit.tailDuration <= 1.01);

  const buildScript = await read('scripts/build-video.sh');
  assert.doesNotMatch(buildScript, /node\s+-e/u);
  assert.match(buildScript, /for command_name in node ffmpeg ffprobe say awk/u);
  assert.match(buildScript, /verify-narration-fit\.mjs/u);
});

test('demo video is a non-trivial 1080p H.264/AAC 30 fps release artifact', async () => {
  const videoPath = resolve(projectRoot, 'video/KRISEVA_ATTEST_DEMO_90S.mp4');
  const thumbnailPath = resolve(projectRoot, 'video/KRISEVA_ATTEST_DEMO_THUMBNAIL.png');
  const [videoStat, thumbnailStat] = await Promise.all([stat(videoPath), stat(thumbnailPath)]);
  assert.ok(videoStat.size > 1_000_000);
  assert.ok(thumbnailStat.size > 10_000);

  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration:stream=index,codec_type,codec_name,width,height,r_frame_rate',
    '-of', 'json',
    videoPath,
  ]);
  const probe = JSON.parse(stdout);
  const video = probe.streams.find((stream) => stream.codec_type === 'video');
  const audio = probe.streams.find((stream) => stream.codec_type === 'audio');
  const duration = Number(probe.format.duration);

  assert.equal(video.codec_name, 'h264');
  assert.equal(video.width, 1920);
  assert.equal(video.height, 1080);
  assert.equal(video.r_frame_rate, '30/1');
  assert.equal(audio.codec_name, 'aac');
  assert.ok(duration >= 85 && duration <= 100, `duration ${duration}s is outside 85–100s`);

  const media = await inspectVideoMedia(videoPath, thumbnailPath);
  assert.doesNotThrow(() => assertVideoMedia(media));
  assert.equal(media.frameCount, 2700);
  assert.ok(media.integratedLoudness >= -20 && media.integratedLoudness <= -16);
  assert.ok(media.truePeak >= -4 && media.truePeak <= -1);
  assert.ok(
    media.maxSilenceDuration <= 3,
    `longest detected silence ${media.maxSilenceDuration}s exceeds 3s`,
  );
});

test('failed verification preserves the previous release before atomic replacement', async (t) => {
  const outputRoot = await mkdtemp(resolve(tmpdir(), 'attest-video-install-'));
  t.after(() => rm(outputRoot, { recursive: true, force: true }));
  const paths = {
    candidateVideo: resolve(outputRoot, 'candidate.mp4'),
    candidateThumbnail: resolve(outputRoot, 'candidate.png'),
    outputVideo: resolve(outputRoot, 'release.mp4'),
    outputThumbnail: resolve(outputRoot, 'release.png'),
  };
  await Promise.all([
    writeFile(paths.candidateVideo, 'candidate-video'),
    writeFile(paths.candidateThumbnail, 'candidate-thumbnail'),
    writeFile(paths.outputVideo, 'previous-video'),
    writeFile(paths.outputThumbnail, 'previous-thumbnail'),
  ]);

  await assert.rejects(
    () => installVerifiedRelease({ ...paths, verify: async () => { throw new Error('verification failed'); } }),
    /verification failed/u,
  );
  assert.equal(await readFile(paths.outputVideo, 'utf8'), 'previous-video');
  assert.equal(await readFile(paths.outputThumbnail, 'utf8'), 'previous-thumbnail');

  await installVerifiedRelease({ ...paths, verify: async () => {} });
  assert.equal(await readFile(paths.outputVideo, 'utf8'), 'candidate-video');
  assert.equal(await readFile(paths.outputThumbnail, 'utf8'), 'candidate-thumbnail');
  assert.deepEqual((await readdir(outputRoot)).sort(), [
    'candidate.mp4',
    'candidate.png',
    'release.mp4',
    'release.png',
  ]);
});

test('second release rename failure rolls both outputs back and retains no temporary files', async (t) => {
  const outputRoot = await mkdtemp(resolve(tmpdir(), 'attest-video-rollback-'));
  t.after(() => rm(outputRoot, { recursive: true, force: true }));
  const paths = {
    candidateVideo: resolve(outputRoot, 'candidate.mp4'),
    candidateThumbnail: resolve(outputRoot, 'candidate.png'),
    outputVideo: resolve(outputRoot, 'release.mp4'),
    outputThumbnail: resolve(outputRoot, 'release.png'),
  };
  await Promise.all([
    writeFile(paths.candidateVideo, 'candidate-video'),
    writeFile(paths.candidateThumbnail, 'candidate-thumbnail'),
    writeFile(paths.outputVideo, 'previous-video'),
    writeFile(paths.outputThumbnail, 'previous-thumbnail'),
  ]);

  let releaseRenameCount = 0;
  const fileOps = {
    rename: async (source, destination) => {
      if (destination === paths.outputVideo || destination === paths.outputThumbnail) {
        releaseRenameCount += 1;
        if (releaseRenameCount === 2) {
          throw new Error('simulated second release rename failure');
        }
      }
      return realRename(source, destination);
    },
  };

  await assert.rejects(
    () => installVerifiedRelease({ ...paths, verify: async () => {}, fileOps }),
    /simulated second release rename failure/u,
  );
  assert.equal(await readFile(paths.outputVideo, 'utf8'), 'previous-video');
  assert.equal(await readFile(paths.outputThumbnail, 'utf8'), 'previous-thumbnail');
  assert.deepEqual((await readdir(outputRoot)).sort(), [
    'candidate.mp4',
    'candidate.png',
    'release.mp4',
    'release.png',
  ]);
});
