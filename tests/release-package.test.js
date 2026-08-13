import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  DEFAULT_PUBLIC_FILES,
  scanPublicFiles,
} from '../scripts/verify-claims.mjs';
import { resolveLocalAsset } from '../scripts/local-route.mjs';
import { buildPublicRelease } from '../scripts/build-public-release.mjs';

const projectRoot = resolve(import.meta.dirname, '..');

async function read(relativePath) {
  return readFile(resolve(projectRoot, relativePath), 'utf8');
}

async function sha256(relativePath) {
  const content = await readFile(resolve(projectRoot, relativePath));
  return createHash('sha256').update(content).digest('hex');
}

test('release index classifies the six submission artifacts and private handoff', async () => {
  const index = await read('ARTIFACT_INDEX.md');
  for (const artifact of [
    'Interactive prototype',
    'Wireframes',
    'Demo video',
    'Pitch deck',
    'Technical notes',
    'GitHub repository',
  ]) assert.match(index, new RegExp(`\\| ${artifact} \\|`, 'u'));

  for (const boundary of [
    'local release candidate',
    'founder approval was given on 12 august 2026',
    'founder approval is still required',
    'private founder handoff',
    'not included in a public repository export',
  ]) assert.match(index.toLowerCase(), new RegExp(boundary, 'u'));
});

test('release checksums are exact for the five governed artifacts', async () => {
  const checksumText = await read('CHECKSUMS.sha256');
  const entries = checksumText.trim().split('\n').map((line) => {
    const match = line.match(/^([a-f0-9]{64}) {2}(.+)$/u);
    assert.ok(match, `invalid checksum line: ${line}`);
    return { digest: match[1], path: match[2] };
  });
  assert.deepEqual(entries.map(({ path }) => path), [
    'deck/KRISEVA_ATTEST_GIFT_2026.pptx',
    'deck/KRISEVA_ATTEST_GIFT_2026.pdf',
    'video/KRISEVA_ATTEST_DEMO_90S.mp4',
    'artifacts/KRISEVA_ATTEST_WIREFRAMES.pdf',
    'data/synthetic-case.json',
  ]);
  for (const entry of entries) {
    assert.equal(entry.digest, await sha256(entry.path), `${entry.path} checksum drifted`);
  }
});

test('QA report records every required mechanical and visual release gate', async () => {
  const report = await read('docs/QA_REPORT.md');
  for (const receipt of [
    'wireframes-desktop.png',
    'wireframes-mobile.png',
    'prototype-dashboard-390.png',
    'prototype-dashboard-1440.png',
    'prototype-conflict-390.png',
    'prototype-conflict-1440.png',
    'prototype-receipt-390.png',
    'prototype-receipt-1440.png',
    'deck-montage.png',
    'KRISEVA_ATTEST_DEMO_90S.mp4',
    'KRISEVA_ATTEST_GIFT_2026.pdf',
  ]) assert.match(report, new RegExp(receipt.replaceAll('.', '\\.'), 'u'));
  assert.match(report, /Release verdict:\s*LOCAL RELEASE CANDIDATE/iu);
  assert.match(report, /No publication, deployment, form mutation, terms acceptance, or submission/iu);
});

test('public release scan covers every shipped narrative and browser data class', async () => {
  const requiredPublicFiles = [
    'index.html',
    'technical-notes.html',
    'styles/hub.css',
    'prototype/index.html',
    'prototype/prototype.css',
    'prototype/app.js',
    'wireframes/index.html',
    'wireframes/wireframes.css',
    'wireframes/content.mjs',
    'src/case-engine.js',
    'src/dom-renderers.js',
    'src/manifest.js',
    'data/synthetic-case.json',
    'data/expected-manifest.json',
    'deck/DECK_CONTENT.md',
    'deck/SOURCE_NOTES.md',
    'deck/index.html',
    'video/storyboard.md',
    'video/narration.txt',
    'video/captions.srt',
    'video/captions-verbatim.srt',
    'artifacts/deck/deck-manifest.json',
    'ARTIFACT_INDEX.md',
    'docs/QA_REPORT.md',
  ];
  for (const file of requiredPublicFiles) {
    assert.equal(DEFAULT_PUBLIC_FILES.includes(file), true, `${file} is outside the public scan`);
    assert.ok((await stat(resolve(projectRoot, file))).isFile(), `${file} is missing`);
  }
  assert.equal(new Set(DEFAULT_PUBLIC_FILES).size, DEFAULT_PUBLIC_FILES.length);
  for (const privateFile of [
    'docs/CONTRIBUTOR_SCOPE.md',
    'docs/APPLICATION_UPDATE_BANK.md',
    'docs/CLAUDE_CODE_HANDOFF.md',
  ]) assert.equal(DEFAULT_PUBLIC_FILES.includes(privateFile), false, `${privateFile} must remain private`);
  assert.deepEqual(await scanPublicFiles(), []);
});

test('local release links use correct media MIME types', () => {
  const cases = [
    ['/video/KRISEVA_ATTEST_DEMO_90S.mp4', 'video/mp4'],
    ['/deck/KRISEVA_ATTEST_GIFT_2026.pdf', 'application/pdf'],
    [
      '/deck/KRISEVA_ATTEST_GIFT_2026.pptx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
  ];
  for (const [path, contentType] of cases) {
    const asset = resolveLocalAsset(projectRoot, `http://attest.local${path}`);
    assert.equal(asset.contentType, contentType);
  }
});

test('GitHub-ready export contains the release and excludes private founder handoff', async (t) => {
  const destination = await mkdtemp(resolve(tmpdir(), 'attest-public-release-'));
  t.after(() => rm(destination, { recursive: true, force: true }));
  const receipt = await buildPublicRelease({
    sourceRoot: projectRoot,
    destination,
    sourceRevision: 'test-revision',
  });

  for (const publicFile of [
    'index.html',
    'prototype/index.html',
    'wireframes/index.html',
    'deck/KRISEVA_ATTEST_GIFT_2026.pdf',
    'deck/KRISEVA_ATTEST_GIFT_2026.pptx',
    'video/KRISEVA_ATTEST_DEMO_90S.mp4',
    'tests/release-package.test.js',
    'docs/CLAIMS_REGISTER.md',
    'docs/QA_REPORT.md',
    'CHECKSUMS.sha256',
  ]) assert.ok((await stat(resolve(destination, publicFile))).isFile(), `${publicFile} missing`);

  for (const privateFile of [
    'docs/PRODUCT_DECISION.md',
    'docs/BUSINESS_VIABILITY.md',
    'docs/CONTRIBUTOR_SCOPE.md',
    'docs/MEETING_BRIEF_2026-08-12.md',
    'docs/APPLICATION_UPDATE_BANK.md',
    'docs/CLAUDE_CODE_HANDOFF.md',
    'docs/superpowers/plans/2026-08-12-attest-submission-system.md',
  ]) await assert.rejects(() => stat(resolve(destination, privateFile)), { code: 'ENOENT' });

  assert.equal(receipt.sourceRevision, 'test-revision');
  assert.equal(receipt.files.some(({ path }) => path === 'docs/CONTRIBUTOR_SCOPE.md'), false);
  assert.deepEqual(await scanPublicFiles(destination), []);
  const diskReceipt = JSON.parse(await readFile(resolve(destination, 'PUBLIC_RELEASE_MANIFEST.json'), 'utf8'));
  assert.deepEqual(diskReceipt, receipt);
});
