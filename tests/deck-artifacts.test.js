import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { scanContent } from '../scripts/verify-claims.mjs';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const deckDir = resolve(projectRoot, 'deck');
const artifactDir = resolve(projectRoot, 'artifacts/deck');
const contentPath = resolve(deckDir, 'DECK_CONTENT.md');
const sourceNotesPath = resolve(deckDir, 'SOURCE_NOTES.md');
const pptxPath = resolve(deckDir, 'KRISEVA_ATTEST_GIFT_2026.pptx');
const pdfPath = resolve(deckDir, 'KRISEVA_ATTEST_GIFT_2026.pdf');

function wordCount(value) {
  return String(value).trim().match(/[\p{L}\p{N}₹]+(?:[’'/-][\p{L}\p{N}₹]+)*/gu)?.length ?? 0;
}

async function loadContract() {
  const content = await readFile(contentPath, 'utf8');
  const match = content.match(/<!-- CONTRACT:START -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- CONTRACT:END -->/u);
  assert.ok(match, 'DECK_CONTENT.md must contain the machine-readable slide contract');
  return JSON.parse(match[1]);
}

function zipEntries(filePath) {
  return execFileSync('unzip', ['-Z1', filePath], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
}

function zipText(filePath, internalGlob) {
  return execFileSync('unzip', ['-p', filePath, internalGlob], { encoding: 'utf8' });
}

function decodeXmlText(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
}

function textShapesFromSlideXml(xml) {
  return [...xml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/gu)].map(([, shapeXml]) => {
    const name = shapeXml.match(/<p:cNvPr\b[^>]*\bname="([^"]+)"/u)?.[1] ?? '';
    const text = [...shapeXml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/gu)]
      .map(([, value]) => decodeXmlText(value))
      .join('\n')
      .trim();
    const pointSizes = [...shapeXml.matchAll(/<a:(?:defRPr|rPr|endParaRPr)\b[^>]*\bsz="(\d+)"/gu)]
      .map(([, hundredthsOfAPoint]) => Number(hundredthsOfAPoint) / 100);
    return { name, text, pointSizes };
  }).filter(({ text }) => text.length > 0);
}

function slideSemanticSignature(filePath) {
  return Array.from({ length: 10 }, (_, index) => {
    const slideNumber = index + 1;
    const shapes = textShapesFromSlideXml(zipText(filePath, `ppt/slides/slide${slideNumber}.xml`));
    const notesXml = zipText(filePath, `ppt/notesSlides/notesSlide${slideNumber}.xml`);
    const notes = [...notesXml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/gu)]
      .map(([, value]) => decodeXmlText(value))
      .filter((value) => value !== ' ');
    return {
      slideNumber,
      shapes: shapes.map(({ name, text, pointSizes }) => ({ name, text, pointSizes })),
      notes,
    };
  });
}

async function visualFingerprint(filePath) {
  const { data, info } = await sharp(filePath)
    .resize(32, 18, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 32);
  assert.equal(info.height, 18);
  return data;
}

function meanAbsoluteDelta(left, right) {
  assert.equal(left.length, right.length);
  let total = 0;
  for (let index = 0; index < left.length; index += 1) total += Math.abs(left[index] - right[index]);
  return total / left.length;
}

