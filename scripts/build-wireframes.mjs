import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardMeta, screens } from '../wireframes/content.mjs';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderContract(screen) {
  return [
    ['Task', screen.task],
    ['Primary action', screen.action],
    ['Error / empty state', screen.error],
    ['Mobile collapse', screen.mobile],
  ].map(([label, value]) => `
            <div class="contract-item">
              <dt>${escapeHtml(label)}</dt>
              <dd>${escapeHtml(value)}</dd>
            </div>`).join('');
}

function renderPanel(panel) {
  return `
                <section class="evidence-panel">
                  <p class="panel-label">${escapeHtml(panel.label)}</p>
                  <h3>${escapeHtml(panel.title)}</h3>
                  <p class="panel-body">${escapeHtml(panel.body)}</p>
                  <p class="panel-meta">${escapeHtml(panel.meta)}</p>
                </section>`;
}

function renderScreen(screen) {
  return `
      <article class="wireframe-sheet" id="${escapeHtml(screen.slug)}" aria-labelledby="${escapeHtml(screen.slug)}-title" tabindex="-1">
        <header class="sheet-header">
          <div>
            <p class="folio">Screen ${escapeHtml(screen.number)} / ${String(screens.length).padStart(2, '0')}</p>
            <h2 id="${escapeHtml(screen.slug)}-title">${escapeHtml(screen.name)}</h2>
          </div>
          <dl class="screen-contract">${renderContract(screen)}
          </dl>
        </header>
        <div class="frame-stage">
          <aside class="evidence-index" aria-label="Case context">
            <p class="case-line">${escapeHtml(boardMeta.marker)}</p>
            <p class="case-name">${escapeHtml(boardMeta.caseName)}</p>
            <p class="case-name">${escapeHtml(boardMeta.fme)}</p>
            <p>${escapeHtml(boardMeta.period)}</p>
            <p class="status-line">${escapeHtml(boardMeta.boundary)}</p>
          </aside>
          <div class="stage-body">
            <div class="stage-toolbar">
              <span class="marker">${escapeHtml(boardMeta.marker)}</span>
              <button class="stage-action" type="button">${escapeHtml(screen.action)}</button>
            </div>
            <div class="evidence-spread">${screen.panels.map(renderPanel).join('')}
            </div>
            <p class="stage-notice">LOW-FIDELITY STATE · Exact source coordinates and human decisions remain the focal points.</p>
          </div>
        </div>
      </article>`;
}

