import { resolve } from 'node:path';
import { assertVideoMedia, inspectVideoMedia } from './video-media-contract.mjs';

const projectRoot = resolve(import.meta.dirname, '..');
const videoPath = process.argv[2] ? resolve(process.argv[2]) : resolve(projectRoot, 'video/KRISEVA_ATTEST_DEMO_90S.mp4');
const thumbnailPath = process.argv[3] ? resolve(process.argv[3]) : resolve(projectRoot, 'video/KRISEVA_ATTEST_DEMO_THUMBNAIL.png');
const media = assertVideoMedia(await inspectVideoMedia(videoPath, thumbnailPath));
process.stdout.write(`Video verification passed: ${media.width}x${media.height}, H.264/AAC, ${media.frameRate}, ${media.frameCount} frames, ${media.duration}s, ${media.integratedLoudness} LUFS, ${media.truePeak} dBTP.\n`);
