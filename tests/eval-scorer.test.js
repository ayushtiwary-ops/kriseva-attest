import test from 'node:test';
import assert from 'node:assert/strict';
import { generateEvalDataset, scoreInstance, scoreResults } from '../scripts/run-eval.mjs';

// A hand-computed tiny fixture: six instances across all three governed
// fields, covering a correct extraction (with and without correct
// localization), a wrong-value extraction, a correct abstention, a
// hallucination, and one planted conflict pair. Expected numbers below are
// derived by hand in the same way a reader auditing EVAL.md would.
const instances = [
  { id: 'a', field: 'closing-nav', conflictGroup: null, expected: { found: true, normalizedValue: '100', location: 'L2' } },
  { id: 'b', field: 'closing-nav', conflictGroup: null, expected: { found: true, normalizedValue: '200', location: 'L3' } },
  { id: 'c', field: 'closing-nav', conflictGroup: null, expected: { found: false, normalizedValue: null, location: null } },
  { id: 'd', field: 'committed-capital', conflictGroup: 'g1', expected: { found: true, normalizedValue: '50', location: 'L2' } },
  { id: 'e', field: 'committed-capital', conflictGroup: 'g1', expected: { found: true, normalizedValue: '60', location: 'L2' } },
  { id: 'f', field: 'investor-complaints-closed', conflictGroup: null, expected: { found: false, normalizedValue: null, location: null } },
];

const resultsById = {
  a: { extraction: { found: true, normalizedValue: '100', location: 'L2' } }, // TP, located
  b: { extraction: { found: true, normalizedValue: '999', location: 'L3' } }, // wrong value: FP + FN
  c: { extraction: { found: false } }, // TN (correct abstention)
  d: { extraction: { found: true, normalizedValue: '50', location: 'L9' } }, // TP, mislocated
  e: { extraction: { found: true, normalizedValue: '60', location: 'L2' } }, // TP, located
  f: { extraction: { found: true, normalizedValue: '3' } }, // hallucination: FP
};

test('scoreInstance classifies each of the five outcome shapes correctly', () => {
  assert.deepEqual(scoreInstance({ found: false }, { found: false }), { outcome: 'TN' });
  assert.deepEqual(scoreInstance({ found: false }, { found: true, normalizedValue: '1' }), { outcome: 'FP', reason: 'hallucinated-value' });
  assert.deepEqual(scoreInstance({ found: true, normalizedValue: '1' }, { found: false }), { outcome: 'FN', reason: 'missed-value' });
  assert.deepEqual(
    scoreInstance({ found: true, normalizedValue: '1', location: 'L1' }, { found: true, normalizedValue: '1', location: 'L1' }),
    { outcome: 'TP', locationMatches: true },
  );
  assert.deepEqual(
    scoreInstance({ found: true, normalizedValue: '1', location: 'L1' }, { found: true, normalizedValue: '1', location: 'L9' }),
    { outcome: 'TP', locationMatches: false },
  );
  assert.deepEqual(scoreInstance({ found: true, normalizedValue: '1' }, { found: true, normalizedValue: '2' }), { outcome: 'FP_FN', reason: 'wrong-value' });
});

test('scoreResults computes exact precision, recall, F1, coverage, abstention, localization, and human-review-remaining rates on the tiny fixture', () => {
  const metrics = scoreResults(instances, resultsById);

  // Overall: tp={a,d,e}=3, fp={b,f}=2, fn={b}=1, tn={c}=1.
  assert.equal(metrics.overall.total, 6);
  assert.equal(metrics.overall.tp, 3);
  assert.equal(metrics.overall.fp, 2);
  assert.equal(metrics.overall.fn, 1);
  assert.equal(metrics.overall.tn, 1);
  assert.equal(metrics.overall.precision, 3 / 5);
  assert.equal(metrics.overall.recall, 3 / 4);
  assert.ok(Math.abs(metrics.overall.f1 - (2 * (3 / 5) * (3 / 4)) / ((3 / 5) + (3 / 4))) < 1e-9);
  assert.equal(metrics.overall.coverage, 1); // every expected-positive instance got an attempted extraction
  assert.equal(metrics.overall.abstentionRate, 1 / 6); // only c abstained
  assert.equal(metrics.overall.evidenceLocalizationRate, 2 / 3); // a and e located out of tp={a,d,e}
  assert.equal(metrics.overall.humanReviewRemainingRate, 3 / 6);

  // closing-nav = {a, b, c}: tp=1(a), fp=1(b), fn=1(b), tn=1(c).
  const closingNav = metrics.byField['closing-nav'];
  assert.equal(closingNav.precision, 0.5);
  assert.equal(closingNav.recall, 0.5);
  assert.equal(closingNav.coverage, 1);
  assert.equal(closingNav.abstentionRate, 1 / 3);
  assert.equal(closingNav.evidenceLocalizationRate, 1); // only a is TP, and a is located

  // committed-capital = {d, e}: both TP, d mislocated, e located.
  const committedCapital = metrics.byField['committed-capital'];
  assert.equal(committedCapital.precision, 1);
  assert.equal(committedCapital.recall, 1);
  assert.equal(committedCapital.evidenceLocalizationRate, 0.5);
  assert.equal(committedCapital.humanReviewRemainingRate, 0);

  // investor-complaints-closed = {f}: hallucination, expected negative denominators are null.
  const complaints = metrics.byField['investor-complaints-closed'];
  assert.equal(complaints.precision, 0);
  assert.equal(complaints.recall, null); // tp+fn = 0
  assert.equal(complaints.f1, 0);
  assert.equal(complaints.coverage, null); // expectedPositive = 0
  assert.equal(complaints.evidenceLocalizationRate, null); // tp = 0
  assert.equal(complaints.humanReviewRemainingRate, 1);

  // Conflict group g1 = {d, e}: both correctly (TP) and independently extracted.
  assert.equal(metrics.conflictDetection.totalGroups, 1);
  assert.equal(metrics.conflictDetection.detectedGroups, 1);
  assert.equal(metrics.conflictDetection.recall, 1);
});

