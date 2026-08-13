import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { installLocalRoute, LOCAL_ORIGIN } from './local-route.mjs';
import {
  VIDEO_SCENES,
  assertCaptionSourceMatches,
  splitNarrationByScene,
} from './video-scene-contract.mjs';

const projectRoot = resolve(import.meta.dirname, '..');
const outputRoot = resolve(process.argv[2] ?? '');

if (!process.argv[2]) {
  throw new Error('Usage: node scripts/build-video-scenes.mjs <temporary-output-directory>');
}

const palette = {
  paper: '#DED6C9',
  raised: '#F3EDE0',
  navy: '#0A1F44',
  ink: '#0F0E0B',
  brass: '#A87229',
  brassLight: '#D8A753',
  rule: '#6E6A62',
};
const titleColumnWidth = 380;
const titleFontSize = 44;
const totalSceneCount = VIDEO_SCENES.length;

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function textLines(lines, { x, y, gap, size, family, weight = 400, fill }) {
  return lines.map((line, index) => (
    `<text x="${x}" y="${y + index * gap}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(line)}</text>`
  )).join('');
}

// --- Layout: side-rail (screenshot + right-hand statement rail) --------
function sideRailSvg(scene) {
  const sceneLabel = String(scene.id).padStart(2, '0');
  const titleRuleY = 330 + scene.title.length * 55;
  const sideStartY = titleRuleY + 62;
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
      <rect x="0" y="0" width="1920" height="1080" fill="none"/>
      <rect x="72" y="62" width="1776" height="2" fill="${palette.navy}"/>
      <text x="72" y="112" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="3" fill="${palette.navy}">KRISEVA <tspan fill="${palette.brass}">ATTEST</tspan></text>
      <text x="1848" y="112" text-anchor="end" font-family="Courier New, monospace" font-size="19" font-weight="700" letter-spacing="2" fill="${palette.navy}">${escapeXml(sceneLabel)} / ${String(totalSceneCount).padStart(2, '0')} · RESEARCH-STAGE PROTOTYPE</text>
      <rect x="70" y="148" width="1284" height="734" fill="none" stroke="${palette.navy}" stroke-width="2"/>
      <rect x="1388" y="148" width="460" height="734" fill="${palette.navy}"/>
      <rect x="1428" y="190" width="380" height="4" fill="${palette.brass}"/>
      <text x="1428" y="238" font-family="Courier New, monospace" font-size="20" font-weight="700" letter-spacing="2" fill="${palette.brassLight}">${escapeXml(scene.eyebrow)}</text>
      ${textLines(scene.title, { x: 1428, y: 310, gap: 55, size: titleFontSize, family: 'Georgia, serif', weight: 700, fill: palette.raised })}
      <rect x="1428" y="${titleRuleY}" width="${titleColumnWidth}" height="1" fill="#8FA0BD"/>
      ${textLines(scene.side, { x: 1428, y: sideStartY, gap: 68, size: 25, family: 'Helvetica, Arial, sans-serif', weight: 600, fill: palette.raised })}
      <text x="1428" y="820" font-family="Courier New, monospace" font-size="17" font-weight="700" letter-spacing="1.5" fill="${palette.brassLight}">SYNTHETIC DEMO DATA</text>
      <rect x="72" y="914" width="1776" height="108" fill="${palette.raised}" stroke="${palette.navy}" stroke-width="2"/>
      <text x="108" y="978" font-family="Helvetica, Arial, sans-serif" font-size="31" font-weight="600" fill="${palette.ink}">${escapeXml(scene.caption)}</text>
      <text x="72" y="1055" font-family="Courier New, monospace" font-size="17" font-weight="700" letter-spacing="1.5" fill="${palette.navy}">NOT A REGULATORY FILING · NOT CONNECTED TO IFSCA SYSTEMS · HUMAN DECISION REQUIRED</text>
    </svg>
  `);
}

// --- Layout: cold open (full-frame, two conflicting values) ------------
function coldOpenSvg(scene) {
  const [valueA, valueB] = scene.values;
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
      <rect x="0" y="0" width="1920" height="1080" fill="${palette.paper}"/>
      <rect x="72" y="62" width="1776" height="2" fill="${palette.navy}"/>
      <text x="72" y="112" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="3" fill="${palette.navy}">KRISEVA <tspan fill="${palette.brass}">ATTEST</tspan></text>
      <text x="1848" y="112" text-anchor="end" font-family="Courier New, monospace" font-size="19" font-weight="700" letter-spacing="2" fill="${palette.navy}">${escapeXml(scene.eyebrow)}</text>
      ${textLines(scene.statement, { x: 72, y: 260, gap: 78, size: 66, family: 'Georgia, serif', weight: 700, fill: palette.ink })}
      <g>
        <rect x="72" y="470" width="820" height="300" fill="${palette.raised}" stroke="${palette.navy}" stroke-width="2"/>
        <rect x="72" y="470" width="8" height="300" fill="${palette.brass}"/>
        <text x="116" y="530" font-family="Courier New, monospace" font-size="18" font-weight="700" letter-spacing="1.5" fill="${palette.rule}">${escapeXml(valueA.label.toUpperCase())}</text>
        <text x="116" y="640" font-family="Georgia, serif" font-size="58" font-weight="700" fill="${palette.navy}">${escapeXml(valueA.value)}</text>
        <text x="116" y="705" font-family="Courier New, monospace" font-size="16" font-weight="700" letter-spacing="1.5" fill="${palette.brass}">CANDIDATE A</text>
      </g>
      <g>
        <rect x="1028" y="470" width="820" height="300" fill="${palette.navy}"/>
        <rect x="1028" y="470" width="8" height="300" fill="${palette.brassLight}"/>
        <text x="1072" y="530" font-family="Courier New, monospace" font-size="18" font-weight="700" letter-spacing="1.5" fill="#B9C4D8">${escapeXml(valueB.label.toUpperCase())}</text>
        <text x="1072" y="640" font-family="Georgia, serif" font-size="58" font-weight="700" fill="${palette.raised}">${escapeXml(valueB.value)}</text>
        <text x="1072" y="705" font-family="Courier New, monospace" font-size="16" font-weight="700" letter-spacing="1.5" fill="${palette.brassLight}">CANDIDATE B</text>
      </g>
      <text x="960" y="640" text-anchor="middle" font-family="Georgia, serif" font-size="30" font-weight="700" font-style="italic" fill="${palette.brass}">vs</text>
      <text x="72" y="850" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="600" fill="${palette.ink}">${escapeXml(scene.question)}</text>
      <rect x="72" y="914" width="1776" height="108" fill="${palette.raised}" stroke="${palette.navy}" stroke-width="2"/>
      <text x="108" y="960" font-family="Courier New, monospace" font-size="18" font-weight="700" letter-spacing="1.5" fill="${palette.brass}">SYNTHETIC DEMO DATA · MERIDIAN HORIZON FUND I</text>
      <text x="108" y="998" font-family="Helvetica, Arial, sans-serif" font-size="24" font-weight="600" fill="${palette.ink}">A fictional committed-capital field, two source statements, one human decision.</text>
      <text x="72" y="1055" font-family="Courier New, monospace" font-size="17" font-weight="700" letter-spacing="1.5" fill="${palette.navy}">NOT A REGULATORY FILING · NOT CONNECTED TO IFSCA SYSTEMS · HUMAN DECISION REQUIRED</text>
    </svg>
  `);
}

