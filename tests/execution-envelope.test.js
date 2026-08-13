import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  buildEnvelope,
  canonicalizeEnvelope,
  computeEnvelopeIntegrity,
  replayEnvelope,
  summarizeEnvelope,
  withEnvelopeIntegrity,
} from '../scripts/execution-envelope.mjs';

// Per the design brief for the evidence manifest (src/manifest.js): node:crypto
// in tests, Web Crypto in the browser. Both paths must produce the same digest.
const sha256Hex = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

function fixtureEnvelope(overrides = {}) {
  return buildEnvelope({
    runId: 'test-run-1',
    runTimestamp: '2026-08-13T12:00:00.000Z',
    model: { reportedId: 'claude-haiku-4-5-20251001', canonicalModel: 'claude-haiku-4-5', provider: 'firstParty' },
    instruction: { templateVersion: 'v1', templateSha256: 'a'.repeat(64) },
    documents: [
      { id: 'doc-a', label: 'Document A', path: 'data/source-documents/doc-a.txt', documentDate: '2026-07-01', declaredFingerprint: 'fp-a', contentSha256: 'b'.repeat(64), bytes: 100 },
      { id: 'doc-b', label: 'Document B', path: 'data/source-documents/doc-b.txt', documentDate: '2026-05-01', declaredFingerprint: 'fp-b', contentSha256: 'c'.repeat(64), bytes: 200 },
    ],
    fields: [
      {
        id: 'closing-nav',
        label: 'Closing NAV',
        candidates: [{ documentId: 'doc-a', value: 'USD 100', normalizedValue: '100', location: 'L1', quote: 'Closing NAV: USD 100', promptSha256: 'd'.repeat(64) }],
        abstentions: [{ documentId: 'doc-b', reason: 'Not stated', promptSha256: 'e'.repeat(64) }],
      },
    ],
    validators: [
      { id: 'closing-nav-currency-format', label: 'Closing NAV: currency format', outcome: 'PASS', detail: 'VALID_FORMAT', explanation: 'ok', reference: 'ref' },
      { id: 'stale-source-check', label: 'Stale source', outcome: 'FLAG', detail: 'STALE_SOURCE', explanation: 'stale', reference: 'ref' },
    ],
    ...overrides,
  });
}

test('buildEnvelope requires the core fields', () => {
  assert.throws(() => buildEnvelope({}), /runTimestamp/i);
  assert.throws(() => buildEnvelope({ runTimestamp: 'x' }), /model\.reportedId/i);
  assert.throws(() => buildEnvelope({
    runTimestamp: 'x',
    model: { reportedId: 'm' },
  }), /instruction\.templateSha256/i);
  assert.throws(() => buildEnvelope({
    runTimestamp: 'x',
    model: { reportedId: 'm' },
    instruction: { templateSha256: 'h' },
    documents: [],
  }), /at least one document/i);
});

test('buildEnvelope carries the fixed boundary disclosure and synthetic markers', () => {
  const envelope = fixtureEnvelope();
  assert.equal(envelope.synthetic, true);
  assert.equal(envelope.dataMarker, 'SYNTHETIC DEMO DATA');
  assert.match(envelope.disclosure, /the model proposed, humans decided/iu);
});

test('canonicalizeEnvelope produces the same string regardless of source key order', () => {
  const a = { product: 'X', model: { reportedId: 'm', canonicalModel: 'c' }, documents: [{ b: 2, a: 1 }] };
  const b = { model: { canonicalModel: 'c', reportedId: 'm' }, product: 'X', documents: [{ a: 1, b: 2 }] };
  assert.equal(canonicalizeEnvelope(a), canonicalizeEnvelope(b));
});

test('canonicalizeEnvelope excludes the integrity field itself', () => {
  const envelope = fixtureEnvelope();
  const withoutIntegrity = canonicalizeEnvelope(envelope);
  const withIntegrity = canonicalizeEnvelope({ ...envelope, integrity: { algorithm: 'sha256', digest: 'deadbeef' } });
  assert.equal(withoutIntegrity, withIntegrity);
});

