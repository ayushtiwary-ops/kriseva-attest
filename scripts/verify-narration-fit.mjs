import { assertNarrationFits } from './video-media-contract.mjs';

const [audioPath, sceneDurationSource] = process.argv.slice(2);
const sceneDuration = Number(sceneDurationSource);
if (!audioPath || !Number.isFinite(sceneDuration) || sceneDuration <= 0) {
  throw new Error('Usage: node scripts/verify-narration-fit.mjs <audio-path> <scene-duration-seconds>');
}

const result = await assertNarrationFits(audioPath, sceneDuration);
process.stdout.write(`${JSON.stringify(result)}\n`);