export function renderWireframeHtml() {
  const navigation = screens.map((screen) => `
          <li><a href="#${escapeHtml(screen.slug)}">${escapeHtml(screen.number)} · ${escapeHtml(screen.name)}</a></li>`).join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>${escapeHtml(boardMeta.title)}</title>
    <link rel="stylesheet" href="wireframes.css">
  </head>
  <body>
    <a class="skip-link" href="#wireframe-board">Skip to wireframe board</a>
    <header class="board-header">
      <div>
        <p class="classification">Low-fidelity information architecture · 12 August 2026</p>
        <h1>${escapeHtml(boardMeta.title)}</h1>
        <p class="board-subtitle">${escapeHtml(boardMeta.subtitle)}</p>
      </div>
      <aside class="board-boundary" aria-label="Prototype boundary">
        <strong>${escapeHtml(boardMeta.marker)}</strong>
        <span>${escapeHtml(boardMeta.boundary)}</span>
      </aside>
    </header>
    <nav class="screen-index" aria-label="Wireframe screen index">
      <ol>${navigation}
      </ol>
    </nav>
    <main class="wireframe-board" id="wireframe-board" tabindex="-1">${screens.map(renderScreen).join('')}
    </main>
  </body>
</html>
`;
}

function escapeXml(value) {
  return escapeHtml(value);
}

function wrapText(value, maxCharacters) {
  const words = String(value).split(/\s+/u).flatMap((word) => {
    const pieces = [];
    let remainder = word;
    while (remainder.length > maxCharacters) {
      const hyphenBreak = remainder.lastIndexOf('-', maxCharacters - 1);
      const breakAt = hyphenBreak >= Math.floor(maxCharacters * 0.45) ? hyphenBreak + 1 : maxCharacters;
      pieces.push(remainder.slice(0, breakAt));
      remainder = remainder.slice(breakAt);
    }
    if (remainder) pieces.push(remainder);
    return pieces;
  });
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxCharacters && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function charactersForWidth(pixelWidth, fontSize, widthFactor = 0.58) {
  return Math.max(12, Math.floor(pixelWidth / (fontSize * widthFactor)));
}

function svgText(value, x, y, options = {}) {
  const {
    fill = '#111111',
    fontFamily = 'Helvetica, Arial, sans-serif',
    fontSize = 17,
    fontWeight = 400,
    lineHeight = Math.round(fontSize * 1.35),
    maxCharacters = 48,
    maxLines = 5,
    ownerBottom,
    attributes = '',
    flowOwner,
    flowOrder,
  } = options;
  const lines = wrapText(value, maxCharacters).slice(0, maxLines);
  const textTop = y - fontSize;
  const textBottom = y + (lines.length - 1) * lineHeight + Math.ceil(fontSize * 0.3);
  const bounds = ownerBottom === undefined ? '' : ` data-text-bottom="${textBottom}" data-owner-bottom="${ownerBottom}"`;
  const flow = flowOwner === undefined ? '' : ` data-flow-owner="${flowOwner}" data-flow-order="${flowOrder}" data-flow-top="${textTop}" data-flow-bottom="${textBottom}"`;
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="${fontFamily}" font-size="${fontSize}" font-weight="${fontWeight}"${bounds}${flow}${attributes ? ` ${attributes}` : ''}>${lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`).join('')}</text>`;
}

function renderSvgScreen(screen, x, y, width, height, mobile) {
  const pad = mobile ? 20 : 28;
  const contractTop = y + (mobile ? 155 : 165);
  const contracts = [
    ['Task', screen.task],
    ['Primary action', screen.action],
    ['Error / empty state', screen.error],
    ['Mobile collapse', screen.mobile],
  ];
  const mobileContractWidth = width - pad * 2;
  const mobileContractCharacters = charactersForWidth(mobileContractWidth, 14);
  const mobileContractRows = mobile
    ? contracts.map(([, value]) => {
        const lineCount = wrapText(value, mobileContractCharacters).length;
        return Math.max(104, 58 + lineCount * 19 + 18);
      })
    : [];
  const desktopContractCharacters = charactersForWidth(width / 2 - pad * 2, 17);
  const desktopContractCells = contracts.map(([, value]) => {
    const lineCount = wrapText(value, desktopContractCharacters).length;
    return Math.max(104, 58 + lineCount * 22 + 18);
  });
  const desktopContractRows = [
    Math.max(desktopContractCells[0], desktopContractCells[1]),
    Math.max(desktopContractCells[2], desktopContractCells[3]),
  ];
  const contractHeight = (mobile ? mobileContractRows : desktopContractRows)
    .reduce((sum, rowHeight) => sum + rowHeight, 0);
  const bodyTop = contractTop + contractHeight;
  const noteHeight = mobile ? 218 : 150;
  const actionHeight = mobile ? 96 : 58;
  const panelsTop = bodyTop + actionHeight;
  const panelsHeight = height - (panelsTop - y) - noteHeight;
  const panelColumns = mobile ? 1 : 2;
  const panelRows = mobile ? 4 : 2;
  const panelWidth = width / panelColumns;
  const panelHeight = panelsHeight / panelRows;
  const output = [
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#ffffff" stroke="#111111" stroke-width="1"/>`,
    svgText(`SCREEN ${screen.number} / ${String(screens.length).padStart(2, '0')}`, x + pad, y + 30, { fontFamily: 'monospace', fontSize: 14, fontWeight: 700, maxCharacters: 30 }),
    svgText(screen.name, x + pad, y + 78, { fontFamily: 'Georgia, serif', fontSize: mobile ? 32 : 42, maxCharacters: mobile ? 20 : 28, maxLines: 2, lineHeight: mobile ? 36 : 46 }),
    `<line x1="${x}" y1="${contractTop}" x2="${x + width}" y2="${contractTop}" stroke="#111111"/>`,
  ];

  const contractColumns = mobile ? 1 : 2;
  const contractRows = mobile ? 4 : 2;
  const contractWidth = width / contractColumns;
  const contractRowHeights = mobile ? mobileContractRows : desktopContractRows;
  let mobileContractOffset = 0;
  let desktopContractOffset = 0;
  contracts.forEach(([label, value], index) => {
    const column = index % contractColumns;
    const row = Math.floor(index / contractColumns);
    const cellX = x + column * contractWidth;
    const contractCellHeight = contractRowHeights[row];
    const cellY = contractTop + (mobile ? mobileContractOffset : desktopContractOffset);
    const cellBottom = cellY + contractCellHeight;
    if (column > 0) output.push(`<line x1="${cellX}" y1="${cellY}" x2="${cellX}" y2="${cellBottom}" stroke="#b9b9b4"/>`);
    if (row > 0) output.push(`<line x1="${cellX}" y1="${cellY}" x2="${cellX + contractWidth}" y2="${cellY}" stroke="#b9b9b4"/>`);
    output.push(svgText(label.toUpperCase(), cellX + pad, cellY + 28, { fontFamily: 'monospace', fontSize: 14, fontWeight: 700, maxCharacters: 28, ownerBottom: cellBottom }));
    output.push(svgText(value, cellX + pad, cellY + 60, { fontSize: 17, lineHeight: 22, maxCharacters: mobile ? mobileContractCharacters : desktopContractCharacters, maxLines: 8, ownerBottom: cellBottom, attributes: 'data-copy-kind="body"' }));
    if (mobile) mobileContractOffset += contractCellHeight;
    if (!mobile && column === contractColumns - 1) desktopContractOffset += contractCellHeight;
  });

  output.push(`<rect x="${x}" y="${bodyTop}" width="${width}" height="${actionHeight}" fill="#272725"/>`);
  const markerY = bodyTop + (mobile ? 30 : 36);
  const actionY = bodyTop + (mobile ? 70 : 36);
  const actionX = x + (mobile ? pad : width * 0.52);
  const markerWidth = Math.ceil(boardMeta.marker.length * 14 * 0.63);
  const actionWidth = Math.min(width - pad * 2, Math.ceil(screen.action.length * 14 * 0.63));
  output.push(svgText(boardMeta.marker, x + pad, markerY, { fill: '#ffffff', fontFamily: 'monospace', fontSize: 14, fontWeight: 700, maxCharacters: 30, ownerBottom: bodyTop + actionHeight, attributes: `data-banner-box="${x + pad},${markerY - 17},${markerWidth},22"` }));
  output.push(svgText(screen.action.toUpperCase(), actionX, actionY, { fill: '#ffffff', fontFamily: 'monospace', fontSize: 14, fontWeight: 700, maxCharacters: mobile ? 40 : 42, ownerBottom: bodyTop + actionHeight, attributes: `data-banner-box="${actionX},${actionY - 17},${actionWidth},22"` }));

  screen.panels.forEach((panel, index) => {
    const column = index % panelColumns;
    const row = Math.floor(index / panelColumns);
    const panelX = x + column * panelWidth;
    const panelY = panelsTop + row * panelHeight;
    const contentWidth = panelWidth - pad * 2;
    const titleSize = mobile ? 22 : 26;
    const bodySize = 17;
    const flowOwner = `${screen.slug}-${index}`;
    output.push(`<rect x="${panelX}" y="${panelY}" width="${panelWidth}" height="${panelHeight}" fill="${index % 2 === 0 ? '#f4f4f1' : '#ffffff'}" stroke="#b9b9b4" stroke-width="1"/>`);
    const panelBottom = panelY + panelHeight;
    output.push(svgText(panel.label.toUpperCase(), panelX + pad, panelY + 28, { fill: '#5d5d5a', fontFamily: 'monospace', fontSize: 14, fontWeight: 700, maxCharacters: 35, ownerBottom: panelBottom, flowOwner, flowOrder: 0 }));
    output.push(svgText(panel.title, panelX + pad, panelY + 74, { fontFamily: 'Georgia, serif', fontSize: titleSize, maxCharacters: charactersForWidth(contentWidth, titleSize, 0.54), maxLines: 2, lineHeight: 30, ownerBottom: panelBottom, flowOwner, flowOrder: 1 }));
    output.push(svgText(panel.body, panelX + pad, panelY + 142, { fontSize: bodySize, maxCharacters: charactersForWidth(contentWidth, bodySize), maxLines: 3, ownerBottom: panelBottom, flowOwner, flowOrder: 2, attributes: 'data-copy-kind="body"' }));
    output.push(svgText(panel.meta, panelX + pad, panelY + panelHeight - 64, { fontFamily: 'monospace', fontSize: 14, fontWeight: 700, maxCharacters: charactersForWidth(contentWidth, 14, 0.63), maxLines: 2, ownerBottom: panelBottom, flowOwner, flowOrder: 3 }));
  });

  const noteY = y + height - noteHeight;
  output.push(`<rect x="${x}" y="${noteY}" width="${width}" height="${noteHeight}" fill="#e4e4df" stroke="#111111" stroke-width="1"/>`);
  output.push(svgText(boardMeta.boundary, x + pad, noteY + 35, { fontFamily: 'monospace', fontSize: 14, fontWeight: 700, maxCharacters: mobile ? 38 : 70, maxLines: 3, ownerBottom: noteY + noteHeight }));
  const caseSize = mobile ? 20 : 24;
  output.push(svgText(`${boardMeta.caseName} · ${boardMeta.period}`, x + pad, noteY + (mobile ? 112 : 86), { fontFamily: 'Georgia, serif', fontSize: caseSize, maxCharacters: charactersForWidth(width - pad * 2, caseSize, 0.54), maxLines: 2, ownerBottom: noteY + noteHeight }));
  return output.join('\n');
}