test('computeEnvelopeIntegrity matches a direct node:crypto digest of the canonical string', async () => {
  const envelope = fixtureEnvelope();
  const integrity = await computeEnvelopeIntegrity(envelope, { sha256Hex });
  const expectedDigest = sha256Hex(canonicalizeEnvelope(envelope));
  assert.equal(integrity.algorithm, 'sha256');
  assert.equal(integrity.digest, expectedDigest);
  assert.match(integrity.digest, /^[0-9a-f]{64}$/u);
});

test('computeEnvelopeIntegrity requires an injected hasher', async () => {
  await assert.rejects(() => computeEnvelopeIntegrity(fixtureEnvelope()), /injected sha256Hex/i);
});

test('withEnvelopeIntegrity is deterministic for identical content', async () => {
  const envelope = fixtureEnvelope();
  const first = await withEnvelopeIntegrity(envelope, { sha256Hex });
  const second = await withEnvelopeIntegrity(envelope, { sha256Hex });
  assert.deepEqual(first.integrity, second.integrity);
});

test('withEnvelopeIntegrity digest changes when any candidate, abstention, or validator changes (tamper detection)', async () => {
  const envelope = fixtureEnvelope();
  const original = await computeEnvelopeIntegrity(envelope, { sha256Hex });

  for (const tamper of [
    (draft) => { draft.fields[0].candidates[0].value = 'USD 999'; },
    (draft) => { draft.fields[0].abstentions[0].reason = 'A different reason'; },
    (draft) => { draft.validators[0].outcome = 'FLAG'; },
    (draft) => { draft.documents[0].contentSha256 = 'f'.repeat(64); },
    (draft) => { draft.model.canonicalModel = 'a-different-model'; },
  ]) {
    const tampered = structuredClone(envelope);
    tamper(tampered);
    const tamperedDigest = await computeEnvelopeIntegrity(tampered, { sha256Hex });
    assert.notEqual(tamperedDigest.digest, original.digest);
  }
});

test('replayEnvelope re-derives the digest from the envelope content and confirms it matches (no model call, no file I/O)', async () => {
  const envelope = await withEnvelopeIntegrity(fixtureEnvelope(), { sha256Hex });
  const replay = await replayEnvelope(envelope, { sha256Hex });

  assert.equal(replay.valid, true);
  assert.equal(replay.algorithm, 'sha256');
  assert.equal(replay.recomputedDigest, envelope.integrity.digest);
  assert.equal(replay.storedDigest, envelope.integrity.digest);
  assert.equal(replay.reason, null);
});

test('replayEnvelope detects a tampered envelope (digest mismatch)', async () => {
  const envelope = await withEnvelopeIntegrity(fixtureEnvelope(), { sha256Hex });
  const tampered = structuredClone(envelope);
  tampered.fields[0].candidates[0].value = 'USD 999,999';

  const replay = await replayEnvelope(tampered, { sha256Hex });
  assert.equal(replay.valid, false);
  assert.equal(replay.storedDigest, envelope.integrity.digest);
  assert.notEqual(replay.recomputedDigest, replay.storedDigest);
  assert.match(replay.reason, /does not match/iu);
});

test('replayEnvelope reports a clear reason for a missing or malformed envelope', async () => {
  assert.equal((await replayEnvelope(null, { sha256Hex })).valid, false);
  assert.equal((await replayEnvelope({}, { sha256Hex })).valid, false);
  assert.match((await replayEnvelope({}, { sha256Hex })).reason, /integrity\.digest/iu);
});

test('summarizeEnvelope counts documents, candidates, abstentions, and validator pass/flag outcomes', () => {
  const envelope = fixtureEnvelope();
  const summary = summarizeEnvelope(envelope);
  assert.equal(summary.fieldCount, 1);
  assert.equal(summary.documentCount, 2);
  assert.equal(summary.candidateCount, 1);
  assert.equal(summary.abstentionCount, 1);
  assert.equal(summary.validatorCount, 2);
  assert.equal(summary.validatorPassCount, 1);
  assert.equal(summary.validatorFlagCount, 1);
});
