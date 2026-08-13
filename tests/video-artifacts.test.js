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

test('video source package declares seven bounded scenes and timed captions', async () => {
  const [storyboard, narration, captions] = await Promise.all([
    read('video/storyboard.md'),
    read('video/narration.txt'),
    read('video/captions.srt'),
  ]);

  for (const heading of [
    'Cold open',
    'Accountability problem',
    'Synthetic case',
    'Conflict decision',
    'Sign-off and receipt',
    'Boundary',
    'End card',
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
  assert.equal(cues.length, 7);
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
  assert.equal(VIDEO_SCENES.length, 7);
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

test('scene 1 is the cold open on the two conflicting committed-capital values', async () => {
  const { VIDEO_SCENES } = await import('../scripts/video-scene-contract.mjs');
  const coldOpen = VIDEO_SCENES[0];
  assert.equal(coldOpen.id, 1);
  assert.equal(coldOpen.layout, 'cold-open');
  assert.deepEqual(coldOpen.values.map(({ value }) => value), ['USD 25,000,000', 'USD 24,000,000']);
});

test('scene 7 is the end card with the hub URL and the honesty lines', async () => {
  const { VIDEO_SCENES } = await import('../scripts/video-scene-contract.mjs');
  const endCard = VIDEO_SCENES.at(-1);
  assert.equal(endCard.id, 7);
  assert.equal(endCard.layout, 'end-card');
  assert.equal(endCard.url, 'ayushtiwary-ops.github.io/kriseva-attest');
  assert.deepEqual(endCard.lines, [
    'Synthetic data. Not a regulatory filing.',
    'Narration synthesized.',
    'Next: practitioner testing.',
  ]);
});

test('scenes 4 and 5 are real-interaction scenes wired to the interaction recorder', async () => {
  const { VIDEO_SCENES } = await import('../scripts/video-scene-contract.mjs');
  const [conflictScene, signoffScene] = VIDEO_SCENES.filter((scene) => scene.kind === 'recording');
  assert.equal(conflictScene.id, 4);
  assert.equal(conflictScene.source.kind, 'recorded-interaction');
  assert.equal(conflictScene.source.segment, 'conflict');
  assert.equal(signoffScene.id, 5);
  assert.equal(signoffScene.source.kind, 'recorded-interaction');
  assert.equal(signoffScene.source.segment, 'signoff');

  await stat(resolve(projectRoot, 'scripts/build-video-interaction.mjs'));
  const buildScript = await read('scripts/build-video.sh');
  assert.match(buildScript, /build-video-interaction\.mjs/u);
  assert.match(buildScript, /interaction-conflict\.mp4/u);
  assert.match(buildScript, /interaction-signoff\.mp4/u);
});

test('rendered scene rails keep every side-rail headline inside the bounded title column', async (t) => {
  const { VIDEO_SCENES } = await import('../scripts/video-scene-contract.mjs');
  const outputRoot = await mkdtemp(resolve(tmpdir(), 'attest-video-scenes-'));
  t.after(() => rm(outputRoot, { recursive: true, force: true }));

  await execFileAsync(process.execPath, [resolve(projectRoot, 'scripts/build-video-scenes.mjs'), outputRoot]);
  const receipt = JSON.parse(await readFile(resolve(outputRoot, 'scenes.json'), 'utf8'));

  assert.equal(receipt.length, 7);
  for (const [index, scene] of receipt.entries()) {
    const contractScene = VIDEO_SCENES[index];
    assert.equal(scene.id, contractScene.id);
    assert.equal(scene.duration, contractScene.duration);
    assert.equal(scene.kind, contractScene.kind);
    assert.equal(scene.caption, contractScene.caption);
    assert.equal(scene.narrationMarker, contractScene.narrationMarker);
    assert.deepEqual(scene.source, contractScene.source);

    if (scene.kind === 'recording') {
      await stat(resolve(outputRoot, `scene-${String(scene.id).padStart(2, '0')}-band.png`));
      await assert.rejects(() => stat(resolve(outputRoot, `scene-${String(scene.id).padStart(2, '0')}.png`)));
      continue;
    }

    await stat(resolve(outputRoot, `scene-${String(scene.id).padStart(2, '0')}.png`));
    if (scene.layout !== 'side-rail') {
      assert.equal(scene.titleLineWidths.length, 0);
      continue;
    }
    assert.ok(scene.titleLineWidths.length >= 2);
    assert.ok(
      scene.titleLineWidths.every((width) => width <= scene.titleColumnWidth),
      `scene ${scene.id} headline exceeds ${scene.titleColumnWidth}px: ${scene.titleLineWidths.join(', ')}`,
    );
  }
});

test('every video scene rebuilds from a generated route, a tracked source, a recording, or a fixed design', async () => {
  assert.equal(sceneSourceSpecs.length, 7);

  for (const source of sceneSourceSpecs) {
    if (source.kind === 'design-only') continue;

    if (source.kind === 'generated-route') {
      assert.equal(source.route, '/');
      continue;
    }

    if (source.kind === 'recorded-interaction') {
      assert.ok(['conflict', 'signoff'].includes(source.segment));
      continue;
    }

    assert.equal(source.kind, 'tracked-image');
    const { stdout } = await execFileAsync('git', ['ls-files', '--error-unmatch', source.path], {
      cwd: projectRoot,
    });
    assert.equal(stdout.trim(), source.path);
  }

  assert.deepEqual(
    sceneSourceSpecs.map((source) => source.kind),
    ['design-only', 'generated-route', 'tracked-image', 'recorded-interaction', 'recorded-interaction', 'tracked-image', 'design-only'],
  );
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

test('verbatim caption cue builder allocates proportional, bounded, wrapped cues', async () => {
  const {
    VERBATIM_CAPTION_LIMITS,
    buildSceneVerbatimCues,
    buildVerbatimCues,
    formatVerbatimSrt,
    splitIntoSentences,
    wrapIntoCueChunks,
  } = await import('../scripts/video-scene-contract.mjs');

  assert.deepEqual(
    splitIntoSentences('Two records disagree. Which one is right? It is unresolved.'),
    ['Two records disagree.', 'Which one is right?', 'It is unresolved.'],
  );
  assert.deepEqual(splitIntoSentences('  '), []);

  const longSentence = 'This is a fairly long sentence built to force the greedy line wrapper past its per-line character budget and into a second cue chunk.';
  const chunks = wrapIntoCueChunks(longSentence);
  assert.ok(chunks.length >= 2, 'a long sentence must wrap into multiple cue chunks');
  for (const chunk of chunks) {
    assert.ok(chunk.lines.length <= VERBATIM_CAPTION_LIMITS.maxLines);
    for (const line of chunk.lines) assert.ok(line.length <= VERBATIM_CAPTION_LIMITS.maxLineChars);
  }
  assert.equal(chunks.map((chunk) => chunk.text).join(' '), longSentence);

  const sceneCues = buildSceneVerbatimCues('Short first sentence. A second, slightly longer sentence follows.', 10);
  assert.ok(sceneCues.length >= 2);
  let previousEnd = 0;
  for (const cue of sceneCues) {
    assert.ok(cue.startSeconds >= previousEnd - 1e-6);
    assert.ok(cue.endSeconds <= 10 + 1e-6);
    assert.ok(cue.endSeconds - cue.startSeconds <= VERBATIM_CAPTION_LIMITS.maxCueSeconds + 1e-6);
    assert.ok(cue.lines.length >= 1 && cue.lines.length <= VERBATIM_CAPTION_LIMITS.maxLines);
    previousEnd = cue.endSeconds;
  }
  assert.equal(buildSceneVerbatimCues('', 10).length, 0);
  assert.equal(buildSceneVerbatimCues('Text with no duration.', 0).length, 0);

  const scenes = [{ duration: 6 }, { duration: 10 }];
  const cues = buildVerbatimCues(
    scenes,
    ['One short line.', 'Another short line here.'],
    [5, 8],
  );
  assert.ok(cues.every((cue) => cue.startSeconds >= 0 && cue.endSeconds <= 16 + 1e-6));
  assert.ok(cues.some((cue) => cue.startSeconds >= 6 - 1e-6), 'second scene cues must start at/after the 6s offset');
  assert.throws(() => buildVerbatimCues(scenes, ['only one text'], [5, 8]), /same length/u);

  const srt = formatVerbatimSrt(cues);
  const blocks = srt.trim().split('\n\n');
  assert.equal(blocks.length, cues.length);
  blocks.forEach((block, index) => {
    assert.match(block, new RegExp(`^${index + 1}\\n`, 'u'));
    assert.match(block, /\d\d:\d\d:\d\d,\d{3} --> \d\d:\d\d:\d\d,\d{3}/u);
  });
});

test('demo video is a non-trivial 1080p H.264/AAC stereo BT.709 30 fps release artifact', async () => {
  const videoPath = resolve(projectRoot, 'video/KRISEVA_ATTEST_DEMO_90S.mp4');
  const thumbnailPath = resolve(projectRoot, 'video/KRISEVA_ATTEST_DEMO_THUMBNAIL.png');
  const [videoStat, thumbnailStat] = await Promise.all([stat(videoPath), stat(thumbnailPath)]);
  assert.ok(videoStat.size > 1_000_000);
  assert.ok(thumbnailStat.size > 10_000);

  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration:stream=index,codec_type,codec_name,width,height,r_frame_rate,channels',
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
  assert.equal(audio.channels, 2);
  assert.ok(duration >= 85 && duration <= 100, `duration ${duration}s is outside 85-100s`);

  const media = await inspectVideoMedia(videoPath, thumbnailPath);
  assert.doesNotThrow(() => assertVideoMedia(media));
  assert.equal(media.frameCount, 2700);
  assert.equal(media.audioChannels, 2);
  assert.equal(media.colorPrimaries, 'bt709');
  assert.equal(media.colorTransfer, 'bt709');
  assert.equal(media.colorSpace, 'bt709');
  assert.equal(media.colorRange, 'tv');
  assert.ok(
    media.integratedLoudness >= -17 && media.integratedLoudness <= -15,
    `integrated loudness ${media.integratedLoudness} LUFS is outside -17..-15`,
  );
  assert.ok(
    media.truePeak >= -2 && media.truePeak <= -1,
    `true peak ${media.truePeak} dBTP is outside -2..-1`,
  );
  assert.ok(
    media.maxSilenceDuration <= 3,
    `longest detected silence ${media.maxSilenceDuration}s exceeds 3s`,
  );
});

test('verbatim caption sidecar is built at video-build time and stays inside cue bounds', async () => {
  const { VERBATIM_CAPTION_LIMITS } = await import('../scripts/video-scene-contract.mjs');
  const srt = await read('video/captions-verbatim.srt');
  const blocks = srt.trim().split(/\n\n+/u);
  assert.ok(blocks.length > 7, 'verbatim sidecar should have more cues than the 7-scene summary track');

  let previousIndex = 0;
  let previousEndSeconds = -1;
  const toSeconds = (timestamp) => {
    const [, h, m, s, ms] = timestamp.match(/(\d\d):(\d\d):(\d\d),(\d{3})/u);
    return (Number(h) * 3600) + (Number(m) * 60) + Number(s) + (Number(ms) / 1000);
  };

  for (const block of blocks) {
    const lines = block.split('\n');
    const index = Number(lines[0]);
    assert.equal(index, previousIndex + 1);
    previousIndex = index;

    const timing = lines[1].match(/(\d\d:\d\d:\d\d,\d{3}) --> (\d\d:\d\d:\d\d,\d{3})/u);
    assert.ok(timing, `malformed timing line: ${lines[1]}`);
    const start = toSeconds(timing[1]);
    const end = toSeconds(timing[2]);
    assert.ok(end > start, `cue ${index} has non-positive duration`);
    assert.ok(end - start <= VERBATIM_CAPTION_LIMITS.maxCueSeconds + 0.05, `cue ${index} exceeds max cue seconds`);
    assert.ok(start >= previousEndSeconds - 0.05, `cue ${index} overlaps the previous cue`);
    assert.ok(end <= 90 + 0.05, `cue ${index} extends past the 90s master`);
    previousEndSeconds = end;

    const textLines = lines.slice(2);
    assert.ok(textLines.length >= 1 && textLines.length <= VERBATIM_CAPTION_LIMITS.maxLines, `cue ${index} has ${textLines.length} lines`);
    for (const line of textLines) {
      assert.ok(line.length <= VERBATIM_CAPTION_LIMITS.maxLineChars, `cue ${index} line exceeds ${VERBATIM_CAPTION_LIMITS.maxLineChars} chars: "${line}"`);
    }
  }
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