// --- Layout: end card (calm lockup, no empty panels) --------------------
function endCardSvg(scene) {
  const lineGap = 46;
  const linesStartY = 700;
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
      <rect x="0" y="0" width="1920" height="1080" fill="${palette.navy}"/>
      <rect x="96" y="96" width="1728" height="888" fill="none" stroke="${palette.brassLight}" stroke-width="2"/>
      <text x="960" y="330" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="700" letter-spacing="6" fill="${palette.raised}">KRISEVA <tspan fill="${palette.brassLight}">ATTEST</tspan></text>
      <rect x="810" y="368" width="300" height="3" fill="${palette.brassLight}"/>
      <text x="960" y="440" text-anchor="middle" font-family="Courier New, monospace" font-size="22" font-weight="700" letter-spacing="2" fill="#B9C4D8">${escapeXml(scene.url)}</text>
      <text x="960" y="600" text-anchor="middle" font-family="Georgia, serif" font-size="30" font-weight="700" fill="${palette.raised}">A deterministic, human-accountable evidence harness</text>
      ${scene.lines.map((line, index) => (
        `<text x="960" y="${linesStartY + index * lineGap}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="26" font-weight="600" fill="#D9E0EC">${escapeXml(line)}</text>`
      )).join('')}
      <rect x="710" y="920" width="500" height="2" fill="#3E5178"/>
      <text x="960" y="972" text-anchor="middle" font-family="Courier New, monospace" font-size="17" font-weight="700" letter-spacing="1.5" fill="${palette.brassLight}">RESEARCH-STAGE PROTOTYPE · SYNTHETIC DEMO DATA</text>
    </svg>
  `);
}

// --- Caption band for full-bleed recording scenes -----------------------
// The recording is captured at 1920x914; this 1920x166 band is composited
// beneath it (by build-video.sh) to fill the 1920x1080 canvas, matching the
// paper/navy/brass caption language used by the design scenes above.
function recordingBandSvg(scene) {
  const sceneLabel = String(scene.id).padStart(2, '0');
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1920" height="166" viewBox="0 0 1920 166">
      <rect x="0" y="0" width="1920" height="166" fill="${palette.raised}"/>
      <rect x="0" y="0" width="1920" height="2" fill="${palette.navy}"/>
      <text x="72" y="40" font-family="Courier New, monospace" font-size="18" font-weight="700" letter-spacing="2" fill="${palette.brass}">${escapeXml(sceneLabel)} / ${String(totalSceneCount).padStart(2, '0')} · ${escapeXml(scene.eyebrow.split('·')[1]?.trim() ?? scene.eyebrow)} · LIVE PROTOTYPE RECORDING</text>
      <text x="72" y="88" font-family="Helvetica, Arial, sans-serif" font-size="29" font-weight="600" fill="${palette.ink}">${escapeXml(scene.caption)}</text>
      <text x="72" y="136" font-family="Courier New, monospace" font-size="16" font-weight="700" letter-spacing="1.5" fill="${palette.navy}">NOT A REGULATORY FILING · SYNTHETIC REVIEWER AND OFFICER · NO REGULATOR CONNECTION</text>
    </svg>
  `);
}

