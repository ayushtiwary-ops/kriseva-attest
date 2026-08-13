// Masters the release audio to a target integrated loudness (I, LUFS) and
// true peak ceiling (TP, dBTP), stereo.
//
// This deliberately does NOT use ffmpeg's `loudnorm` filter to apply the
// final gain. `loudnorm` only hits its target precisely in "linear" mode,
// and it silently falls back to a non-linear "dynamic" mode whenever the
// flat gain needed to reach the integrated-loudness target would push the
// true peak past the TP ceiling (`normalization_type` in its own JSON
// report flips from "linear" to "dynamic"). Narrated speech from neural
// TTS is already peak-hot (measured close to -1 to -3 dBFS) while its
// gated integrated loudness is much lower, so that fallback triggers on
// every scene here — and empirically, dynamic mode then lands true peak
// several dB away from the requested target regardless of input.
//
// The reliable, standard alternative: apply a flat gain computed from the
// input's *measured* integrated loudness (so I lands on target), then run
// a lookahead brickwall limiter at the TP ceiling (so nothing above it
// gets through, and loud content sits right at it). This is deterministic
// and hits both targets precisely for this content.
//
// Channel count matters here in a way that is easy to get backwards:
// ffmpeg's automatic mono->stereo channel-layout conversion (via `-ac 2`
// or an `aformat` filter with no explicit pan matrix) applies an implicit
// -3dB-per-channel "downmix-safe" gain so a duplicated mono signal doesn't
// read 3dB louder once summed back down — which also silently drops
// measured true peak by 3dB. And EBU R128 integrated loudness itself reads
// ~3dB louder for true 2-channel content than for the same signal measured
// as mono (per-channel power sums). Measuring on mono and then converting
// to stereo afterward, or converting to stereo via the automatic matrix,
// both throw the I/TP numbers off by exactly that 3dB. So this converts to
// stereo FIRST with an explicit 0dB pan (a literal per-sample duplicate,
// no implicit rematrix gain), then measures and masters that same signal
// end to end, so what gets measured is exactly what ships.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const [inputPath, outputPath, targetIArg, targetTPArg] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error('Usage: node scripts/build-video-loudnorm.mjs <input> <output> [I] [TP]');
}
const targetI = Number(targetIArg ?? -16);
const targetTP = Number(targetTPArg ?? -1.5);

async function runFfmpeg(args) {
  try {
    return await execFileAsync('ffmpeg', args);
  } catch (error) {
    if (error?.stderr) return { stdout: error.stdout ?? '', stderr: error.stderr };
    throw error;
  }
}

const stereoPath = `${outputPath}.stereo-raw.wav`;
await execFileAsync('ffmpeg', [
  '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
  '-i', inputPath,
  '-af', 'pan=stereo|c0=c0|c1=c0',
  '-ar', '48000',
  stereoPath,
]);

const measurePass = await runFfmpeg([
  '-hide_banner', '-nostats', '-nostdin', '-y',
  '-i', stereoPath,
  '-af', 'loudnorm=print_format=json',
  '-f', 'null', '-',
]);
const jsonMatch = measurePass.stderr.match(/\{[\s\S]*\}/u);
if (!jsonMatch) {
  throw new Error(`Unable to parse loudness measurement output:\n${measurePass.stderr.slice(-2000)}`);
}
const measured = JSON.parse(jsonMatch[0]);
const measuredI = Number(measured.input_i);
if (!Number.isFinite(measuredI)) {
  throw new Error(`Unable to read measured integrated loudness from: ${jsonMatch[0]}`);
}

const gainDb = targetI - measuredI;
const limitLinear = 10 ** (targetTP / 20);

await execFileAsync('ffmpeg', [
  '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
  '-i', stereoPath,
  '-af', `volume=${gainDb.toFixed(3)}dB,alimiter=limit=${limitLinear.toFixed(6)}:attack=5:release=50:level=false`,
  '-ar', '48000', '-ac', '2',
  outputPath,
]);
await execFileAsync('rm', ['-f', stereoPath]);

process.stdout.write(
  `Mastered audio: measured stereo input I=${measuredI.toFixed(2)} LUFS, applied gain=${gainDb.toFixed(2)}dB, `
  + `limiter ceiling=${targetTP}dBTP -> ${outputPath}\n`,
);
