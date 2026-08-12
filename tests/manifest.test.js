import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCase, runEvidenceReview, recordDecision } from '../src/case-engine.js';
import { buildManifest, manifestToHtml } from '../src/manifest.js';
import fixture from '../data/synthetic-case.json' with { type: 'json' };
import expectedManifest from '../data/expected-manifest.json' with { type: 'json' };

test('manifest retains every source candidate and unresolved field', () => {
  const manifest = buildManifest(runEvidenceReview(loadCase(fixture)));

  assert.equal(manifest.case.synthetic, true);
  assert.equal(manifest.fields.length, 3);
  assert.equal(manifest.fields[1].candidates.length, 2);
  assert.equal(manifest.fields[2].status, 'UNSUPPORTED');
  assert.equal(manifest.disclosures.includes('NOT A REGULATORY FILING'), true);
});

test('manifest rejects a non-synthetic case', () => {
  const nonSyntheticCase = structuredClone(fixture);
  nonSyntheticCase.case.synthetic = false;

  assert.throws(
    () => buildManifest(runEvidenceReview(loadCase(nonSyntheticCase))),
    /explicitly synthetic case/i
  );
});

test('manifest rejects a source without an explicit synthetic or public marker', () => {
  const unmarkedSourceCase = structuredClone(fixture);
  delete unmarkedSourceCase.sources[0].dataMarker;

  assert.throws(
    () => buildManifest(runEvidenceReview(loadCase(unmarkedSourceCase))),
    /explicitly marked synthetic or public/i
  );
});

test('manifest serializes source fingerprints, named human decisions, and unresolved items', () => {
  const reviewed = runEvidenceReview(loadCase(fixture));
  const decided = recordDecision(reviewed, 'committed-capital', {
    action: 'ACCEPT',
    candidateId: 'admin-committed',
    reviewer: 'Rhea Menon',
    reason: 'Synthetic reviewer decision.',
    recordedAt: '2026-08-12T09:30:00.000Z'
  });

  const manifest = buildManifest(decided, {
    generatedAt: '2026-08-12T10:00:00.000Z'
  });

  assert.deepEqual(manifest, expectedManifest);
});

test('printable manifest makes disclosures, unresolved evidence, and human decisions visible', () => {
  const html = manifestToHtml(expectedManifest);

  assert.match(html, /@media print/);
  assert.match(html, /NOT A REGULATORY FILING/);
  assert.match(html, /Rhea Menon/);
  assert.match(html, /Committed capital/);
  assert.match(html, /Investor complaints closed/);
});

test('printable manifest rejects a non-synthetic case', () => {
  const nonSyntheticManifest = structuredClone(expectedManifest);
  nonSyntheticManifest.case.synthetic = false;

  assert.throws(
    () => manifestToHtml(nonSyntheticManifest),
    /explicitly synthetic case/i
  );
});

test('printable manifest rejects a private source marker', () => {
  const privateSourceManifest = structuredClone(expectedManifest);
  privateSourceManifest.sources[0].dataMarker = 'PRIVATE SOURCE';

  assert.throws(
    () => manifestToHtml(privateSourceManifest),
    /explicitly marked synthetic or public/i
  );
});
