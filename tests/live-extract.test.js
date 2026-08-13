import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GOVERNED_FIELDS,
  buildExtractionPrompt,
  computeValidators,
  instructionTemplateSha256,
  numberLines,
  parseModelJson,
} from '../scripts/live-extract.mjs';

test('numberLines prefixes every line with a stable L<n>: label', () => {
  assert.equal(numberLines('a\nb\nc'), 'L1: a\nL2: b\nL3: c');
  assert.equal(numberLines(''), 'L1: ');
  assert.equal(numberLines('a\r\nb'), 'L1: a\nL2: b');
});

test('buildExtractionPrompt fills every placeholder and leaves none unfilled', () => {
  const field = GOVERNED_FIELDS.find((candidate) => candidate.id === 'closing-nav');
  const prompt = buildExtractionPrompt({
    field,
    documentLabel: 'Administrator statement',
    documentText: 'Closing NAV: USD 100',
  });
  assert.match(prompt, /Closing NAV/u);
  assert.match(prompt, /Administrator statement/u);
  assert.match(prompt, /L1: Closing NAV: USD 100/u);
  assert.equal(prompt.includes('{{'), false, 'no unfilled placeholders should remain');
});

test('instructionTemplateSha256 is a stable 64-hex-char digest independent of any particular call', () => {
  const first = instructionTemplateSha256();
  const second = instructionTemplateSha256();
  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{64}$/u);
});

test('parseModelJson accepts raw JSON, a fenced code block, and JSON preceded by stray prose', () => {
  const expected = { found: true, value: 'USD 100' };
  assert.deepEqual(parseModelJson(JSON.stringify(expected)), expected);
  assert.deepEqual(parseModelJson(`\`\`\`json\n${JSON.stringify(expected)}\n\`\`\``), expected);
  assert.deepEqual(parseModelJson(`Here you go:\n${JSON.stringify(expected)}`), expected);
});

test('parseModelJson throws a descriptive error for genuinely non-JSON output', () => {
  assert.throws(() => parseModelJson('not json at all'), /not valid JSON/iu);
});

// --- computeValidators: deterministic checks over already-collected candidates ---

const CLOSING_NAV = { id: 'closing-nav', label: 'Closing NAV' };
const COMMITTED_CAPITAL = { id: 'committed-capital', label: 'Committed capital' };
const FIELDS = [CLOSING_NAV, COMMITTED_CAPITAL];

function result(fieldId, documentId, extraction) {
  return { fieldId, documentId, extraction };
}

test('currency-format validator PASSes when every candidate matches a recognized USD format, FLAGs otherwise', () => {
  const documents = [
    { id: 'doc-a', label: 'Doc A', documentDate: '2026-07-01', declaredFingerprint: 'fp-a' },
    { id: 'doc-b', label: 'Doc B', documentDate: '2026-07-01', declaredFingerprint: 'fp-b' },
  ];
  const goodResults = [
    result('closing-nav', 'doc-a', { found: true, value: 'USD 12,400,000', normalizedValue: '12400000' }),
    result('committed-capital', 'doc-b', { found: true, value: '25,000,000 USD', normalizedValue: '25000000' }),
  ];
  const goodValidators = computeValidators(FIELDS, documents, goodResults, '2026-06-30');
  const closingNavFormat = goodValidators.find((v) => v.id === 'closing-nav-currency-format');
  assert.equal(closingNavFormat.outcome, 'PASS');

  const badResults = [
    result('closing-nav', 'doc-a', { found: true, value: 'twelve million', normalizedValue: '12000000' }),
    result('committed-capital', 'doc-b', { found: true, value: '25,000,000 USD', normalizedValue: '25000000' }),
  ];
  const badValidators = computeValidators(FIELDS, documents, badResults, '2026-06-30');
  const badFormat = badValidators.find((v) => v.id === 'closing-nav-currency-format');
  assert.equal(badFormat.outcome, 'FLAG');
  assert.equal(badFormat.detail, 'INVALID_FORMAT');
});

