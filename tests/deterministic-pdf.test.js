import test from 'node:test';
import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { access, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildSinglePageJpegPdf } from '../scripts/deterministic-pdf.mjs';

const decodableJpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/AP/EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8hf//aAAwDAQACAAMAAAAQH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8Qf//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8Qf//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8Qf//Z',
  'base64',
);

async function findOptionalExecutable(command) {
  for (const directory of (process.env.PATH || '').split(delimiter).filter(Boolean)) {
    const candidate = join(directory, command);
    if (await access(candidate, constants.X_OK).then(() => true, () => false)) {
      return candidate;
    }
  }
  return null;
}

function assertInternalPdfStructure(pdf, jpeg, width, height) {
  const text = pdf.toString('latin1');
  const startXrefMatch = text.match(/startxref\n(\d+)\n%%EOF\n$/u);
  const xrefMatch = text.match(/xref\n0 7\n([\s\S]+?)\ntrailer/u);

  assert.equal(text.startsWith('%PDF-1.4\n'), true);
  assert.match(text, /\/Count 1/u);
  assert.match(text, new RegExp(`/MediaBox \\[0 0 ${width} ${height}\\]`, 'u'));
  assert.match(text, new RegExp(`/Subtype /Image /Width ${width} /Height ${height}`, 'u'));
  assert.match(text, new RegExp(`/Filter /DCTDecode /Length ${jpeg.length}`, 'u'));
  assert.doesNotMatch(text, /CreationDate|ModDate/u);
  assert.notEqual(pdf.indexOf(jpeg), -1);
  assert.ok(startXrefMatch, 'PDF must end with a startxref pointer and EOF marker');
  assert.ok(xrefMatch, 'PDF must contain a seven-entry cross-reference table');

  const xrefOffset = Number(startXrefMatch[1]);
  assert.equal(text.slice(xrefOffset, xrefOffset + 4), 'xref');
  const entries = xrefMatch[1].split('\n');
  assert.equal(entries.length, 7);
  assert.equal(entries[0], '0000000000 65535 f ');
  entries.slice(1).forEach((entry, index) => {
    const offset = Number(entry.slice(0, 10));
    assert.equal(text.slice(offset, offset + 7), `${index + 1} 0 obj`);
  });
}

test('single-page JPEG PDF is deterministic, timestamp-free, and structurally valid', async (t) => {
  const first = buildSinglePageJpegPdf(decodableJpeg, 100, 200);
  const second = buildSinglePageJpegPdf(decodableJpeg, 100, 200);
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'attest-pdf-'));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const pdfPath = join(temporaryRoot, 'receipt.pdf');
  const rasterPrefix = join(temporaryRoot, 'receipt-raster');
  await writeFile(pdfPath, first);

  assert.deepEqual(first, second);
  assertInternalPdfStructure(first, decodableJpeg, 100, 200);

  const pdfinfo = await findOptionalExecutable('pdfinfo');
  await t.test('optional pdfinfo parser validation', {
    skip: pdfinfo ? false : 'pdfinfo was not found on PATH; internal PDF validation still ran',
  }, () => {
    const info = spawnSync(pdfinfo, [pdfPath], { encoding: 'utf8' });
    assert.equal(info.status, 0, info.stderr);
    assert.match(info.stdout, /^Pages:\s+1$/mu);
    assert.match(info.stdout, /^Page size:\s+100 x 200 pts/mu);
    assert.doesNotMatch(info.stdout, /CreationDate|ModDate/u);
  });

  const pdftoppm = await findOptionalExecutable('pdftoppm');
  await t.test('optional pdftoppm raster validation', {
    skip: pdftoppm ? false : 'pdftoppm was not found on PATH; internal PDF validation still ran',
  }, async () => {
    const raster = spawnSync(pdftoppm, ['-singlefile', '-png', pdfPath, rasterPrefix], { encoding: 'utf8' });
    const rasterBytes = await readFile(`${rasterPrefix}.png`).catch(() => Buffer.alloc(0));
    const rasterStat = await stat(`${rasterPrefix}.png`).catch(() => null);
    assert.equal(raster.status, 0, raster.stderr);
    assert.equal(rasterStat?.isFile(), true);
    assert.equal(rasterBytes.subarray(1, 4).toString('ascii'), 'PNG');
  });
});
