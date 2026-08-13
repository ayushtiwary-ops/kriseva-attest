import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const screenNames = [
  'Case dashboard',
  'Source-to-field workspace',
  'Conflict queue',
  'Agent trace',
  'Risk and anomaly board',
  'Review and sign-off',
  'Evidence receipt',
];

test('wireframe board exposes seven semantic screens and deterministic exports', async () => {
  const html = await readFile(resolve(projectRoot, 'wireframes/index.html'), 'utf8').catch(() => '');
  const missing = [];

  for (const name of screenNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    if (!new RegExp(`<h2[^>]*>\\s*${escaped}\\s*</h2>`, 'u').test(html)) {
      missing.push(`heading:${name}`);
    }
  }

  for (const label of ['Task', 'Primary action', 'Error / empty state', 'Mobile collapse']) {
    const occurrences = html.match(new RegExp(`>${label}<`, 'gu'))?.length || 0;
    if (occurrences !== 7) {
      missing.push(`label:${label}:${occurrences}/7`);
    }
  }

  for (const relativePath of [
    'artifacts/wireframes-desktop.png',
    'artifacts/wireframes-mobile.png',
    'artifacts/KRISEVA_ATTEST_WIREFRAMES.pdf',
  ]) {
    const artifact = await stat(resolve(projectRoot, relativePath)).catch(() => null);
    if (!artifact?.isFile() || artifact.size < 1_000) {
      missing.push(`artifact:${relativePath}`);
    }
  }

  assert.deepEqual(missing, []);
});

test('desktop SVG wraps long evidence labels within their columns', async () => {
  const svg = await readFile(resolve(projectRoot, 'artifacts/wireframes-desktop.svg'), 'utf8');

  assert.doesNotMatch(svg, />03 Investor complaints closed<\/tspan>/u);
  assert.doesNotMatch(svg, />meridian-horizon-q2-2026<\/tspan>/u);
  assert.doesNotMatch(svg, />Meridian Horizon Fund I · Quarter ended 30 June 2026<\/tspan>/u);
});

test('mobile SVG reserves enough vertical space for stacked evidence rows', async () => {
  const svg = await readFile(resolve(projectRoot, 'artifacts/wireframes-mobile.svg'), 'utf8');
  const panelHeights = [...svg.matchAll(/height="([\d.]+)" fill="#[fF]4[fF]4[fF]1" stroke="#[bB]9[bB]9[bB]4"/gu)]
    .map((match) => Number(match[1]));

  assert.equal(panelHeights.length, 14);
  assert.equal(panelHeights.every((height) => height >= 230), true);
});

test('mobile SVG text bounds stay inside rows and banner labels do not intersect', async () => {
  const svg = await readFile(resolve(projectRoot, 'artifacts/wireframes-mobile.svg'), 'utf8');
  const textBounds = [...svg.matchAll(/data-text-bottom="([\d.]+)" data-owner-bottom="([\d.]+)"/gu)]
    .map((match) => ({ textBottom: Number(match[1]), ownerBottom: Number(match[2]) }));
  const bannerBoxes = [...svg.matchAll(/data-banner-box="([^"]+)"/gu)]
    .map((match) => match[1].split(',').map(Number));

  assert.equal(textBounds.length >= 48, true);
  assert.equal(textBounds.every(({ textBottom, ownerBottom }) => textBottom <= ownerBottom - 16), true);
  assert.equal(bannerBoxes.length, 14);

  for (let index = 0; index < bannerBoxes.length; index += 2) {
    const [firstX, firstY, firstWidth, firstHeight] = bannerBoxes[index];
    const [secondX, secondY, secondWidth, secondHeight] = bannerBoxes[index + 1];
    const intersects = firstX < secondX + secondWidth
      && firstX + firstWidth > secondX
      && firstY < secondY + secondHeight
      && firstY + firstHeight > secondY;
    assert.equal(intersects, false);
  }
});

test('mobile SVG evidence-panel text blocks keep ordered vertical gaps', async () => {
  const svg = await readFile(resolve(projectRoot, 'artifacts/wireframes-mobile.svg'), 'utf8');
  const blocks = [...svg.matchAll(/data-flow-owner="([^"]+)" data-flow-order="(\d+)" data-flow-top="([\d.]+)" data-flow-bottom="([\d.]+)"/gu)]
    .map((match) => ({ owner: match[1], order: Number(match[2]), top: Number(match[3]), bottom: Number(match[4]) }));
  const groups = Map.groupBy(blocks, (block) => block.owner);

  assert.equal(groups.size, 28);
  for (const group of groups.values()) {
    group.sort((left, right) => left.order - right.order);
    assert.equal(group.length, 4);
    for (let index = 1; index < group.length; index += 1) {
      assert.equal(group[index - 1].bottom <= group[index].top - 12, true);
    }
  }
});

test('desktop and mobile SVG text blocks retain 16px owner padding', async () => {
  for (const mode of ['desktop', 'mobile']) {
    const svg = await readFile(resolve(projectRoot, `artifacts/wireframes-${mode}.svg`), 'utf8');
    const textBounds = [...svg.matchAll(/data-text-bottom="([\d.]+)" data-owner-bottom="([\d.]+)"/gu)]
      .map((match) => ({ textBottom: Number(match[1]), ownerBottom: Number(match[2]) }));

    assert.equal(textBounds.length >= 48, true, `${mode} did not expose enough text bounds`);
    assert.equal(
      textBounds.every(({ textBottom, ownerBottom }) => textBottom <= ownerBottom - 16),
      true,
      `${mode} contains text that exceeds its owner boundary`,
    );
  }
});

test('generated SVG body copy never falls below 17px', async () => {
  for (const mode of ['desktop', 'mobile']) {
    const svg = await readFile(resolve(projectRoot, `artifacts/wireframes-${mode}.svg`), 'utf8');
    const bodySizes = [...svg.matchAll(/font-size="([\d.]+)"[^>]*data-copy-kind="body"/gu)]
      .map((match) => Number(match[1]));

    assert.equal(bodySizes.length >= 24, true, `${mode} did not expose body-copy markers`);
    assert.equal(bodySizes.every((fontSize) => fontSize >= 17), true);
  }
});

test('release capture dependencies are declared and contain no absolute runtime fallback', async () => {
  const packageJson = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8'));
  const captureScript = await readFile(resolve(projectRoot, 'scripts/capture-artifacts.mjs'), 'utf8');

  assert.match(packageJson.devDependencies?.sharp || '', /^\^?0\.35\./u);
  assert.doesNotMatch(captureScript, /\/Users\/[^/\s]+\/\.cache\/codex-runtimes/u);
  assert.doesNotMatch(captureScript, /svg-fallback|captureWithSvgFallback/u);
});