async function measureTitleLine(line) {
  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1000" height="90">
      <text x="0" y="64" font-family="Georgia, serif" font-size="${titleFontSize}" font-weight="700" fill="#ffffff">${escapeXml(line)}</text>
    </svg>
  `);
  const { info } = await sharp(svg).trim({ background: '#00000000' }).png().toBuffer({ resolveWithObject: true });
  return info.width;
}

async function captureGeneratedRoute(route) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
      colorScheme: 'light',
      reducedMotion: 'reduce',
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata',
    });
    await installLocalRoute(page, projectRoot);
    const response = await page.goto(`${LOCAL_ORIGIN}${route}`);
    if (response?.status() !== 200) {
      throw new Error(`Video source route returned ${response?.status() ?? 'no response'}: ${route}`);
    }
    await page.evaluate(() => document.fonts.ready);
    return await page.screenshot({ fullPage: true, animations: 'disabled' });
  } finally {
    await browser.close();
  }
}

async function resolveSceneSource(sourceSpec, generatedRoutes) {
  if (sourceSpec.kind === 'tracked-image') {
    return resolve(projectRoot, sourceSpec.path);
  }
  if (sourceSpec.kind === 'generated-route') {
    if (!generatedRoutes.has(sourceSpec.route)) {
      generatedRoutes.set(sourceSpec.route, await captureGeneratedRoute(sourceSpec.route));
    }
    return generatedRoutes.get(sourceSpec.route);
  }
  throw new Error(`Unsupported video source kind: ${sourceSpec.kind}`);
}

async function buildSideRailScene(scene, sourceInput) {
  const metadata = await sharp(sourceInput).metadata();
  const cropTop = scene.cropTop ?? 0;
  const cropHeight = Math.min(820, metadata.height - cropTop);
  if (cropHeight < 500) throw new Error(`Scene ${scene.id} has an invalid crop`);

  const screen = await sharp(sourceInput)
    .extract({ left: 0, top: cropTop, width: metadata.width, height: cropHeight })
    .resize(1280, 730, { fit: 'cover', position: 'top' })
    .png()
    .toBuffer();

  await sharp({
    create: { width: 1920, height: 1080, channels: 4, background: palette.paper },
  })
    .composite([
      { input: screen, left: 72, top: 150 },
      { input: sideRailSvg(scene), left: 0, top: 0 },
    ])
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toFile(resolve(outputRoot, `scene-${String(scene.id).padStart(2, '0')}.png`));
}

async function buildDesignOnlyScene(scene, svgBuffer) {
  await sharp(svgBuffer)
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toFile(resolve(outputRoot, `scene-${String(scene.id).padStart(2, '0')}.png`));
}

await mkdir(outputRoot, { recursive: true });
const [narrationSource, captionSource] = await Promise.all([
  readFile(resolve(projectRoot, 'video/narration.txt'), 'utf8'),
  readFile(resolve(projectRoot, 'video/captions.srt'), 'utf8'),
]);
const narration = splitNarrationByScene(narrationSource, VIDEO_SCENES);
assertCaptionSourceMatches(captionSource, VIDEO_SCENES);

const sceneReceipt = [];
const generatedRoutes = new Map();
for (const [index, scene] of VIDEO_SCENES.entries()) {
  const sourceSpec = scene.source;
  let titleLineWidths = [];

  if (scene.kind === 'recording') {
    await sharp(recordingBandSvg(scene))
      .png({ compressionLevel: 9, adaptiveFiltering: false })
      .toFile(resolve(outputRoot, `scene-${String(scene.id).padStart(2, '0')}-band.png`));
  } else if (scene.layout === 'side-rail') {
    await buildSideRailScene(scene, await resolveSceneSource(sourceSpec, generatedRoutes));
    titleLineWidths = await Promise.all(scene.title.map(measureTitleLine));
  } else if (scene.layout === 'cold-open') {
    await buildDesignOnlyScene(scene, coldOpenSvg(scene));
  } else if (scene.layout === 'end-card') {
    await buildDesignOnlyScene(scene, endCardSvg(scene));
  } else {
    throw new Error(`Unsupported scene layout for scene ${scene.id}: ${scene.layout}`);
  }

  await writeFile(resolve(outputRoot, `scene-${String(scene.id).padStart(2, '0')}.txt`), `${narration[index].text}\n`);
  sceneReceipt.push({
    id: scene.id,
    duration: scene.duration,
    kind: scene.kind,
    layout: scene.layout ?? null,
    caption: scene.caption,
    narrationMarker: scene.narrationMarker,
    sourceKind: sourceSpec.kind,
    source: sourceSpec,
    titleColumnWidth: scene.layout === 'side-rail' ? titleColumnWidth : null,
    titleLineWidths,
  });
}

await writeFile(resolve(outputRoot, 'scenes.json'), `${JSON.stringify(sceneReceipt, null, 2)}\n`);
process.stdout.write(`Built ${VIDEO_SCENES.length} deterministic video scenes.\n`);
