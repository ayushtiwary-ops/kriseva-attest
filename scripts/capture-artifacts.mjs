import { stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { buildWireframeSources } from './build-wireframes.mjs';
import { buildSinglePageJpegPdf } from './deterministic-pdf.mjs';
import { installLocalRoute, LOCAL_ORIGIN } from './local-route.mjs';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const mode = process.argv[2] || 'all';

async function openBoard(browser, viewport) {
  const page = await browser.newPage({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  });
  await installLocalRoute(page, projectRoot);
  const response = await page.goto(`${LOCAL_ORIGIN}/wireframes/`);
  if (response?.status() !== 200) {
    throw new Error(`Wireframe route returned ${response?.status() ?? 'no response'}`);
  }
  await page.evaluate(() => document.fonts.ready);
  return page;
}

async function openPrototype(browser, captureState, viewport) {
  const page = await browser.newPage({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  });
  await installLocalRoute(page, projectRoot);
  const response = await page.goto(`${LOCAL_ORIGIN}/prototype/?capture=${captureState}`);
  if (response?.status() !== 200) {
    throw new Error(`Prototype route returned ${response?.status() ?? 'no response'} for ${captureState}`);
  }
  await page.locator(`#prototype-root[data-capture-ready="true"][data-capture-state="${captureState}"]`).waitFor();
  await page.evaluate(() => document.fonts.ready);
  return page;
}

async function captureWireframes() {
  await buildWireframeSources();
  const browser = await chromium.launch({ headless: true });
  try {
    const desktop = await openBoard(browser, { width: 1440, height: 1000 });
    await desktop.screenshot({
      path: resolve(projectRoot, 'artifacts/wireframes-desktop.png'),
      fullPage: true,
      animations: 'disabled',
    });

    const mobile = await openBoard(browser, { width: 390, height: 844 });
    await mobile.screenshot({
      path: resolve(projectRoot, 'artifacts/wireframes-mobile.png'),
      fullPage: true,
      animations: 'disabled',
    });
  } finally {
    await browser.close();
  }

  const desktopPng = resolve(projectRoot, 'artifacts/wireframes-desktop.png');
  const { data, info } = await sharp(desktopPng)
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 94, chromaSubsampling: '4:4:4', optimiseCoding: false })
    .toBuffer({ resolveWithObject: true });
  await writeFile(
    resolve(projectRoot, 'artifacts/KRISEVA_ATTEST_WIREFRAMES.pdf'),
    buildSinglePageJpegPdf(data, info.width, info.height),
  );
}

const prototypeCaptureStates = ['dashboard', 'workspace', 'conflict', 'trace', 'risk', 'receipt'];
const prototypeViewports = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 1000 },
];

async function capturePrototype() {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const captureState of prototypeCaptureStates) {
      for (const viewport of prototypeViewports) {
        const page = await openPrototype(browser, captureState, viewport);
        await page.screenshot({
          path: resolve(projectRoot, `artifacts/prototype-${captureState}-${viewport.width}.png`),
          fullPage: true,
          animations: 'disabled',
        });
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}

async function validatePrototypeCaptures() {
  for (const captureState of prototypeCaptureStates) {
    for (const viewport of prototypeViewports) {
      const relativePath = `artifacts/prototype-${captureState}-${viewport.width}.png`;
      const absolutePath = resolve(projectRoot, relativePath);
      const [artifact, metadata] = await Promise.all([
        stat(absolutePath),
        sharp(absolutePath).metadata(),
      ]);
      if (!artifact.isFile() || artifact.size < 1_000) {
        throw new Error(`Prototype capture is missing or trivial: ${relativePath}`);
      }
      if (metadata.format !== 'png' || metadata.width !== viewport.width || metadata.height < viewport.height) {
        throw new Error(`Prototype capture dimensions are invalid: ${relativePath} (${metadata.width}x${metadata.height})`);
      }
    }
  }
}

if (!['all', 'wireframes', 'prototype'].includes(mode)) {
  throw new Error(`Unsupported capture mode: ${mode}`);
}

if (['all', 'wireframes'].includes(mode)) await captureWireframes();
if (['all', 'prototype'].includes(mode)) await capturePrototype();

if (['all', 'wireframes'].includes(mode)) {
  for (const relativePath of [
    'artifacts/wireframes-desktop.png',
    'artifacts/wireframes-mobile.png',
    'artifacts/KRISEVA_ATTEST_WIREFRAMES.pdf',
  ]) {
    const artifact = await stat(resolve(projectRoot, relativePath));
    if (!artifact.isFile() || artifact.size < 1_000) {
      throw new Error(`Capture artifact is missing or empty: ${relativePath}`);
    }
  }
}
if (['all', 'prototype'].includes(mode)) await validatePrototypeCaptures();

process.stdout.write(`Captured KRISEVA ATTEST ${mode} artifacts with local Playwright Chromium.\n`);
