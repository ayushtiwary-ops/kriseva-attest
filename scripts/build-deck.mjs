import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contentPath = resolve(projectRoot, 'deck/DECK_CONTENT.md');
const pptxPath = resolve(projectRoot, 'deck/KRISEVA_ATTEST_GIFT_2026.pptx');
const artifactDir = resolve(projectRoot, 'artifacts/deck');
const defaultWorkspace = resolve(projectRoot, '.tmp/artifact-tool-workspace');

const SLIDE = { width: 1280, height: 720 };
const COLOR = {
  paper: '#DED6C9',
  raised: '#F3EDE0',
  navy: '#0A1F44',
  ink: '#0F0E0B',
  brass: '#A87229',
  green: '#215B43',
  rust: '#96491A',
  muted: '#625B53',
  rule: '#7E786E',
};
const FONT = { display: 'Georgia', body: 'Arial', mono: 'Courier New' };
const FONT_FLOOR_PX = { title: 48, body: 22 };
const REPRODUCIBILITY = {
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
};
const layoutRegistry = [];

async function importArtifactTool() {
  try {
    return await import('@oai/artifact-tool');
  } catch {
    // The repository intentionally does not vendor the Codex presentation runtime.
  }

  const workspaces = [
    process.env.ATTEST_ARTIFACT_WORKSPACE,
    defaultWorkspace,
    ...(process.env.NODE_PATH ?? '').split(process.platform === 'win32' ? ';' : ':'),
  ].filter(Boolean);

  for (const workspace of workspaces) {
    const resolvedWorkspace = resolve(workspace);
    try {
      const requireFromWorkspace = createRequire(resolve(resolvedWorkspace, '__artifact_resolver__.cjs'));
      const entrypoint = requireFromWorkspace.resolve('@oai/artifact-tool');
      return await import(pathToFileURL(entrypoint).href);
    } catch {
      const packageDir = resolvedWorkspace.endsWith('node_modules')
        ? resolve(resolvedWorkspace, '@oai/artifact-tool')
        : resolve(resolvedWorkspace, 'node_modules/@oai/artifact-tool');
      for (const entrypoint of [
        resolve(packageDir, 'dist/node/artifact_tool.mjs'),
        resolve(packageDir, 'dist/artifact_tool.mjs'),
      ]) {
        if (fs.existsSync(entrypoint)) return import(pathToFileURL(entrypoint).href);
      }
    }
  }

  throw new Error([
    'Unable to resolve @oai/artifact-tool.',
    'Initialize a temporary workspace with the presentation skill setup helper,',
    'then set ATTEST_ARTIFACT_WORKSPACE or use .tmp/artifact-tool-workspace.',
  ].join(' '));
}

function parseContract(markdown) {
  const match = markdown.match(/<!-- CONTRACT:START -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- CONTRACT:END -->/u);
  if (!match) throw new Error('DECK_CONTENT.md is missing its machine-readable contract.');
  const contract = JSON.parse(match[1]);
  if (contract.slides?.length !== 10) throw new Error('The deck contract must contain exactly 10 slides.');
  return contract;
}

