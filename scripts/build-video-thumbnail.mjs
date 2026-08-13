// Builds a dedicated 1920x1080 video thumbnail: a purpose-designed card, not
// a frame lifted from the video itself. Uses the same HTML-to-screenshot
// pipeline pattern as the generated-route video scenes (Playwright
// page.setContent + full-page screenshot), so no separate rendering
// technology is introduced for a single static image.
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const outputPath = process.argv[2];
if (!outputPath) {
  throw new Error('Usage: node scripts/build-video-thumbnail.mjs <output-png-path>');
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

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1920px; height: 1080px; background: ${palette.paper}; overflow: hidden; }
  body {
    font-family: Helvetica, Arial, sans-serif;
    color: ${palette.ink};
    position: relative;
  }
  .rule-top {
    position: absolute; left: 72px; right: 72px; top: 62px; height: 2px; background: ${palette.navy};
  }
  .lockup {
    position: absolute; left: 72px; top: 78px;
    font-size: 24px; font-weight: 700; letter-spacing: 4px; color: ${palette.navy};
  }
  .lockup .attest { color: ${palette.brass}; }
  .eyebrow {
    position: absolute; right: 72px; top: 84px;
    font-family: "Courier New", monospace; font-size: 19px; font-weight: 700;
    letter-spacing: 2px; color: ${palette.navy};
  }
  .headline {
    position: absolute; left: 72px; top: 178px; width: 1100px;
    font-family: Georgia, serif; font-weight: 700; font-size: 88px; line-height: 1.14;
    color: ${palette.ink};
  }
  .subhead {
    position: absolute; left: 72px; top: 432px; width: 1400px;
    font-size: 30px; font-weight: 600; color: ${palette.rule};
  }
  .values {
    position: absolute; left: 72px; top: 512px; width: 1776px; height: 320px;
    display: flex; gap: 16px;
  }
  .card {
    flex: 1; position: relative; border: 2px solid ${palette.navy}; padding: 52px 48px;
  }
  .card.a { background: ${palette.raised}; }
  .card.b { background: ${palette.navy}; }
  .card .stripe { position: absolute; left: 0; top: 0; bottom: 0; width: 10px; }
  .card.a .stripe { background: ${palette.brass}; }
  .card.b .stripe { background: ${palette.brassLight}; }
  .card .label {
    font-family: "Courier New", monospace; font-size: 22px; font-weight: 700; letter-spacing: 2px;
  }
  .card.a .label { color: ${palette.rule}; }
  .card.b .label { color: #B9C4D8; }
  .card .value {
    font-family: Georgia, serif; font-weight: 700; font-size: 84px; margin-top: 34px;
  }
  .card.a .value { color: ${palette.navy}; }
  .card.b .value { color: ${palette.raised}; }
  .card .tag {
    position: absolute; bottom: 40px; left: 48px;
    font-family: "Courier New", monospace; font-size: 20px; font-weight: 700; letter-spacing: 2px;
  }
  .card.a .tag { color: ${palette.brass}; }
  .card.b .tag { color: ${palette.brassLight}; }
  .vs {
    position: absolute; left: 960px; top: 668px; transform: translate(-50%, -50%);
    font-family: Georgia, serif; font-style: italic; font-weight: 700; font-size: 40px; color: ${palette.brass};
    background: ${palette.paper}; padding: 4px 18px; z-index: 2;
  }
  .footer {
    position: absolute; left: 72px; right: 72px; bottom: 90px; height: 112px;
    background: ${palette.raised}; border: 2px solid ${palette.navy};
    display: flex; align-items: center; padding: 0 36px;
    font-size: 30px; font-weight: 700; color: ${palette.navy};
  }
  .boundary {
    position: absolute; left: 72px; bottom: 46px;
    font-family: "Courier New", monospace; font-size: 18px; font-weight: 700; letter-spacing: 1.5px;
    color: ${palette.navy};
  }
</style>
</head>
<body>
  <div class="rule-top"></div>
  <div class="lockup">KRISEVA <span class="attest">ATTEST</span></div>
  <div class="eyebrow">RESEARCH-STAGE PROTOTYPE · SYNTHETIC DEMO DATA</div>
  <div class="headline">When records<br>disagree.</div>
  <div class="subhead">Two official statements. One governed field. No default winner.</div>
  <div class="values">
    <div class="card a">
      <div class="stripe"></div>
      <div class="label">ADMINISTRATOR STATEMENT</div>
      <div class="value">USD 25,000,000</div>
      <div class="tag">CANDIDATE A</div>
    </div>
    <div class="card b">
      <div class="stripe"></div>
      <div class="label">SUBSCRIPTION REGISTER</div>
      <div class="value">USD 24,000,000</div>
      <div class="tag">CANDIDATE B</div>
    </div>
  </div>
  <div class="vs">vs</div>
  <div class="footer">KRISEVA ATTEST · a deterministic, human-accountable evidence harness</div>
  <div class="boundary">NOT A REGULATORY FILING · NOT CONNECTED TO IFSCA SYSTEMS · HUMAN DECISION REQUIRED</div>
</body>
</html>`;

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const screenshot = await page.screenshot({ type: 'png' });
  await writeFile(resolve(outputPath), screenshot);
} finally {
  await browser.close();
}

process.stdout.write(`Built dedicated thumbnail -> ${outputPath}\n`);
