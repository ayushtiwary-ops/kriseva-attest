// Builds video/captions-verbatim.srt: a sentence-level sidecar caption track
// derived from the *measured* per-scene narration audio (not the nominal
// scene duration), so cue timing tracks the real synthesized voice. This is
// distinct from video/captions.srt, which is the human-maintained one-cue-
// per-scene summary asserted against the scene contract.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { inspectAudioDuration } from './video-media-contract.mjs';
import {
  VIDEO_SCENES,
  buildVerbatimCues,
  formatVerbatimSrt,
  splitNarrationByScene,
} from './video-scene-contract.mjs';

const projectRoot = resolve(import.meta.dirname, '..');
const [voiceDir, outputPath] = process.argv.slice(2);
if (!voiceDir || !outputPath) {
  throw new Error('Usage: node scripts/build-video-captions.mjs <voice-directory> <output-srt-path>');
}

const narrationSource = await readFile(resolve(projectRoot, 'video/narration.txt'), 'utf8');
const narration = splitNarrationByScene(narrationSource, VIDEO_SCENES);

const measuredDurations = await Promise.all(
  VIDEO_SCENES.map((scene) => inspectAudioDuration(resolve(voiceDir, `voice-${String(scene.id).padStart(2, '0')}.aiff`))),
);

const cues = buildVerbatimCues(
  VIDEO_SCENES,
  narration.map(({ text }) => text),
  measuredDurations,
);

await writeFile(resolve(outputPath), formatVerbatimSrt(cues));
process.stdout.write(`Built ${cues.length} verbatim caption cues -> ${outputPath}\n`);
