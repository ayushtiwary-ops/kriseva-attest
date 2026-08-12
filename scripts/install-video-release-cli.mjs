import { installVerifiedRelease } from './install-video-release.mjs';
import { assertVideoMedia, inspectVideoMedia } from './video-media-contract.mjs';

const [candidateVideo, candidateThumbnail, outputVideo, outputThumbnail] = process.argv.slice(2);
if (![candidateVideo, candidateThumbnail, outputVideo, outputThumbnail].every(Boolean)) {
  throw new Error('Usage: node scripts/install-video-release-cli.mjs <candidate-video> <candidate-thumbnail> <output-video> <output-thumbnail>');
}

await installVerifiedRelease({
  candidateVideo,
  candidateThumbnail,
  outputVideo,
  outputThumbnail,
  verify: async (videoPath, thumbnailPath) => assertVideoMedia(await inspectVideoMedia(videoPath, thumbnailPath)),
});

process.stdout.write(`Installed verified video release: ${outputVideo}\n`);
