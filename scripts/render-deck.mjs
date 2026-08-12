import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const run = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const deckDir = resolve(projectRoot, 'deck');
const artifactDir = resolve(projectRoot, 'artifacts/deck');
const pptxPath = resolve(deckDir, 'KRISEVA_ATTEST_GIFT_2026.pptx');
const pdfPath = resolve(deckDir, 'KRISEVA_ATTEST_GIFT_2026.pdf');
const defaultWorkspace = resolve(projectRoot, '.tmp/artifact-tool-workspace');

async function importArtifactTool() {
  try {
    return await import('@oai/artifact-tool');
  } catch {
    // Resolve from the initialized, ignored presentation workspace below.
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
  throw new Error('Unable to resolve @oai/artifact-tool. Initialize .tmp/artifact-tool-workspace or set ATTEST_ARTIFACT_WORKSPACE.');
}

async function saveBlob(outputPath, blob) {
  await writeFile(outputPath, Buffer.from(await blob.arrayBuffer()));
}

function slidesFromPresentation(presentation) {
  if (Array.isArray(presentation.slides?.items)) return presentation.slides.items;
  if (Number.isInteger(presentation.slides?.count) && typeof presentation.slides.getItem === 'function') {
    return Array.from({ length: presentation.slides.count }, (_, index) => presentation.slides.getItem(index));
  }
  throw new Error('Could not enumerate imported presentation slides.');
}

async function renderSlides() {
  const { FileBlob, PresentationFile } = await importArtifactTool();
  const presentation = await PresentationFile.importPptx(await FileBlob.load(pptxPath));
  const slides = slidesFromPresentation(presentation);
  if (slides.length !== 10) throw new Error(`Expected 10 slides, found ${slides.length}.`);

  const paths = [];
  for (let index = 0; index < slides.length; index += 1) {
    const outputPath = resolve(artifactDir, `slide-${String(index + 1).padStart(2, '0')}.png`);
    await saveBlob(outputPath, await presentation.export({ slide: slides[index], format: 'png', scale: 1 }));
    const metadata = await sharp(outputPath).metadata();
    if (metadata.width !== 1280 || metadata.height !== 720) {
      throw new Error(`${outputPath} rendered at ${metadata.width}x${metadata.height}; expected 1280x720.`);
    }
    paths.push(outputPath);
  }
  return paths;
}

async function createMontage(slidePaths) {
  const thumb = { width: 384, height: 216 };
  const gap = 20;
  const columns = 3;
  const rows = Math.ceil(slidePaths.length / columns);
  const width = (columns * thumb.width) + ((columns + 1) * gap);
  const height = (rows * thumb.height) + ((rows + 1) * gap);
  const composites = [];
  for (let index = 0; index < slidePaths.length; index += 1) {
    const input = await sharp(slidePaths[index]).resize(thumb.width, thumb.height).png().toBuffer();
    composites.push({
      input,
      left: gap + ((index % columns) * (thumb.width + gap)),
      top: gap + (Math.floor(index / columns) * (thumb.height + gap)),
    });
  }
  await sharp({ create: { width, height, channels: 3, background: '#0A1F44' } })
    .composite(composites)
    .png()
    .toFile(resolve(artifactDir, 'deck-montage.png'));
}

async function convertPdf() {
  const profileDir = resolve(projectRoot, '.tmp/task7-soffice-profile');
  await mkdir(profileDir, { recursive: true });
  await rm(pdfPath, { force: true });
  await run('soffice', [
    `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
    '--headless',
    '--convert-to',
    'pdf',
    '--outdir',
    deckDir,
    pptxPath,
  ], { maxBuffer: 10 * 1024 * 1024 });
  if (!fs.existsSync(pdfPath)) throw new Error(`LibreOffice did not create ${pdfPath}.`);
  const { stdout } = await run('pdfinfo', [pdfPath]);
  const pages = Number.parseInt(stdout.match(/^Pages:\s+(\d+)$/mu)?.[1] ?? '', 10);
  if (pages !== 10) throw new Error(`Expected a 10-page PDF, found ${pages}.`);
  return pages;
}

async function main() {
  if (!fs.existsSync(pptxPath)) throw new Error(`Build the PPTX first: ${pptxPath}`);
  await mkdir(artifactDir, { recursive: true });
  const slidePaths = await renderSlides();
  await createMontage(slidePaths);
  const pdfPages = await convertPdf();
  const receipt = {
    source: 'deck/KRISEVA_ATTEST_GIFT_2026.pptx',
    renderer: '@oai/artifact-tool',
    slideCount: slidePaths.length,
    slideSize: { width: 1280, height: 720 },
    pdf: 'deck/KRISEVA_ATTEST_GIFT_2026.pdf',
    pdfPages,
    montage: 'artifacts/deck/deck-montage.png',
    reproducibility: {
      contract: 'visual-semantic',
      excludes: [
        'byte-identical PPTX or PDF archives',
        'stable package metadata or internal object IDs',
      ],
    },
  };
  await writeFile(resolve(artifactDir, 'render-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
