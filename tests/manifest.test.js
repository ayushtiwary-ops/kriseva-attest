import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  loadCase,
  runEvidenceReview,
  recordDecision,
  recordRiskDisposition,
  recordSignOff
} from '../src/case-engine.js';
import { computeAnomalyFlags } from '../src/risk-engine.js';
import {
  buildManifest,
  manifestToHtml,
  canonicalizeManifest,
  sha256HexSync,
  computeManifestIntegrity,
  withManifestIntegrity
} from '../src/manifest.js';
import fixture from '../data/synthetic-case.json' with { type: 'json' };
import expectedManifest from '../data/expected-manifest.json' with { type: 'json' };

// Per the design brief: node:crypto in tests, Web Crypto in the browser.
const sha256Hex = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

// decidedFixture() accepts the higher candidate (admin-committed, USD
// 25,000,000), so all four designed anomaly flags are active by that point.
function decidedFixture() {
  return recordDecision(runEvidenceReview(loadCase(fixture)), 'committed-capital', {
    action: 'ACCEPT',
    candidateId: 'admin-committed',
    reviewer: 'Rhea Menon',
    reason: 'Synthetic reviewer decision.',
    recordedAt: '2026-08-12T09:30:00.000Z'
  });
}

function dispositionAllFlags(state, recordedAt = '2026-08-12T09:35:00.000Z') {
  return computeAnomalyFlags(state).reduce((accumulatedState, flag) => recordRiskDisposition(accumulatedState, flag.id, {
    action: 'ACKNOWLEDGE',
    disposerName: 'Kavya Rao',
    reason: 'Reviewed and acknowledged for this synthetic demo case.',
    recordedAt
  }), state);
}

function signedOffFixture() {
  const decided = dispositionAllFlags(decidedFixture());
  return recordSignOff(decided, {
    officerName: 'Devika Nair',
    confirmed: true,
    recordedAt: '2026-08-12T09:45:00.000Z'
  });
}

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

test('manifest is null for principalOfficerConfirmation before sign-off', () => {
  const reviewed = runEvidenceReview(loadCase(fixture));
  const decided = recordDecision(reviewed, 'committed-capital', {
    action: 'ACCEPT',
    candidateId: 'admin-committed',
    reviewer: 'Rhea Menon',
    reason: 'Synthetic reviewer decision.',
    recordedAt: '2026-08-12T09:30:00.000Z'
  });

  const manifest = buildManifest(decided, { generatedAt: '2026-08-12T10:00:00.000Z' });
  assert.equal(manifest.principalOfficerConfirmation, null);
  assert.equal(manifest.humanDecisions[0].reviewer, 'Rhea Menon');
});

test('manifest serializes source fingerprints, named human decisions, the Principal Officer confirmation, and unresolved items', async () => {
  const signedOff = signedOffFixture();

  const manifest = buildManifest(signedOff, {
    generatedAt: '2026-08-12T10:00:00.000Z'
  });
  const manifestWithIntegrity = await withManifestIntegrity(manifest, { sha256Hex });

  assert.deepEqual(manifestWithIntegrity, expectedManifest);
  assert.deepEqual(manifest.principalOfficerConfirmation, {
    officerName: 'Devika Nair',
    confirmed: true,
    recordedAt: '2026-08-12T09:45:00.000Z'
  });
});

test('printable manifest makes disclosures, unresolved evidence, both named actors, and the integrity digest visible', () => {
  const html = manifestToHtml(expectedManifest);

  assert.match(html, /@media print/);
  assert.match(html, /NOT A REGULATORY FILING/);
  assert.match(html, /Rhea Menon/);
  assert.match(html, /Deciding reviewer/i);
  assert.match(html, /Devika Nair/);
  assert.match(html, /Confirming Principal Officer/i);
  assert.match(html, /Committed capital/);
  assert.match(html, /Investor complaints closed/);
  assert.match(html, new RegExp(expectedManifest.integrity.digest));
  assert.match(html, /sha256/i);
});

