import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const VIDEO_CONTRACT = Object.freeze({
  width: 1920,
  height: 1080,
  frameRate: '30/1',
  frameCount: 2700,
  minDuration: 85,
  maxDuration: 100,
  minIntegratedLoudness: -20,
  maxIntegratedLoudness: -16,
  minTruePeak: -4,
  maxTruePeak: -1,
  minNarrationHeadroom: 0.5,
  maxNarrationTail: 3,
  maxSilenceDuration: 3,
});

async function probeJson(path, entries, selectStream, probeOptions = []) {
  const args = ['-v', 'error', ...probeOptions];
  if (selectStream) args.push('-select_streams', selectStream);
  args.push('-show_entries', entries, '-of', 'json', path);
  const { stdout } = await execFileAsync('ffprobe', args);
  return JSON.parse(stdout);
}

function parseAudioMetrics(stderr) {
  const summary = stderr.slice(stderr.lastIndexOf('Summary:'));
  const integrated = summary.match(/I:\s+(-?\d+(?:\.\d+)?) LUFS/u);
  const peak = summary.match(/Peak:\s+(-?\d+(?:\.\d+)?) dBFS/u);
  if (!integrated || !peak) {
    throw new Error('Unable to parse integrated loudness or true peak from FFmpeg ebur128 output.');
  }
  return {
    integratedLoudness: Number(integrated[1]),
    truePeak: Number(peak[1]),
  };
}

function parseSilenceMetrics(stderr) {
  const durations = [...stderr.matchAll(/silence_duration:\s+(\d+(?:\.\d+)?)/gu)]
    .map((match) => Number(match[1]));
  return {
    silenceWindowCount: durations.length,
    maxSilenceDuration: durations.length > 0 ? Math.max(...durations) : 0,
  };
}

export async function inspectVideoMedia(videoPath, thumbnailPath) {
  const [probe, thumbnail, loudness, silence] = await Promise.all([
    probeJson(
      videoPath,
      'format=duration:stream=index,codec_type,codec_name,width,height,r_frame_rate,nb_read_frames',
    ),
    probeJson(thumbnailPath, 'stream=width,height', 'v:0'),
    execFileAsync('ffmpeg', [
      '-hide_banner', '-nostats', '-i', videoPath,
      '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-',
    ]).catch((error) => ({ stderr: error.stderr ?? '' })),
    execFileAsync('ffmpeg', [
      '-hide_banner', '-nostats', '-i', videoPath,
      '-af', 'silencedetect=noise=-45dB:d=0.4', '-f', 'null', '-',
    ]).catch((error) => ({ stderr: error.stderr ?? '' })),
  ]);
  const counted = await probeJson(
    videoPath,
    'stream=nb_frames,nb_read_frames',
    'v:0',
    ['-count_frames'],
  );
  const video = probe.streams.find((stream) => stream.codec_type === 'video');
  const audio = probe.streams.find((stream) => stream.codec_type === 'audio');
  const thumbnailVideo = thumbnail.streams[0];
  const frameCount = Number(
    counted.streams[0]?.nb_read_frames
      ?? counted.streams[0]?.nb_frames
      ?? video.nb_read_frames
      ?? video.nb_frames,
  );

  return {
    videoCodec: video.codec_name,
    audioCodec: audio.codec_name,
    width: video.width,
    height: video.height,
    frameRate: video.r_frame_rate,
    frameCount,
    duration: Number(probe.format.duration),
    thumbnailWidth: thumbnailVideo.width,
    thumbnailHeight: thumbnailVideo.height,
    ...parseAudioMetrics(loudness.stderr),
    ...parseSilenceMetrics(silence.stderr),
  };
}

export function assertVideoMedia(media) {
  const c = VIDEO_CONTRACT;
  if (media.videoCodec !== 'h264') throw new Error(`Expected H.264, found ${media.videoCodec}`);
  if (media.audioCodec !== 'aac') throw new Error(`Expected AAC, found ${media.audioCodec}`);
  if (media.width !== c.width || media.height !== c.height) throw new Error('Video dimensions are invalid.');
  if (media.thumbnailWidth !== c.width || media.thumbnailHeight !== c.height) throw new Error('Thumbnail dimensions are invalid.');
  if (media.frameRate !== c.frameRate) throw new Error(`Expected ${c.frameRate}, found ${media.frameRate}`);
  if (media.frameCount !== c.frameCount) throw new Error(`Expected ${c.frameCount} frames, found ${media.frameCount}`);
  if (media.duration < c.minDuration || media.duration > c.maxDuration) throw new Error(`Duration ${media.duration}s is outside the release window.`);
  if (media.integratedLoudness < c.minIntegratedLoudness || media.integratedLoudness > c.maxIntegratedLoudness) throw new Error(`Integrated loudness ${media.integratedLoudness} LUFS is outside the release window.`);
  if (media.truePeak < c.minTruePeak || media.truePeak > c.maxTruePeak) throw new Error(`True peak ${media.truePeak} dBFS is outside the release window.`);
  if (media.maxSilenceDuration > c.maxSilenceDuration) throw new Error(`Silence window ${media.maxSilenceDuration}s exceeds ${c.maxSilenceDuration}s.`);
  return media;
}

export async function inspectAudioDuration(audioPath) {
  const probe = await probeJson(audioPath, 'format=duration');
  return Number(probe.format.duration);
}

export async function assertNarrationFits(audioPath, sceneDuration) {
  const narrationDuration = await inspectAudioDuration(audioPath);
  const tailDuration = sceneDuration - narrationDuration;
  if (tailDuration < VIDEO_CONTRACT.minNarrationHeadroom) {
    throw new Error(`Narration headroom is ${tailDuration.toFixed(3)}s; at least ${VIDEO_CONTRACT.minNarrationHeadroom}s is required.`);
  }
  if (tailDuration > VIDEO_CONTRACT.maxNarrationTail) {
    throw new Error(`Narration dead air is ${tailDuration.toFixed(3)}s; at most ${VIDEO_CONTRACT.maxNarrationTail}s is allowed.`);
  }
  return { narrationDuration, tailDuration };
}