test('deck content contract has exactly ten bounded, sourced slides', async () => {
  const contract = await loadContract();
  assert.equal(contract.slides.length, 10);
  assert.deepEqual(contract.slides.map(({ number }) => number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  for (const slide of contract.slides) {
    assert.ok(slide.title.length > 0, `slide ${slide.number} needs a title`);
    assert.ok(Array.isArray(slide.body) && slide.body.length > 0, `slide ${slide.number} needs visible body copy`);
    const count = wordCount(slide.body.join(' '));
    assert.ok(count <= 40, `slide ${slide.number} has ${count} body words; maximum is 40`);
    assert.ok(Array.isArray(slide.sources) && slide.sources.length > 0, `slide ${slide.number} needs sources`);
  }
});

test('editable deck contains ten slides and a Sources note on every slide', () => {
  assert.ok(fs.existsSync(pptxPath), 'editable PPTX is missing');
  const entries = zipEntries(pptxPath);
  const slides = entries.filter((entry) => /^ppt\/slides\/slide\d+\.xml$/u.test(entry));
  const notes = entries.filter((entry) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/u.test(entry));
  assert.equal(slides.length, 10);
  assert.equal(notes.length, 10);
  const notesXml = zipText(pptxPath, 'ppt/notesSlides/notesSlide*.xml');
  assert.equal((notesXml.match(/\[Sources\]/gu) ?? []).length, 10);
  assert.doesNotMatch(notesXml, /TODO|TBD|lorem|\{\{/iu);
});

test('rendered PDF has exactly ten pages', () => {
  assert.ok(fs.existsSync(pdfPath), 'rendered PDF is missing');
  const info = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' });
  assert.match(info, /^Pages:\s+10$/mu);
});

test('render pack has ten 1280 by 720 slide PNGs and receipts', async () => {
  const expected = Array.from({ length: 10 }, (_, index) => `slide-${String(index + 1).padStart(2, '0')}.png`);
  const actual = fs.existsSync(artifactDir)
    ? fs.readdirSync(artifactDir).filter((name) => /^slide-\d{2}\.png$/u.test(name)).sort()
    : [];
  assert.deepEqual(actual, expected);

  for (const file of actual) {
    const metadata = await sharp(resolve(artifactDir, file)).metadata();
    assert.equal(metadata.width, 1280, `${file} width`);
    assert.equal(metadata.height, 720, `${file} height`);
  }

  for (const receipt of ['deck-manifest.json', 'deck-montage.png', 'layout-audit.json']) {
    assert.ok(fs.existsSync(resolve(artifactDir, receipt)), `${receipt} is missing`);
  }
  assert.ok(fs.existsSync(sourceNotesPath), 'SOURCE_NOTES.md is missing');
});

test('visible deck copy is claim-safe and layout receipts enforce layout bounds', async () => {
  const contract = await loadContract();
  const visibleCopy = contract.slides
    .map((slide) => [slide.title, ...slide.body].join('\n'))
    .join('\n');
  assert.deepEqual(scanContent(visibleCopy, 'deck-visible-copy'), []);

  const audit = JSON.parse(await readFile(resolve(artifactDir, 'layout-audit.json'), 'utf8'));
  assert.equal(audit.slides.length, 10);
  for (const slide of audit.slides) {
    assert.deepEqual(slide.offCanvas, [], `slide ${slide.number} has off-canvas elements`);
    assert.ok(slide.bodyWordCount <= 40, `slide ${slide.number} body word count`);
  }
});

test('physical PPTX type meets point-size floors for titles and meaningful audience copy', () => {
  for (let slideNumber = 1; slideNumber <= 10; slideNumber += 1) {
    const xml = zipText(pptxPath, `ppt/slides/slide${slideNumber}.xml`);
    const shapes = textShapesFromSlideXml(xml);
    const titleName = slideNumber === 1 ? 'cover-title' : `title-${slideNumber}`;
    const title = shapes.find(({ name }) => name === titleName);
    assert.ok(title, `slide ${slideNumber} title shape is missing`);
    assert.ok(title.pointSizes.length > 0, `slide ${slideNumber} title has no explicit OOXML point size`);
    const titleFloor = slideNumber === 1 ? 50 : 35;
    assert.ok(
      Math.min(...title.pointSizes) >= titleFloor,
      `slide ${slideNumber} title is ${Math.min(...title.pointSizes)}pt; minimum is ${titleFloor}pt`,
    );

    const meaningfulShapes = shapes.filter(({ name }) => (
      name !== titleName &&
      !name.startsWith('brand-') &&
      !name.startsWith('footer-') &&
      !['cover-number', 'cover-classification', 'cover-page'].includes(name)
    ));
    assert.ok(meaningfulShapes.length > 0, `slide ${slideNumber} has no meaningful audience copy`);
    for (const shape of meaningfulShapes) {
      assert.ok(shape.pointSizes.length > 0, `slide ${slideNumber} ${shape.name} has no explicit OOXML point size`);
      const minimum = Math.min(...shape.pointSizes);
      assert.ok(minimum >= 16, `slide ${slideNumber} ${shape.name} is ${minimum}pt; minimum is 16pt`);
    }
  }
});

test('every title remains a single rendered line at the physical font floor', async () => {
  for (let slideNumber = 1; slideNumber <= 10; slideNumber += 1) {
    const layout = JSON.parse(await readFile(
      resolve(artifactDir, `layout-${String(slideNumber).padStart(2, '0')}.json`),
      'utf8',
    ));
    const titleName = slideNumber === 1 ? 'cover-title' : `title-${slideNumber}`;
    const title = layout.elements.find(({ name }) => name === titleName);
    assert.ok(title, `slide ${slideNumber} title is missing from layout export`);
    assert.equal(title.textLayout?.lineCount, 1, `slide ${slideNumber} title wrapped`);
  }
});

test('deck builder resolves a clean checkout path containing spaces', () => {
  const scratchRoot = fs.mkdtempSync(join(tmpdir(), 'attest deck portability '));
  const artifactWorkspace = resolve(projectRoot, '.tmp/artifact-tool-workspace');
  try {
    fs.mkdirSync(resolve(scratchRoot, 'scripts'), { recursive: true });
    fs.mkdirSync(resolve(scratchRoot, 'deck'), { recursive: true });
    fs.mkdirSync(resolve(scratchRoot, 'artifacts'), { recursive: true });
    fs.copyFileSync(resolve(projectRoot, 'scripts/build-deck.mjs'), resolve(scratchRoot, 'scripts/build-deck.mjs'));
    fs.copyFileSync(contentPath, resolve(scratchRoot, 'deck/DECK_CONTENT.md'));
    for (const image of ['prototype-conflict-1440.png', 'prototype-receipt-1440.png']) {
      fs.copyFileSync(resolve(projectRoot, 'artifacts', image), resolve(scratchRoot, 'artifacts', image));
    }

    execFileSync(process.execPath, [resolve(scratchRoot, 'scripts/build-deck.mjs')], {
      cwd: scratchRoot,
      env: { ...process.env, ATTEST_ARTIFACT_WORKSPACE: artifactWorkspace },
      stdio: 'pipe',
    });

    const portablePptx = resolve(scratchRoot, 'deck/KRISEVA_ATTEST_GIFT_2026.pptx');
    assert.ok(fs.existsSync(portablePptx), 'path-space build did not produce the editable PPTX');
    assert.equal(
      zipEntries(portablePptx).filter((entry) => /^ppt\/slides\/slide\d+\.xml$/u.test(entry)).length,
      10,
    );
  } finally {
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  }
});

test('programme ask preserves the approved five-interview discovery mix', async () => {
  const expected = 'ACCESS · 2 FME officers + 2 administrators + 1 independent compliance provider';
  const contract = await loadContract();
  assert.equal(contract.slides.find(({ number }) => number === 10)?.body[0], expected);

  const shapes = textShapesFromSlideXml(zipText(pptxPath, 'ppt/slides/slide10.xml'));
  assert.equal(
    shapes.find(({ name }) => name === 'ask-access-copy')?.text,
    '2 FME officers + 2 administrators + 1 independent compliance provider',
  );
});

test('deck rebuilds preserve the declared visual-semantic contract without promising binary identity', async () => {
  const manifest = JSON.parse(await readFile(resolve(artifactDir, 'deck-manifest.json'), 'utf8'));
  assert.deepEqual(manifest.reproducibility, {
    contract: 'visual-semantic',
    guarantees: [
      'ordered visible text and source notes',
      'named layout and physical typography',
      'materially equivalent rendered slides',
    ],
    excludes: [
      'byte-identical PPTX or PDF archives',
      'stable package metadata or internal object IDs',
    ],
  });

  const scratchRoot = fs.mkdtempSync(join(tmpdir(), 'attest deck semantic '));
  const artifactWorkspace = resolve(projectRoot, '.tmp/artifact-tool-workspace');
  try {
    fs.mkdirSync(resolve(scratchRoot, 'scripts'), { recursive: true });
    fs.mkdirSync(resolve(scratchRoot, 'deck'), { recursive: true });
    fs.mkdirSync(resolve(scratchRoot, 'artifacts'), { recursive: true });
    fs.copyFileSync(resolve(projectRoot, 'scripts/build-deck.mjs'), resolve(scratchRoot, 'scripts/build-deck.mjs'));
    fs.copyFileSync(resolve(projectRoot, 'scripts/render-deck.mjs'), resolve(scratchRoot, 'scripts/render-deck.mjs'));
    fs.copyFileSync(contentPath, resolve(scratchRoot, 'deck/DECK_CONTENT.md'));
    for (const image of ['prototype-conflict-1440.png', 'prototype-receipt-1440.png']) {
      fs.copyFileSync(resolve(projectRoot, 'artifacts', image), resolve(scratchRoot, 'artifacts', image));
    }
    fs.symlinkSync(resolve(projectRoot, 'node_modules'), resolve(scratchRoot, 'node_modules'), 'dir');
    const environment = { ...process.env, ATTEST_ARTIFACT_WORKSPACE: artifactWorkspace };

    execFileSync(process.execPath, [resolve(scratchRoot, 'scripts/build-deck.mjs')], {
      cwd: scratchRoot,
      env: environment,
      stdio: 'pipe',
    });
    execFileSync(process.execPath, [resolve(scratchRoot, 'scripts/render-deck.mjs')], {
      cwd: scratchRoot,
      env: environment,
      stdio: 'pipe',
    });

    const portablePptx = resolve(scratchRoot, 'deck/KRISEVA_ATTEST_GIFT_2026.pptx');
    assert.deepEqual(slideSemanticSignature(portablePptx), slideSemanticSignature(pptxPath));
    for (let slideNumber = 1; slideNumber <= 10; slideNumber += 1) {
      const fileName = `slide-${String(slideNumber).padStart(2, '0')}.png`;
      const canonical = await visualFingerprint(resolve(artifactDir, fileName));
      const rebuilt = await visualFingerprint(resolve(scratchRoot, 'artifacts/deck', fileName));
      assert.ok(
        meanAbsoluteDelta(canonical, rebuilt) <= 0.5,
        `${fileName} changed materially across clean builds`,
      );
    }
  } finally {
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  }
});