test('printable manifest makes risk indicators and anomaly flag dispositions visible', () => {
  const html = manifestToHtml(expectedManifest);

  assert.match(html, /Risk indicators/);
  assert.match(html, /Evidence coverage/);
  assert.match(html, /Anomaly flags/);
  assert.match(html, /Duplicate document fingerprint/);
  assert.match(html, /Stale source/);
  assert.match(html, /Disposing reviewer/i);
  for (const finding of expectedManifest.anomalyFindings) {
    assert.match(html, new RegExp(finding.flag.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&')));
    if (finding.disposition) assert.match(html, new RegExp(finding.disposition.disposerName));
  }
});

test('manifest includes riskIndicators (six entries) and anomalyFindings (one per active flag, each carrying its disposition)', () => {
  const decided = decidedFixture();
  const manifest = buildManifest(decided, { generatedAt: '2026-08-12T10:00:00.000Z' });

  assert.equal(manifest.riskIndicators.length, 6);
  for (const indicator of manifest.riskIndicators) {
    assert.ok(typeof indicator.value === 'string' && indicator.value.length > 0);
    assert.ok(indicator.explanation.length > 0);
    assert.ok(indicator.reference.length > 0);
  }

  assert.equal(manifest.anomalyFindings.length, 4);
  assert.ok(manifest.anomalyFindings.every((finding) => finding.disposition === null));

  const dispositioned = dispositionAllFlags(decided);
  const signedOffManifest = buildManifest(dispositioned, { generatedAt: '2026-08-12T10:00:00.000Z' });
  assert.ok(signedOffManifest.anomalyFindings.every((finding) => finding.disposition?.disposerName === 'Kavya Rao'));
});

test('sha256HexSync (pure-JS fallback) matches node:crypto for representative inputs', () => {
  for (const sample of [
    '',
    'abc',
    'KRISEVA ATTEST',
    JSON.stringify({ a: 1, b: [1, 2, 3], nested: { z: 'café' } }),
    'x'.repeat(1000)
  ]) {
    assert.equal(sha256HexSync(sample), sha256Hex(sample));
  }
});

test('canonicalizeManifest produces the same string regardless of source key order', () => {
  const a = { product: 'X', case: { id: 1, name: 'A' }, list: [{ b: 2, a: 1 }] };
  const b = { case: { name: 'A', id: 1 }, product: 'X', list: [{ a: 1, b: 2 }] };
  assert.equal(canonicalizeManifest(a), canonicalizeManifest(b));
});

test('canonicalizeManifest excludes the integrity field itself', () => {
  const manifest = buildManifest(signedOffFixture(), { generatedAt: '2026-08-12T10:00:00.000Z' });
  const withoutIntegrity = canonicalizeManifest(manifest);
  const withIntegrity = canonicalizeManifest({ ...manifest, integrity: { algorithm: 'sha256', digest: 'deadbeef' } });
  assert.equal(withoutIntegrity, withIntegrity);
});

test('manifest integrity digest is deterministic for identical content', async () => {
  const manifest = buildManifest(signedOffFixture(), { generatedAt: '2026-08-12T10:00:00.000Z' });
  const first = await computeManifestIntegrity(manifest, { sha256Hex });
  const second = await computeManifestIntegrity(manifest, { sha256Hex });

  assert.deepEqual(first, second);
  assert.equal(first.algorithm, 'sha256');
  assert.match(first.digest, /^[0-9a-f]{64}$/u);
});

test('manifest integrity digest is stable when re-computed from a manifest that already carries integrity', async () => {
  const manifest = buildManifest(signedOffFixture(), { generatedAt: '2026-08-12T10:00:00.000Z' });
  const withIntegrity = await withManifestIntegrity(manifest, { sha256Hex });
  const rehashed = await withManifestIntegrity(withIntegrity, { sha256Hex });

  assert.equal(rehashed.integrity.digest, withIntegrity.integrity.digest);
});

test('manifest integrity digest changes when any field is altered (tamper detection)', async () => {
  const manifest = buildManifest(signedOffFixture(), { generatedAt: '2026-08-12T10:00:00.000Z' });
  const original = await computeManifestIntegrity(manifest, { sha256Hex });

  for (const tamper of [
    (draft) => { draft.fields[1].candidates[0].value = 'USD 99,000,000'; },
    (draft) => { draft.principalOfficerConfirmation.officerName = 'Someone Else'; },
    (draft) => { draft.humanDecisions[0].reason = 'A different reason.'; },
    (draft) => { draft.disclosures = draft.disclosures.slice(0, -1); },
    (draft) => { draft.riskIndicators[0].value = 'tampered'; },
    (draft) => { draft.anomalyFindings[0].disposition.reason = 'A different disposition reason.'; },
    (draft) => { draft.anomalyFindings[0].disposition.disposerName = 'Someone Else'; },
    (draft) => { draft.anomalyFindings = draft.anomalyFindings.slice(1); }
  ]) {
    const tampered = structuredClone(manifest);
    tamper(tampered);
    const tamperedDigest = await computeManifestIntegrity(tampered, { sha256Hex });
    assert.notEqual(tamperedDigest.digest, original.digest);
  }
});

test('manifest integrity digest covers dispositions: recording, escalating, or removing one changes the digest', async () => {
  const decided = decidedFixture();
  const flags = computeAnomalyFlags(decided);

  const undispositioned = buildManifest(decided, { generatedAt: '2026-08-12T10:00:00.000Z' });
  const undispositionedDigest = await computeManifestIntegrity(undispositioned, { sha256Hex });

  const oneDispositioned = recordRiskDisposition(decided, flags[0].id, {
    action: 'ACKNOWLEDGE',
    disposerName: 'Kavya Rao',
    reason: 'Reviewed for this synthetic demo case.',
    recordedAt: '2026-08-12T09:35:00.000Z'
  });
  const oneDispositionedManifest = buildManifest(oneDispositioned, { generatedAt: '2026-08-12T10:00:00.000Z' });
  const oneDispositionedDigest = await computeManifestIntegrity(oneDispositionedManifest, { sha256Hex });
  assert.notEqual(oneDispositionedDigest.digest, undispositionedDigest.digest);

  const escalatedInstead = recordRiskDisposition(decided, flags[0].id, {
    action: 'ESCALATE',
    disposerName: 'Kavya Rao',
    reason: 'Escalated for a second look.',
    recordedAt: '2026-08-12T09:35:00.000Z'
  });
  const escalatedManifest = buildManifest(escalatedInstead, { generatedAt: '2026-08-12T10:00:00.000Z' });
  const escalatedDigest = await computeManifestIntegrity(escalatedManifest, { sha256Hex });
  assert.notEqual(escalatedDigest.digest, oneDispositionedDigest.digest);
});

test('withManifestIntegrity defaults to the pure-JS sha256 implementation when no hasher is supplied', async () => {
  const manifest = buildManifest(signedOffFixture(), { generatedAt: '2026-08-12T10:00:00.000Z' });
  const withDefault = await withManifestIntegrity(manifest);
  const withExplicitNodeCrypto = await withManifestIntegrity(manifest, { sha256Hex });

  assert.equal(withDefault.integrity.digest, withExplicitNodeCrypto.integrity.digest);
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