function countWords(value) {
  return String(value).trim().match(/[\p{L}\p{N}₹]+(?:[’'/-][\p{L}\p{N}₹]+)*/gu)?.length ?? 0;
}

function resolveAsset(assetPath) {
  if (assetPath.startsWith('repo:')) return resolve(projectRoot, assetPath.slice(5));
  return isAbsolute(assetPath) ? assetPath : resolve(projectRoot, assetPath);
}

async function imageBytes(assetPath, pixelCrop) {
  if (pixelCrop) {
    const bytes = await sharp(resolveAsset(assetPath)).extract(pixelCrop).png().toBuffer();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  const bytes = await readFile(resolveAsset(assetPath));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function writeBlob(outputPath, blob) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.from(await blob.arrayBuffer()));
}

const deckWorkspace = resolve(projectRoot, '.tmp/deck-assets');

// The canonical monogram is navy-on-transparent, so placing it directly on the
// cover's navy sidebar would render invisible. Build a small raised-color badge
// PNG at build time (sharp rasterizes the SVG, then composites it onto a paper
// backing square) so the mark stays legible on the dark sidebar.
async function buildCoverLogoBadge() {
  const badgeSize = 92;
  const logoSize = 62;
  const inset = Math.round((badgeSize - logoSize) / 2);
  const svgBuffer = await readFile(resolve(projectRoot, 'assets/kriseva-logo.svg'));
  const logoPng = await sharp(svgBuffer, { density: 384 }).resize(logoSize, logoSize).png().toBuffer();
  const badge = await sharp({
    create: {
      width: badgeSize,
      height: badgeSize,
      channels: 4,
      background: COLOR.raised,
    },
  }).composite([{ input: logoPng, top: inset, left: inset }]).png().toBuffer();
  await mkdir(deckWorkspace, { recursive: true });
  const outputPath = resolve(deckWorkspace, 'kriseva-logo-badge.png');
  await writeFile(outputPath, badge);
  return { path: outputPath, size: badgeSize };
}

function beginSlide(number, background) {
  const record = { number, elements: [] };
  layoutRegistry.push(record);
  return record;
}

function recordElement(record, element) {
  record.elements.push(element);
}

function addRect(slide, record, name, position, { fill = 'none', line = COLOR.navy, width = 1, radius = 0, role = 'shape' } = {}) {
  const shape = slide.shapes.add({
    geometry: 'rect',
    name,
    position,
    fill,
    line: { style: 'solid', fill: line, width },
    borderRadius: radius,
  });
  recordElement(record, { name, role, ...position });
  return shape;
}

function addRule(slide, record, name, left, top, width, { color = COLOR.navy, weight = 1, height = 0 } = {}) {
  const shape = slide.shapes.add({
    geometry: 'line',
    name,
    position: { left, top, width, height },
    fill: 'none',
    line: { style: 'solid', fill: color, width: weight },
  });
  recordElement(record, { name, role: 'rule', left, top, width, height: Math.max(height, weight) });
  return shape;
}

function addText(slide, record, name, text, position, options = {}) {
  const {
    size = 20,
    color = COLOR.ink,
    face = FONT.body,
    bold = false,
    italic = false,
    align = 'left',
    vertical = 'top',
    fill = 'none',
    line = 'none',
    lineWidth = 0,
    insets = { top: 0, right: 0, bottom: 0, left: 0 },
    role = 'body',
  } = options;
  const effectiveSize = role === 'title'
    ? Math.max(size, FONT_FLOOR_PX.title)
    : role === 'body'
      ? Math.max(size, FONT_FLOOR_PX.body)
      : size;
  const shape = slide.shapes.add({
    geometry: 'textbox',
    name,
    position,
    fill,
    line: { style: 'solid', fill: line, width: lineWidth },
    borderRadius: 0,
  });
  shape.text = text;
  shape.text.style = {
    fontSize: effectiveSize,
    typeface: face,
    bold,
    italic,
    color,
    alignment: align,
    verticalAlignment: vertical,
    autoFit: 'none',
    wrap: 'square',
    insets,
  };
  recordElement(record, { name, role, text, fontSize: effectiveSize, ...position });
  return shape;
}

async function addImage(slide, record, name, assetPath, position, options = {}) {
  // NOTE: the presentation library's declarative `crop` (OOXML srcRect) is not
  // honoured by this build's PNG/canvas export path, so any fractional crop set
  // there is invisible in artifacts/deck/*.png and the montage. Crops are instead
  // applied pixel-exact at build time with sharp before the bytes ever reach the
  // slide, which renders correctly in every export path.
  const image = slide.images.add({
    blob: await imageBytes(assetPath, options.pixelCrop),
    contentType: 'image/png',
    alt: options.alt,
    fit: options.fit ?? 'cover',
    geometry: 'rect',
    borderRadius: 0,
    position,
  });
  recordElement(record, { name, role: 'image', assetPath, ...position });
  return image;
}

function addBrand(slide, record, { inverse = false } = {}) {
  addText(slide, record, `brand-${record.number}`, 'KRISEVA  /  ATTEST', { left: 56, top: 24, width: 300, height: 24 }, {
    size: 15,
    face: FONT.mono,
    bold: true,
    color: inverse ? COLOR.raised : COLOR.navy,
    role: 'brand',
  });
}

function addFooter(slide, record, { inverse = false } = {}) {
  addRule(slide, record, `footer-rule-${record.number}`, 56, 666, 1168, {
    color: inverse ? COLOR.raised : COLOR.navy,
    weight: 1,
  });
  addText(slide, record, `footer-source-${record.number}`, 'SOURCES IN SPEAKER NOTES · RESEARCH-STAGE PROTOTYPE', { left: 56, top: 678, width: 760, height: 22 }, {
    size: 13,
    face: FONT.mono,
    color: inverse ? COLOR.raised : COLOR.muted,
    role: 'footer',
  });
  addText(slide, record, `footer-page-${record.number}`, `${String(record.number).padStart(2, '0')} / 10`, { left: 1120, top: 678, width: 104, height: 22 }, {
    size: 13,
    face: FONT.mono,
    bold: true,
    align: 'right',
    color: inverse ? COLOR.raised : COLOR.navy,
    role: 'page-label',
  });
}

function addTitle(slide, record, title, { inverse = false } = {}) {
  addBrand(slide, record, { inverse });
  addText(slide, record, `title-${record.number}`, title, { left: 56, top: 60, width: 1168, height: 62 }, {
    size: 38,
    face: FONT.display,
    bold: false,
    color: inverse ? COLOR.raised : COLOR.navy,
    role: 'title',
  });
  addFooter(slide, record, { inverse });
}

function addSources(slide, sources, extraNotes = []) {
  slide.speakerNotes.textFrame.setText([
    ...extraNotes,
    '[Sources]',
    ...sources.map((source) => `- ${source}`),
    '[/Sources]',
  ]);
  slide.speakerNotes.setVisible(true);
}

function splitDot(value) {
  return value.split(' · ').map((part) => part.trim());
}

async function buildCover(presentation, content) {
  const slide = presentation.slides.add();
  slide.background.fill = COLOR.paper;
  const record = beginSlide(content.number, COLOR.paper);
  addRect(slide, record, 'cover-navy-field', { left: 1008, top: 0, width: 272, height: 720 }, { fill: COLOR.navy, line: COLOR.navy, width: 0, role: 'background' });
  addRule(slide, record, 'cover-brass-spine', 1006, 0, 0, { color: COLOR.brass, weight: 2, height: 720 });
  addBrand(slide, record);
  const logoBadge = await buildCoverLogoBadge();
  await addImage(slide, record, 'cover-logo', logoBadge.path, {
    left: 1008 + Math.round((272 - logoBadge.size) / 2),
    top: 44,
    width: logoBadge.size,
    height: logoBadge.size,
  }, { alt: 'KRISEVA monogram' });
  addText(slide, record, 'cover-title', content.title, { left: 64, top: 164, width: 850, height: 96 }, {
    size: 76, face: FONT.display, color: COLOR.navy, role: 'title',
  });
  addText(slide, record, 'cover-subtitle', content.body[0], { left: 68, top: 292, width: 730, height: 86 }, {
    size: 30, face: FONT.display, color: COLOR.ink,
  });
  addRule(slide, record, 'cover-rule', 68, 412, 560, { color: COLOR.brass, weight: 2 });
  addText(slide, record, 'cover-lock', content.body[1], { left: 68, top: 438, width: 650, height: 96 }, {
    size: 22, bold: true, color: COLOR.navy,
  });
  addText(slide, record, 'cover-boundary', content.body[2], { left: 68, top: 546, width: 820, height: 54 }, {
    size: 18, face: FONT.mono, color: COLOR.muted,
  });
  addText(slide, record, 'cover-number', '01', { left: 1034, top: 164, width: 190, height: 128 }, {
    size: 108, face: FONT.display, color: COLOR.brass, role: 'page-label',
  });
  addText(slide, record, 'cover-classification', 'GIFT IFIH\nYOUNG BUILDERS\n2026', { left: 1038, top: 330, width: 190, height: 120 }, {
    size: 18, face: FONT.mono, bold: true, color: COLOR.raised, role: 'footer',
  });
  addText(slide, record, 'cover-page', 'APPLICATION EVIDENCE', { left: 1038, top: 620, width: 190, height: 34 }, {
    size: 14, face: FONT.mono, color: COLOR.raised, role: 'footer',
  });
  addText(slide, record, 'footer-cover-url', 'ayushtiwary-ops.github.io\n/kriseva-attest', { left: 1038, top: 660, width: 200, height: 40 }, {
    size: 12, face: FONT.mono, color: COLOR.raised, role: 'footer',
  });
  addSources(slide, content.sources, content.speakerNotes ?? []);
}

async function buildAccountability(presentation, content) {
  const slide = presentation.slides.add();
  slide.background.fill = COLOR.paper;
  const record = beginSlide(content.number, COLOR.paper);
  addTitle(slide, record, content.title);
  addRule(slide, record, 'accountability-divider', 704, 150, 0, { color: COLOR.brass, weight: 2, height: 430 });
  addText(slide, record, 'accountability-label', content.body[0], { left: 64, top: 154, width: 500, height: 28 }, {
    size: 16, face: FONT.mono, bold: true, color: COLOR.brass,
  });
  addText(slide, record, 'accountability-structured', content.body[1], { left: 64, top: 198, width: 560, height: 48 }, {
    size: 24, bold: true, color: COLOR.navy,
  });
  addText(slide, record, 'accountability-question', content.body[2], { left: 64, top: 274, width: 580, height: 160 }, {
    size: 48, face: FONT.display, color: COLOR.ink,
  });
  addText(slide, record, 'footer-accountability-caption-1', 'STATEMENT', { left: 760, top: 172, width: 200, height: 18 }, {
    size: 13, face: FONT.mono, bold: true, color: COLOR.brass, role: 'footer',
  });
  addRule(slide, record, 'accountability-source-rule-1', 760, 194, 400, { color: COLOR.rule });
  addText(slide, record, 'footer-accountability-caption-2', 'LEDGER', { left: 760, top: 238, width: 200, height: 18 }, {
    size: 13, face: FONT.mono, bold: true, color: COLOR.brass, role: 'footer',
  });
  addRule(slide, record, 'accountability-source-rule-2', 760, 260, 400, { color: COLOR.rule });
  addText(slide, record, 'footer-accountability-caption-3', 'SCHEDULE', { left: 760, top: 304, width: 200, height: 18 }, {
    size: 13, face: FONT.mono, bold: true, color: COLOR.brass, role: 'footer',
  });
  addRule(slide, record, 'accountability-source-rule-3', 760, 326, 400, { color: COLOR.rule });
  addText(slide, record, 'accountability-evidence', content.body[3], { left: 760, top: 360, width: 410, height: 96 }, {
    size: 24, face: FONT.display, color: COLOR.navy,
  });
  addText(slide, record, 'accountability-unknowns', content.body[4], { left: 760, top: 492, width: 410, height: 92 }, {
    size: 19, color: COLOR.muted,
  });
  addSources(slide, content.sources);
}

async function buildBoundary(presentation, content) {
  const slide = presentation.slides.add();
  slide.background.fill = COLOR.paper;
  const record = beginSlide(content.number, COLOR.paper);
  addTitle(slide, record, content.title);
  addRect(slide, record, 'boundary-left', { left: 0, top: 140, width: 640, height: 526 }, { fill: COLOR.navy, line: COLOR.navy, width: 0, role: 'background' });
  addRule(slide, record, 'boundary-spine', 640, 140, 0, { color: COLOR.brass, weight: 2, height: 526 });
  addText(slide, record, 'boundary-drr', content.body[0], { left: 62, top: 184, width: 500, height: 84 }, {
    size: 64, face: FONT.display, color: COLOR.raised,
  });
  addText(slide, record, 'boundary-drr-copy', content.body[1], { left: 66, top: 292, width: 500, height: 230 }, {
    size: 24, face: FONT.display, color: COLOR.raised,
  });
  addText(slide, record, 'boundary-attest', content.body[2], { left: 704, top: 184, width: 500, height: 84 }, {
    size: 64, face: FONT.display, color: COLOR.navy,
  });
  addText(slide, record, 'boundary-attest-copy', content.body[3], { left: 708, top: 292, width: 500, height: 120 }, {
    size: 27, face: FONT.display, color: COLOR.ink,
  });
  addText(slide, record, 'boundary-limit', content.body[4], { left: 708, top: 478, width: 500, height: 78 }, {
    size: 22, bold: true, color: COLOR.rust,
  });
  addText(slide, record, 'boundary-absence', content.body[5], { left: 708, top: 566, width: 500, height: 48 }, {
    size: 22, bold: true, color: COLOR.brass,
  });
  addSources(slide, content.sources);
}

async function buildCaseLedger(presentation, content) {
  const slide = presentation.slides.add();
  slide.background.fill = COLOR.raised;
  const record = beginSlide(content.number, COLOR.raised);
  addTitle(slide, record, content.title);
  const [entity, period, marker] = splitDot(content.body[0]);
  addText(slide, record, 'case-entity', entity, { left: 62, top: 172, width: 340, height: 170 }, {
    size: 34, face: FONT.display, color: COLOR.navy,
  });
  addText(slide, record, 'case-period', period, { left: 64, top: 374, width: 330, height: 34 }, {
    size: 20, face: FONT.mono, bold: true, color: COLOR.ink,
  });
  addText(slide, record, 'case-marker', marker.toUpperCase(), { left: 64, top: 424, width: 330, height: 34 }, {
    size: 16, face: FONT.mono, bold: true, color: COLOR.brass,
  });
  addRule(slide, record, 'case-divider', 430, 152, 0, { color: COLOR.navy, height: 452 });

  const rowColors = [COLOR.green, COLOR.rust, COLOR.muted];
  content.body.slice(1).forEach((row, index) => {
    const [label, status, description] = splitDot(row);
    const top = 164 + (index * 142);
    addRule(slide, record, `case-row-rule-${index + 1}`, 478, top + 118, 720, { color: COLOR.rule });
    addText(slide, record, `case-row-status-${index + 1}`, status, { left: 478, top, width: 220, height: 26 }, {
      size: 16, face: FONT.mono, bold: true, color: rowColors[index],
    });
    addText(slide, record, `case-row-label-${index + 1}`, label, { left: 478, top: top + 32, width: 310, height: 48 }, {
      size: 29, face: FONT.display, color: COLOR.navy,
    });
    addText(slide, record, `case-row-copy-${index + 1}`, description, { left: 818, top: top + 38, width: 380, height: 62 }, {
      size: 21, color: COLOR.ink,
    });
  });
  addSources(slide, content.sources);
}

async function buildWorkflow(presentation, content) {
  const slide = presentation.slides.add();
  slide.background.fill = COLOR.paper;
  const record = beginSlide(content.number, COLOR.paper);
  addTitle(slide, record, content.title);
  addRule(slide, record, 'workflow-rail', 92, 334, 1090, { color: COLOR.navy, weight: 1 });
  content.body.forEach((step, index) => {
    const left = 66 + (index * 232);
    const above = index % 2 === 0;
    addRule(slide, record, `workflow-tick-${index + 1}`, left + 36, 314, 0, { color: COLOR.brass, weight: 3, height: 40 });
    addText(slide, record, `workflow-step-${index + 1}`, step, {
      left,
      top: above ? 190 : 390,
      width: 205,
      height: 106,
    }, {
      size: 21,
      face: FONT.display,
      color: COLOR.navy,
    });
  });
  addSources(slide, content.sources);
}

async function buildAgentBoundary(presentation, content) {
  const slide = presentation.slides.add();
  slide.background.fill = COLOR.navy;
  const record = beginSlide(content.number, COLOR.navy);
  addTitle(slide, record, content.title, { inverse: true });
  addText(slide, record, 'agent-trace-label', content.body[0], { left: 64, top: 150, width: 640, height: 28 }, {
    size: 16, face: FONT.mono, bold: true, color: COLOR.brass,
  });
  addRule(slide, record, 'agent-trace-spine', 286, 206, 0, { color: COLOR.brass, weight: 2, height: 390 });
  const [propose, proposeCopy] = splitDot(content.body[1]);
  const [abstain, abstainCopy] = splitDot(content.body[2]);
  const [decide, decideCopy] = splitDot(content.body[3]);
  addText(slide, record, 'agent-propose', propose, { left: 64, top: 220, width: 190, height: 34 }, { size: 20, face: FONT.mono, bold: true, color: COLOR.brass });
  addText(slide, record, 'agent-propose-copy', proposeCopy, { left: 330, top: 214, width: 470, height: 60 }, { size: 25, face: FONT.display, color: COLOR.raised });
  addText(slide, record, 'agent-abstain', abstain, { left: 64, top: 340, width: 200, height: 70 }, { size: 46, face: FONT.display, color: COLOR.raised });
  addText(slide, record, 'agent-abstain-copy', abstainCopy, { left: 330, top: 344, width: 470, height: 60 }, { size: 25, face: FONT.display, color: COLOR.raised });
  addText(slide, record, 'agent-decide', decide, { left: 64, top: 506, width: 190, height: 34 }, { size: 20, face: FONT.mono, bold: true, color: COLOR.brass });
  addText(slide, record, 'agent-decide-copy', decideCopy, { left: 330, top: 494, width: 470, height: 84 }, { size: 25, face: FONT.display, color: COLOR.raised });
  addRule(slide, record, 'agent-boundary-rule', 856, 214, 300, { color: COLOR.brass, weight: 2 });
  addText(slide, record, 'agent-boundary-copy', content.body[4], { left: 856, top: 256, width: 300, height: 260 }, {
    size: 26, face: FONT.display, color: COLOR.brass,
  });
  addSources(slide, content.sources);
}

async function buildPrototypeProof(presentation, content) {
  const slide = presentation.slides.add();
  slide.background.fill = COLOR.paper;
  const record = beginSlide(content.number, COLOR.paper);
  addTitle(slide, record, content.title);
  addText(slide, record, 'prototype-proof-label', content.body[0], { left: 60, top: 134, width: 340, height: 24 }, {
    size: 16, face: FONT.mono, bold: true, color: COLOR.brass,
  });
  await addImage(slide, record, 'prototype-conflict', 'repo:artifacts/prototype-conflict-1440.png', { left: 103, top: 170, width: 378, height: 385 }, {
    alt: 'Current KRISEVA ATTEST candidate comparison card showing both synthetic source values, their exact references and input fingerprints',
    pixelCrop: { left: 337, top: 860, width: 695, height: 708 },
  });
  addRect(slide, record, 'prototype-conflict-border', { left: 103, top: 170, width: 378, height: 385 }, { fill: 'none', line: COLOR.navy, width: 1, role: 'image-border' });
  await addImage(slide, record, 'prototype-receipt', 'repo:artifacts/prototype-receipt-1440.png', { left: 521, top: 170, width: 656, height: 385 }, {
    alt: 'Current KRISEVA ATTEST evidence receipt showing the reviewer decision reason, recorded timestamp and Confirming Principal Officer confirmation',
    pixelCrop: { left: 224, top: 1855, width: 750, height: 440 },
  });
  addRect(slide, record, 'prototype-receipt-border', { left: 521, top: 170, width: 656, height: 385 }, { fill: 'none', line: COLOR.navy, width: 1, role: 'image-border' });
  const calloutWidths = [210, 210, 340, 290];
  let left = 60;
  content.body.slice(1).forEach((copy, index) => {
    addText(slide, record, `prototype-callout-${index + 1}`, copy, { left, top: 570, width: calloutWidths[index], height: 62 }, {
      size: 17,
      bold: index < 2,
      color: index === 3 ? COLOR.rust : COLOR.navy,
    });
    left += calloutWidths[index] + 14;
  });
  addSources(slide, content.sources);
}

function addTableCell(slide, record, name, text, left, top, width, height, options = {}) {
  return addText(slide, record, name, text, { left, top, width, height }, {
    size: options.size ?? 21,
    face: options.face ?? FONT.body,
    bold: options.bold ?? false,
    color: options.color ?? COLOR.ink,
    align: options.align ?? 'left',
    vertical: 'middle',
    insets: { top: 0, right: 10, bottom: 0, left: 10 },
  });
}

async function buildSensitivity(presentation, content) {
  const slide = presentation.slides.add();
  slide.background.fill = COLOR.raised;
  const record = beginSlide(content.number, COLOR.raised);
  addTitle(slide, record, content.title);
  addText(slide, record, 'sensitivity-label', content.body[0], { left: 60, top: 142, width: 500, height: 26 }, {
    size: 16, face: FONT.mono, bold: true, color: COLOR.brass,
  });
  const rows = [['ENTITIES', ...splitDot(content.body[1])], ...content.body.slice(2, 4).map(splitDot)];
  const colWidths = [150, 200, 200];
  const rowHeight = 84;
  const tableLeft = 60;
  const tableTop = 184;
  for (let row = 0; row < rows.length; row += 1) {
    const top = tableTop + (row * rowHeight);
    addRule(slide, record, `sensitivity-row-${row}`, tableLeft, top + rowHeight, 550, { color: COLOR.rule });
    let left = tableLeft;
    rows[row].forEach((cell, col) => {
      addTableCell(slide, record, `sensitivity-${row}-${col}`, cell, left, top, colWidths[col], rowHeight, {
        size: row === 0 ? 18 : 30,
        face: row === 0 ? FONT.mono : FONT.display,
        bold: row === 0 || col === 0,
        color: row === 0 ? COLOR.muted : COLOR.navy,
        align: col === 0 ? 'left' : 'right',
      });
      left += colWidths[col];
    });
  }
  addRule(slide, record, 'sensitivity-divider', 714, 160, 0, { color: COLOR.brass, weight: 2, height: 410 });
  addText(slide, record, 'sensitivity-gates', content.body[4], { left: 766, top: 190, width: 420, height: 140 }, {
    size: 24, face: FONT.display, color: COLOR.navy,
  });
  addText(slide, record, 'footer-sensitivity-hypothesis-label', 'HYPOTHESIS', { left: 766, top: 344, width: 420, height: 20 }, {
    size: 14, face: FONT.mono, bold: true, color: COLOR.rust, role: 'footer',
  });
  addText(slide, record, 'sensitivity-hypothesis', content.body[5], { left: 766, top: 368, width: 420, height: 110 }, {
    size: 19, face: FONT.body, italic: true, color: COLOR.rust,
  });
  addText(slide, record, 'sensitivity-disclaimer', content.body[6], { left: 766, top: 494, width: 420, height: 44 }, {
    size: 20, face: FONT.display, color: COLOR.muted,
  });
  addSources(slide, content.sources);
}

async function buildOwnership(presentation, content) {
  const slide = presentation.slides.add();
  slide.background.fill = COLOR.paper;
  const record = beginSlide(content.number, COLOR.paper);
  addTitle(slide, record, content.title);
  addRule(slide, record, 'ownership-divider', 640, 166, 0, { color: COLOR.brass, weight: 2, height: 342 });
  addText(slide, record, 'ownership-ayush-label', content.body[0], { left: 66, top: 182, width: 500, height: 28 }, {
    size: 16, face: FONT.mono, bold: true, color: COLOR.brass,
  });
  addText(slide, record, 'ownership-ayush-copy', content.body[1], { left: 66, top: 244, width: 500, height: 270 }, {
    size: 28, face: FONT.display, color: COLOR.navy,
  });
  addText(slide, record, 'ownership-finance-label', content.body[2], { left: 700, top: 182, width: 500, height: 50 }, {
    size: 16, face: FONT.mono, bold: true, color: COLOR.brass,
  });
  addText(slide, record, 'ownership-finance-copy', content.body[3], { left: 700, top: 250, width: 500, height: 180 }, {
    size: 29, face: FONT.display, color: COLOR.navy,
  });
  addRect(slide, record, 'ownership-gate-band', { left: 60, top: 532, width: 1160, height: 84 }, { fill: COLOR.navy, line: COLOR.navy, width: 0, role: 'background' });
  addText(slide, record, 'ownership-gate', content.body[4], { left: 84, top: 552, width: 1110, height: 46 }, {
    size: 21, bold: true, color: COLOR.raised,
  });
  addSources(slide, content.sources);
}

async function buildProgrammeAsk(presentation, content) {
  const slide = presentation.slides.add();
  slide.background.fill = COLOR.navy;
  const record = beginSlide(content.number, COLOR.navy);
  addTitle(slide, record, content.title, { inverse: true });
  addRule(slide, record, 'ask-spine', 540, 164, 0, { color: COLOR.brass, weight: 2, height: 420 });
  const [access, accessCopy] = splitDot(content.body[0]);
  const [challenge, challengeCopy] = splitDot(content.body[1]);
  const [testLabel, testCopy] = splitDot(content.body[2]);
  const [decide, decideCopy] = splitDot(content.body[3]);
  addText(slide, record, 'ask-access-label', access, { left: 62, top: 178, width: 420, height: 30 }, { size: 16, face: FONT.mono, bold: true, color: COLOR.brass });
  addText(slide, record, 'ask-access-copy', accessCopy, { left: 62, top: 226, width: 420, height: 220 }, { size: 30, face: FONT.display, color: COLOR.raised });
  addText(slide, record, 'ask-falsify', content.body[4], { left: 62, top: 470, width: 400, height: 94 }, { size: 26, face: FONT.display, color: COLOR.raised });
  addText(slide, record, 'ask-challenge-label', challenge, { left: 602, top: 178, width: 560, height: 30 }, { size: 16, face: FONT.mono, bold: true, color: COLOR.brass });
  addText(slide, record, 'ask-challenge-copy', challengeCopy, { left: 602, top: 222, width: 580, height: 112 }, { size: 28, face: FONT.display, color: COLOR.raised });
  addText(slide, record, 'ask-test-label', testLabel, { left: 602, top: 370, width: 180, height: 30 }, { size: 16, face: FONT.mono, bold: true, color: COLOR.brass });
  addText(slide, record, 'ask-test-copy', testCopy, { left: 602, top: 408, width: 560, height: 74 }, { size: 23, color: COLOR.raised });
  addText(slide, record, 'ask-decide-label', decide, { left: 602, top: 520, width: 180, height: 30 }, { size: 16, face: FONT.mono, bold: true, color: COLOR.brass });
  addText(slide, record, 'ask-decide-copy', decideCopy, { left: 760, top: 514, width: 400, height: 50 }, { size: 28, face: FONT.display, color: COLOR.brass });
  addText(slide, record, 'footer-ask-links', 'Live: ayushtiwary-ops.github.io/kriseva-attest  ·  Code: github.com/ayushtiwary-ops/kriseva-attest', { left: 62, top: 628, width: 1120, height: 24 }, {
    size: 13, face: FONT.mono, color: COLOR.raised, role: 'footer',
  });
  addSources(slide, content.sources);
}

const builders = [
  buildCover,
  buildAccountability,
  buildBoundary,
  buildCaseLedger,
  buildWorkflow,
  buildAgentBoundary,
  buildPrototypeProof,
  buildSensitivity,
  buildOwnership,
  buildProgrammeAsk,
];

function auditLayouts(contract) {
  return layoutRegistry.map((slide) => {
    const offCanvas = slide.elements.filter((element) => (
      element.left < 0 || element.top < 0 ||
      element.left + element.width > SLIDE.width ||
      element.top + element.height > SLIDE.height
    )).map(({ name }) => name);
    const content = contract.slides.find(({ number }) => number === slide.number);
    return {
      number: slide.number,
      offCanvas,
      bodyWordCount: countWords(content.body.join(' ')),
      titleFontSize: slide.elements.find(({ role }) => role === 'title')?.fontSize,
      minimumBodyFontSize: Math.min(...slide.elements.filter(({ role }) => role === 'body').map(({ fontSize }) => fontSize)),
      elementCount: slide.elements.length,
    };
  });
}

async function fileHash(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

async function main() {
  const { Presentation, PresentationFile } = await importArtifactTool();
  const contract = parseContract(await readFile(contentPath, 'utf8'));
  await mkdir(artifactDir, { recursive: true });
  await mkdir(dirname(pptxPath), { recursive: true });

  for (const content of contract.slides) {
    const words = countWords(content.body.join(' '));
    if (words > 40) throw new Error(`Slide ${content.number} has ${words} body words; maximum is 40.`);
  }

  const presentation = Presentation.create({ slideSize: SLIDE });
  for (let index = 0; index < builders.length; index += 1) {
    await builders[index](presentation, contract.slides[index]);
  }

  for (const [index, slide] of presentation.slides.items.entries()) {
    const layout = await slide.export({ format: 'layout' });
    await writeFile(resolve(artifactDir, `layout-${String(index + 1).padStart(2, '0')}.json`), await layout.text());
  }

  const layoutAudit = auditLayouts(contract);
  if (layoutAudit.some(({ offCanvas }) => offCanvas.length > 0)) {
    throw new Error(`Off-canvas deck elements: ${JSON.stringify(layoutAudit)}`);
  }
  await writeFile(resolve(artifactDir, 'layout-audit.json'), `${JSON.stringify({ slideSize: SLIDE, slides: layoutAudit }, null, 2)}\n`);

  const screenshotPaths = [
    resolve(projectRoot, 'artifacts/prototype-conflict-1440.png'),
    resolve(projectRoot, 'artifacts/prototype-receipt-1440.png'),
  ];
  const manifest = {
    product: 'KRISEVA ATTEST',
    slideSize: SLIDE,
    editableSource: 'scripts/build-deck.mjs',
    contentContract: 'deck/DECK_CONTENT.md',
    visualSystem: { colors: COLOR, fonts: FONT, maxRadius: 2, gradients: false },
    reproducibility: REPRODUCIBILITY,
    slides: contract.slides.map((slide) => ({
      number: slide.number,
      title: slide.title,
      body: slide.body,
      bodyWordCount: countWords(slide.body.join(' ')),
      sources: slide.sources,
    })),
    embeddedScreenshots: await Promise.all(screenshotPaths.map(async (filePath) => ({
      path: `artifacts/${basename(filePath)}`,
      sha256: await fileHash(filePath),
    }))),
  };
  await writeFile(resolve(artifactDir, 'deck-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const pptx = await PresentationFile.exportPptx(presentation);
  await pptx.save(pptxPath);
  await fs.promises.rm(`${pptxPath}.inspect.ndjson`, { force: true });
  console.log(JSON.stringify({ pptx: pptxPath, slideCount: contract.slides.length, artifactDir }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