test('scoreResults marks a conflict group as not detected if either member is wrong or missed', () => {
  const groupInstances = [
    { id: 'x', field: 'closing-nav', conflictGroup: 'g2', expected: { found: true, normalizedValue: '10', location: 'L1' } },
    { id: 'y', field: 'closing-nav', conflictGroup: 'g2', expected: { found: true, normalizedValue: '20', location: 'L1' } },
  ];
  const wrongValueResults = {
    x: { extraction: { found: true, normalizedValue: '10', location: 'L1' } },
    y: { extraction: { found: true, normalizedValue: '999', location: 'L1' } },
  };
  const wrongMetrics = scoreResults(groupInstances, wrongValueResults);
  assert.equal(wrongMetrics.conflictDetection.detectedGroups, 0);

  const missedResults = {
    x: { extraction: { found: true, normalizedValue: '10', location: 'L1' } },
    y: { extraction: { found: false } },
  };
  const missedMetrics = scoreResults(groupInstances, missedResults);
  assert.equal(missedMetrics.conflictDetection.detectedGroups, 0);
});

test('scoreResults excludes errored calls from precision/recall but still counts them in totals', () => {
  const errorInstances = [
    { id: 'p', field: 'closing-nav', conflictGroup: null, expected: { found: true, normalizedValue: '1', location: 'L1' } },
    { id: 'q', field: 'closing-nav', conflictGroup: null, expected: { found: true, normalizedValue: '2', location: 'L1' } },
  ];
  const errorResults = {
    p: { extraction: { found: true, normalizedValue: '1', location: 'L1' } },
    q: { error: 'claude CLI call timed out after 90000ms' },
  };
  const metrics = scoreResults(errorInstances, errorResults);
  assert.equal(metrics.overall.total, 2);
  assert.equal(metrics.overall.errors, 1);
  assert.equal(metrics.overall.tp, 1);
  assert.equal(metrics.overall.precision, 1);
  assert.equal(metrics.overall.recall, 1); // the errored instance contributes to neither tp nor fn
});

test('generateEvalDataset produces at least 50 labeled instances with unique ids, one document per instance, and the same three governed fields as data/synthetic-case.json', () => {
  const { instances: generated, documents } = generateEvalDataset();
  assert.ok(generated.length >= 50, `expected at least 50 instances, got ${generated.length}`);
  assert.equal(documents.length, generated.length);

  const ids = new Set(generated.map((instance) => instance.id));
  assert.equal(ids.size, generated.length, 'instance ids must be unique');

  const fields = new Set(generated.map((instance) => instance.field));
  assert.deepEqual([...fields].sort(), ['closing-nav', 'committed-capital', 'investor-complaints-closed']);

  for (const instance of generated) {
    assert.equal(typeof instance.expected.found, 'boolean');
    if (instance.expected.found) {
      assert.equal(typeof instance.expected.normalizedValue, 'string');
      assert.match(instance.expected.location, /^L\d+$/u);
    } else {
      assert.equal(instance.expected.normalizedValue, null);
      assert.equal(instance.expected.location, null);
    }
  }

  const conflictGroups = new Map();
  for (const instance of generated) {
    if (!instance.conflictGroup) continue;
    conflictGroups.set(instance.conflictGroup, (conflictGroups.get(instance.conflictGroup) ?? 0) + 1);
  }
  assert.ok(conflictGroups.size > 0, 'at least one planted conflict group is expected');
  for (const count of conflictGroups.values()) assert.equal(count, 2, 'each conflict group must have exactly two members');
});

test('generateEvalDataset is deterministic across calls (same ids, same expected values)', () => {
  const first = generateEvalDataset();
  const second = generateEvalDataset();
  assert.deepEqual(first.instances, second.instances);
  assert.deepEqual(first.documents, second.documents);
});
