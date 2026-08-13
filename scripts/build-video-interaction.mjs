// Records a genuine Playwright interaction session against the local
// KRISEVA ATTEST prototype for the two "real interaction" video scenes
// (conflict decision, sign-off + receipt) and trims it into two clips.
//
// No fake cursor overlays or scripted DOM state: every value change on
// screen comes from a real click, a real select, or real typed keystrokes
// dispatched through Playwright, against the same local prototype the rest
// of the release ships.
//
// If a genuine recording cannot be produced (Chromium/recordVideo failure,
// or the captured footage comes back implausibly short), this script falls
// back to a deterministic multi-state hard-cut sequence built from real
// screenshots of the same prototype states, and reports which path ran.
import { execFile } from 'node:child_process';
import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { installLocalRoute, LOCAL_ORIGIN } from './local-route.mjs';

const execFileAsync = promisify(execFile);
const projectRoot = resolve(import.meta.dirname, '..');
const outputRoot = resolve(process.argv[2] ?? '');
if (!process.argv[2]) {
  throw new Error('Usage: node scripts/build-video-interaction.mjs <temporary-output-directory>');
}

const RECORDING_WIDTH = 1920;
const RECORDING_HEIGHT = 914; // 1080 - 166px caption band, composited in build-video.sh
const TARGET_CONFLICT_SECONDS = 22;
const TARGET_SIGNOFF_SECONDS = 16;
const MINIMUM_ACCEPTABLE_RATIO = 0.85; // below this, prefer the fallback over a heavily padded recording

const REASON_TEXT = 'Administrator statement matches the signed subscription confirmation on file.';

async function newRecordingContext(browser, dir) {
  const context = await browser.newContext({
    viewport: { width: RECORDING_WIDTH, height: RECORDING_HEIGHT },
    recordVideo: { dir, size: { width: RECORDING_WIDTH, height: RECORDING_HEIGHT } },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  });
  const page = await context.newPage();
  await installLocalRoute(page, projectRoot);
  return { context, page };
}

async function typeVisibly(page, selector, text, delay) {
  const locator = page.locator(selector);
  await locator.click();
  await locator.pressSequentially(text, { delay });
}

async function smoothScrollTo(page, top) {
  await page.evaluate((targetTop) => {
    window.scrollTo({ top: targetTop, behavior: 'smooth' });
  }, top);
}

// Runs the full, continuous interaction session and returns the recorded
// webm path plus the elapsed-ms mark where scene 4 ends and scene 5 begins
// (the moment the cleared conflict gate is scrolled into view after
// navigating to Review and sign-off).
async function recordInteractionSession(dir) {
  const browser = await chromium.launch({ headless: true });
  const sessionStart = Date.now();
  let splitAtMs = null;
  try {
    const { context, page } = await newRecordingContext(browser, dir);

    // --- Scene 4: conflict decision ---------------------------------
    const response = await page.goto(`${LOCAL_ORIGIN}/prototype/?capture=conflict#conflict-queue`);
    if (response?.status() !== 200) {
      throw new Error(`Interaction recording route returned ${response?.status() ?? 'no response'}`);
    }
    await page.locator('#prototype-root[data-capture-ready="true"][data-capture-state="conflict"]').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1800);

    await page.locator('input[name="action"][value="ACCEPT"]').click();
    await page.waitForTimeout(1300);

    await page.locator('#candidate-select').selectOption('admin-committed');
    await page.waitForTimeout(1900);

    await smoothScrollTo(page, 390);
    await page.waitForTimeout(1500);

    await typeVisibly(page, '#reviewer', 'Demo Reviewer', 95);
    await page.waitForTimeout(900);

    await typeVisibly(page, '#decision-reason', REASON_TEXT, 55);
    await page.waitForTimeout(1200);

    await page.locator('#decision-form button[type="submit"]').click();
    await page.locator('#reviewer').waitFor({ state: 'attached' });
    await page.waitForTimeout(2100);

    await smoothScrollTo(page, 0);
    await page.waitForTimeout(900);

    await page.locator('.screen-navigation a[href="#review-signoff"]').click();
    await page.locator('#officer-name').waitFor();
    await page.waitForTimeout(800);

    // The scroll below is the visible "cleared" reveal: the conflict gate
    // banner and the Principal Officer confirmation form come into frame
    // together. This is the scene 4 -> scene 5 boundary.
    await smoothScrollTo(page, 560);
    await page.waitForTimeout(2200);
    splitAtMs = Date.now() - sessionStart;

    // --- Scene 5: sign-off + receipt --------------------------------
    await typeVisibly(page, '#officer-name', 'Demo Officer', 95);
    await page.waitForTimeout(1200);

    await page.locator('#officer-confirm').click();
    await page.waitForTimeout(1400);

    // handleSignOffSubmit re-renders the review-signoff route itself (it does
    // not navigate to the receipt), so the confirmed state shows up as the
    // "gate-cleared" officer-confirmation section here, not the
    // officer-confirmation-record markup (that only exists on the receipt
    // route, visited below).
    await page.locator('#signoff-form button[type="submit"]').click();
    await page.locator('.officer-confirmation.gate-cleared').waitFor();
    await page.waitForTimeout(2200);

    await smoothScrollTo(page, 0);
    await page.waitForTimeout(1000);

    await page.locator('.screen-navigation a[href="#evidence-receipt"]').click();
    await page.locator('#manifest-digest').waitFor();
    await page.waitForTimeout(1200);

    await smoothScrollTo(page, 1150);
    await page.waitForTimeout(1800);

    await smoothScrollTo(page, 1694);
    await page.waitForTimeout(2000);

    await smoothScrollTo(page, 2104);
    await page.waitForTimeout(2200);

    await page.waitForTimeout(1300);

    const videoHandle = page.video();
    await context.close();
    const recordedPath = videoHandle ? await videoHandle.path() : null;
    if (!recordedPath) throw new Error('Playwright did not produce a recorded video path.');
    return { recordedPath, splitAtMs };
  } finally {
    await browser.close();
  }
}