test('cross-document-equality validator PASSes on agreement, FLAGs on conflict or on zero candidates', () => {
  const documents = [
    { id: 'doc-a', label: 'Doc A', documentDate: '2026-07-01', declaredFingerprint: 'fp-a' },
    { id: 'doc-b', label: 'Doc B', documentDate: '2026-07-01', declaredFingerprint: 'fp-b' },
  ];

  const agreeing = computeValidators(FIELDS, documents, [
    result('closing-nav', 'doc-a', { found: true, value: 'USD 100', normalizedValue: '100' }),
    result('closing-nav', 'doc-b', { found: true, value: '100 USD', normalizedValue: '100' }),
    result('committed-capital', 'doc-a', { found: false }),
    result('committed-capital', 'doc-b', { found: false }),
  ], '2026-06-30');
  assert.equal(agreeing.find((v) => v.id === 'closing-nav-cross-document-equality').outcome, 'PASS');
  const noCandidates = agreeing.find((v) => v.id === 'committed-capital-cross-document-equality');
  assert.equal(noCandidates.outcome, 'FLAG');
  assert.equal(noCandidates.detail, 'NO_CANDIDATES');

  const disagreeing = computeValidators(FIELDS, documents, [
    result('closing-nav', 'doc-a', { found: true, value: 'USD 100', normalizedValue: '100' }),
    result('closing-nav', 'doc-b', { found: true, value: 'USD 200', normalizedValue: '200' }),
    result('committed-capital', 'doc-a', { found: false }),
    result('committed-capital', 'doc-b', { found: false }),
  ], '2026-06-30');
  const conflict = disagreeing.find((v) => v.id === 'closing-nav-cross-document-equality');
  assert.equal(conflict.outcome, 'FLAG');
  assert.equal(conflict.detail, 'CONFLICT');
});

test('evidence-coverage validator mirrors risk-engine.js: FLAGs zero-candidate fields, PASSes covered fields', () => {
  const documents = [{ id: 'doc-a', label: 'Doc A', documentDate: '2026-07-01', declaredFingerprint: 'fp-a' }];
  const results = [
    result('closing-nav', 'doc-a', { found: true, value: 'USD 100', normalizedValue: '100' }),
    result('committed-capital', 'doc-a', { found: false }),
  ];
  const validators = computeValidators(FIELDS, documents, results, '2026-06-30');
  assert.equal(validators.find((v) => v.id === 'closing-nav-evidence-coverage').outcome, 'PASS');
  const uncovered = validators.find((v) => v.id === 'committed-capital-evidence-coverage');
  assert.equal(uncovered.outcome, 'FLAG');
  assert.equal(uncovered.detail, 'NO_EVIDENCE_COVERAGE');
  assert.match(uncovered.reference, /0 of 1 documents produced a candidate/u);
});

test('duplicate-fingerprint validator FLAGs two documents sharing a declared fingerprint, PASSes otherwise', () => {
  const duplicated = computeValidators(FIELDS, [
    { id: 'doc-a', label: 'Doc A', documentDate: '2026-07-01', declaredFingerprint: 'same-fp' },
    { id: 'doc-b', label: 'Doc B', documentDate: '2026-07-01', declaredFingerprint: 'same-fp' },
  ], [], '2026-06-30');
  const dupCheck = duplicated.find((v) => v.id === 'duplicate-fingerprint-check');
  assert.equal(dupCheck.outcome, 'FLAG');
  assert.match(dupCheck.reference, /doc-a & doc-b/u);

  const unique = computeValidators(FIELDS, [
    { id: 'doc-a', label: 'Doc A', documentDate: '2026-07-01', declaredFingerprint: 'fp-a' },
    { id: 'doc-b', label: 'Doc B', documentDate: '2026-07-01', declaredFingerprint: 'fp-b' },
  ], [], '2026-06-30');
  assert.equal(unique.find((v) => v.id === 'duplicate-fingerprint-check').outcome, 'PASS');
});

test('stale-source validator FLAGs a source dated more than 30 days before the quarter end, matching risk-engine.js semantics', () => {
  const stale = computeValidators(FIELDS, [
    { id: 'doc-a', label: 'Doc A', documentDate: '2026-05-01', declaredFingerprint: 'fp-a' },
  ], [], '2026-06-30');
  const staleCheck = stale.find((v) => v.id === 'stale-source-check');
  assert.equal(staleCheck.outcome, 'FLAG');
  assert.match(staleCheck.reference, /60 days stale/u);

  const current = computeValidators(FIELDS, [
    { id: 'doc-a', label: 'Doc A', documentDate: '2026-06-15', declaredFingerprint: 'fp-a' },
  ], [], '2026-06-30');
  assert.equal(current.find((v) => v.id === 'stale-source-check').outcome, 'PASS');
});