export function renderWireframeSvg(mode) {
  const mobile = mode === 'mobile';
  const width = mobile ? 390 : 1440;
  const margin = mobile ? 12 : 40;
  const gap = mobile ? 28 : 42;
  const headerHeight = mobile ? 300 : 300;
  const columns = mobile ? 1 : 2;
  const screenWidth = mobile ? width - margin * 2 : (width - margin * 2 - gap) / 2;
  const screenHeight = mobile ? 2200 : 1440;
  const rows = Math.ceil(screens.length / columns);
  const height = headerHeight + margin + rows * screenHeight + (rows - 1) * gap + margin;
  const body = [
    `<rect width="${width}" height="${height}" fill="#f4f4f1"/>`,
    svgText('LOW-FIDELITY INFORMATION ARCHITECTURE · 12 AUGUST 2026', margin, 52, { fontFamily: 'monospace', fontSize: 14, fontWeight: 700, maxCharacters: mobile ? 40 : 80, maxLines: 2 }),
    svgText('KRISEVA ATTEST', margin, mobile ? 125 : 140, { fontFamily: 'Georgia, serif', fontSize: mobile ? 46 : 86, maxCharacters: 24 }),
    svgText('EVIDENCE REVIEW WIREFRAMES', margin, mobile ? 178 : 215, { fontFamily: 'monospace', fontSize: mobile ? 17 : 23, fontWeight: 700, maxCharacters: 35 }),
    svgText(boardMeta.boundary, margin, mobile ? 236 : 264, { fontFamily: 'monospace', fontSize: 14, fontWeight: 700, maxCharacters: mobile ? 42 : 100, maxLines: 3 }),
  ];

  screens.forEach((screen, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = margin + column * (screenWidth + gap);
    const y = headerHeight + margin + row * (screenHeight + gap);
    body.push(renderSvgScreen(screen, x, y, screenWidth, screenHeight, mobile));
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(boardMeta.title)}">
${body.join('\n')}
</svg>
`;
}

export async function buildWireframeSources() {
  await mkdir(resolve(projectRoot, 'wireframes'), { recursive: true });
  await mkdir(resolve(projectRoot, 'artifacts'), { recursive: true });
  await Promise.all([
    writeFile(resolve(projectRoot, 'wireframes/index.html'), renderWireframeHtml()),
    writeFile(resolve(projectRoot, 'artifacts/wireframes-desktop.svg'), renderWireframeSvg('desktop')),
    writeFile(resolve(projectRoot, 'artifacts/wireframes-mobile.svg'), renderWireframeSvg('mobile')),
  ]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await buildWireframeSources();
  process.stdout.write('Built wireframe HTML and deterministic SVG sources.\n');
}