async function probeDuration(mediaPath) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', mediaPath,
  ]);
  return Number(stdout.trim());
}

async function trimClip(sourcePath, startSeconds, endSeconds, destinationPath) {
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  if (startSeconds > 0) args.push('-ss', startSeconds.toFixed(3));
  args.push('-i', sourcePath);
  if (endSeconds != null) args.push('-t', (endSeconds - Math.max(startSeconds, 0)).toFixed(3));
  args.push(
    '-r', '30',
    '-vf', `scale=${RECORDING_WIDTH}:${RECORDING_HEIGHT}:force_original_aspect_ratio=decrease,pad=${RECORDING_WIDTH}:${RECORDING_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black`,
    '-an',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '16',
    destinationPath,
  );
  await execFileAsync('ffmpeg', args);
}

async function padClipToDuration(clipPath, minSeconds) {
  const currentDuration = await probeDuration(clipPath);
  if (currentDuration >= minSeconds) return clipPath;
  const paddedPath = clipPath.replace(/\.mp4$/u, '-padded.mp4');
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', clipPath,
    '-vf', `tpad=stop_mode=clone:stop_duration=${(minSeconds - currentDuration + 0.2).toFixed(3)}`,
    '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16',
    paddedPath,
  ]);
  await rm(clipPath, { force: true });
  await rename(paddedPath, clipPath);
  return clipPath;
}

// --- Fallback: distinct captured states, hard cuts, no motion synthesis --
const FALLBACK_CONFLICT_STATES = [
  { capture: 'conflict', hash: 'conflict-queue', label: 'before' },
];
const FALLBACK_SIGNOFF_STATES = [
  { capture: 'receipt', hash: 'review-signoff', label: 'after' },
  { capture: 'receipt', hash: 'evidence-receipt', label: 'receipt' },
];

async function screenshotCaptureState(browser, { capture, hash }, destinationPath) {
  const { context, page } = await newRecordingContext(browser, outputRoot);
  try {
    await page.goto(`${LOCAL_ORIGIN}/prototype/?capture=${capture}`);
    await page.locator('#prototype-root[data-capture-ready="true"]').waitFor();
    if (hash) {
      await page.evaluate((nextHash) => { window.location.hash = nextHash; }, hash);
      await page.waitForTimeout(300);
    }
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: destinationPath });
  } finally {
    await context.close();
  }
}

async function buildFallbackClip(states, durationSeconds, destinationPath, dir) {
  const browser = await chromium.launch({ headless: true });
  const perStateSeconds = durationSeconds / states.length;
  const segmentPaths = [];
  try {
    for (const [index, state] of states.entries()) {
      const shotPath = resolve(dir, `fallback-${destinationPath.split('/').at(-1)}-${index}.png`);
      await screenshotCaptureState(browser, state, shotPath);
      const segmentPath = resolve(dir, `fallback-${destinationPath.split('/').at(-1)}-${index}.mp4`);
      await execFileAsync('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-loop', '1', '-framerate', '30', '-i', shotPath,
        '-t', perStateSeconds.toFixed(3),
        '-vf', `scale=${RECORDING_WIDTH}:${RECORDING_HEIGHT}:force_original_aspect_ratio=decrease,pad=${RECORDING_WIDTH}:${RECORDING_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p`,
        '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16',
        segmentPath,
      ]);
      segmentPaths.push(segmentPath);
    }
    const listPath = resolve(dir, `fallback-${destinationPath.split('/').at(-1)}-list.txt`);
    await writeFile(listPath, segmentPaths.map((path) => `file '${path}'\n`).join(''));
    await execFileAsync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'concat', '-safe', '0', '-i', listPath,
      '-c', 'copy', destinationPath,
    ]);
  } finally {
    await browser.close();
  }
}

async function main() {
  await mkdir(outputRoot, { recursive: true });
  const conflictPath = resolve(outputRoot, 'interaction-conflict.mp4');
  const signoffPath = resolve(outputRoot, 'interaction-signoff.mp4');
  let mode = 'recording';
  let reason = '';

  try {
    const { recordedPath, splitAtMs } = await recordInteractionSession(outputRoot);
    if (splitAtMs == null) throw new Error('Interaction session did not record a scene split point.');

    const splitSeconds = splitAtMs / 1000;
    const totalSeconds = await probeDuration(recordedPath);
    const conflictRawSeconds = splitSeconds;
    const signoffRawSeconds = totalSeconds - splitSeconds;

    const conflictRatio = conflictRawSeconds / TARGET_CONFLICT_SECONDS;
    const signoffRatio = signoffRawSeconds / TARGET_SIGNOFF_SECONDS;
    if (conflictRatio < MINIMUM_ACCEPTABLE_RATIO || signoffRatio < MINIMUM_ACCEPTABLE_RATIO) {
      throw new Error(
        `Recorded interaction footage is too short to verify reliably (conflict ${conflictRawSeconds.toFixed(2)}s of ${TARGET_CONFLICT_SECONDS}s, signoff ${signoffRawSeconds.toFixed(2)}s of ${TARGET_SIGNOFF_SECONDS}s).`,
      );
    }

    await trimClip(recordedPath, 0, splitSeconds, conflictPath);
    await trimClip(recordedPath, splitSeconds, null, signoffPath);
    await padClipToDuration(conflictPath, TARGET_CONFLICT_SECONDS - 0.5);
    await padClipToDuration(signoffPath, TARGET_SIGNOFF_SECONDS - 0.5);
  } catch (error) {
    mode = 'fallback-states';
    reason = error?.message ?? String(error);
    process.stderr.write(`Live interaction recording unavailable, using fallback states: ${reason}\n`);
    await buildFallbackClip(FALLBACK_CONFLICT_STATES, TARGET_CONFLICT_SECONDS, conflictPath, outputRoot);
    await buildFallbackClip(FALLBACK_SIGNOFF_STATES, TARGET_SIGNOFF_SECONDS, signoffPath, outputRoot);
  }

  const [conflictDuration, signoffDuration] = await Promise.all([
    probeDuration(conflictPath),
    probeDuration(signoffPath),
  ]);

  const { writeFile } = await import('node:fs/promises');
  await writeFile(
    resolve(outputRoot, 'interaction-mode.json'),
    `${JSON.stringify({ mode, reason, conflictDuration, signoffDuration }, null, 2)}\n`,
  );

  // Clean up raw webm captures now that trimmed mp4 clips exist.
  for (const entry of await readdir(outputRoot)) {
    if (entry.endsWith('.webm')) await rm(resolve(outputRoot, entry), { force: true });
  }

  process.stdout.write(`Interaction recording mode: ${mode} (conflict ${conflictDuration.toFixed(2)}s, signoff ${signoffDuration.toFixed(2)}s)\n`);
}

await main();
