import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCase, runEvidenceReview, recordDecision, recordRiskDisposition, canSignOff } from '../src/case-engine.js';
import {
  computeAnomalyFlags,
  computeRiskIndicators,
  validateDisposition,
  hasDisposition,
  latestDisposition,
  allFlagsDispositioned,
  buildAnomalyFindings
} from '../src/risk-engine.js';
import fixture from '../data/synthetic-case.json' with { type: 'json' };

function reviewedState() {
  return runEvidenceReview(loadCase(fixture));
}

function decidedState(action = 'ACCEPT', candidateId = 'admin-committed') {
  return recordDecision(reviewedState(), 'committed-capital', {
    action,
    candidateId,
    reviewer: 'Rhea Menon',
    reason: 'Synthetic reviewer decision.',
    recordedAt: '2026-08-12T09:30:00.000Z'
  });
}

const flagIds = (flags) => flags.map((flag) => flag.id);

test('no-evidence-coverage flag fires whenever investor complaints closed has zero candidates', () => {
  const flags = computeAnomalyFlags(reviewedState());
  assert.ok(flagIds(flags).includes('no-evidence-coverage'));
  const flag = flags.find((candidate) => candidate.id === 'no-evidence-coverage');
  assert.equal(flag.severity, 'HIGH');
  assert.equal(flag.lens, 'COMPLIANCE');
  assert.match(flag.reference, /investor-complaints-closed/u);
});

test('no-evidence-coverage flag does not fire once the field has at least one candidate', () => {
  const withEvidence = structuredClone(fixture);
  withEvidence.fields[2].candidates.push({
    id: 'synthetic-complaint-log',
    sourceId: 'internal-ledger',
    value: '0 open complaints',
    normalizedValue: '0',
    reference: 'Complaint log, page 1'
  });
  const flags = computeAnomalyFlags(runEvidenceReview(loadCase(withEvidence)));
  assert.equal(flagIds(flags).includes('no-evidence-coverage'), false);
});

test('duplicate-fingerprint flag fires for the planted synthetic collision and names both sources', () => {
  const flags = computeAnomalyFlags(reviewedState());
  const flag = flags.find((candidate) => candidate.id === 'duplicate-fingerprint');
  assert.ok(flag, 'expected duplicate-fingerprint flag to fire');
  assert.equal(flag.severity, 'HIGH');
  assert.equal(flag.lens, 'FRAUD ANALYSIS');
  assert.equal(flag.explanation, 'Two distinct claimed sources carry an identical document fingerprint.');
  assert.match(flag.reference, /internal-ledger/u);
  assert.match(flag.reference, /nav-custodian-confirmation/u);
  assert.match(flag.reference, /synthetic:ledger:38a4c1/u);
});

test('duplicate-fingerprint flag does not fire when every fingerprint is unique', () => {
  const uniqueFixture = structuredClone(fixture);
  uniqueFixture.sources = uniqueFixture.sources.filter((source) => source.id !== 'nav-custodian-confirmation');
  const flags = computeAnomalyFlags(runEvidenceReview(loadCase(uniqueFixture)));
  assert.equal(flagIds(flags).includes('duplicate-fingerprint'), false);
});

test('conflict-resolved-higher flag is absent before any conflict decision', () => {
  const flags = computeAnomalyFlags(reviewedState());
  assert.equal(flagIds(flags).includes('conflict-resolved-higher'), false);
});

test('conflict-resolved-higher flag fires only once the higher candidate (USD 25,000,000) is accepted', () => {
  const flags = computeAnomalyFlags(decidedState('ACCEPT', 'admin-committed'));
  const flag = flags.find((candidate) => candidate.id === 'conflict-resolved-higher');
  assert.ok(flag, 'expected conflict-resolved-higher flag to fire for the higher candidate');
  assert.equal(flag.severity, 'MEDIUM');
  assert.equal(flag.lens, 'FRAUD ANALYSIS');
  assert.equal(
    flag.explanation,
    'The recorded decision accepted the higher of two conflicting values; the reason is retained for review.'
  );
  assert.match(flag.reference, /USD 25,000,000/u);
});

test('conflict-resolved-higher flag does not fire when the lower candidate is accepted', () => {
  const flags = computeAnomalyFlags(decidedState('ACCEPT', 'board-committed'));
  assert.equal(flagIds(flags).includes('conflict-resolved-higher'), false);
});

test('conflict-resolved-higher flag does not fire for REJECT or DEFER (no candidate attributed)', () => {
  for (const action of ['REJECT', 'DEFER']) {
    const flags = computeAnomalyFlags(decidedState(action, 'admin-committed'));
    assert.equal(flagIds(flags).includes('conflict-resolved-higher'), false, `unexpected flag for ${action}`);
  }
});

test('stale-source flag fires for the subscription register extract dated more than 30 days before quarter end', () => {
  const flags = computeAnomalyFlags(reviewedState());
  const flag = flags.find((candidate) => candidate.id === 'stale-source');
  assert.ok(flag, 'expected stale-source flag to fire');
  assert.equal(flag.severity, 'LOW');
  assert.equal(flag.lens, 'RISK');
  assert.match(flag.reference, /board-schedule/u);
  assert.match(flag.reference, /2026-05-12/u);
});

test('stale-source flag does not fire once the document date is within 30 days of quarter end', () => {
  const freshFixture = structuredClone(fixture);
  freshFixture.sources.find((source) => source.id === 'board-schedule').documentDate = '2026-06-15';
  const flags = computeAnomalyFlags(runEvidenceReview(loadCase(freshFixture)));
  assert.equal(flagIds(flags).includes('stale-source'), false);
});

test('exactly the four designed flags fire on the unmodified fixture after a higher-value decision', () => {
  const flags = computeAnomalyFlags(decidedState('ACCEPT', 'admin-committed'));
  assert.deepEqual(
    flagIds(flags).toSorted(),
    ['conflict-resolved-higher', 'duplicate-fingerprint', 'no-evidence-coverage', 'stale-source'].toSorted()
  );
});

test('three flags fire before any conflict decision is recorded', () => {
  const flags = computeAnomalyFlags(reviewedState());
  assert.deepEqual(
    flagIds(flags).toSorted(),
    ['duplicate-fingerprint', 'no-evidence-coverage', 'stale-source'].toSorted()
  );
});

test('computeRiskIndicators reports evidence coverage 2/3, conflict rate 1/3, and abstention count 1', () => {
  const indicators = computeRiskIndicators(reviewedState());
  const byId = Object.fromEntries(indicators.map((indicator) => [indicator.id, indicator]));
  assert.equal(byId['evidence-coverage'].value, '2/3');
  assert.equal(byId['conflict-rate'].value, '1/3');
  assert.equal(byId['abstention-count'].value, '1');
  for (const indicator of indicators) {
    assert.ok(indicator.explanation.length > 0, `${indicator.id} needs a plain-English explanation`);
    assert.ok(indicator.reference.length > 0, `${indicator.id} needs an exact evidence reference`);
  }
});

test('computeRiskIndicators reports decision override direction before and after a decision', () => {
  const before = computeRiskIndicators(reviewedState());
  assert.equal(before.find(({ id }) => id === 'override-direction').value, 'Not yet decided');

  const higher = computeRiskIndicators(decidedState('ACCEPT', 'admin-committed'));
  assert.equal(higher.find(({ id }) => id === 'override-direction').value, 'Higher value accepted');

  const lower = computeRiskIndicators(decidedState('ACCEPT', 'board-committed'));
  assert.equal(lower.find(({ id }) => id === 'override-direction').value, 'Lower value accepted');

  const deferred = computeRiskIndicators(decidedState('DEFER', 'admin-committed'));
  assert.equal(deferred.find(({ id }) => id === 'override-direction').value, 'No value accepted');
});

test('computeRiskIndicators reports maker-checker separation status pending until sign-off is confirmed', () => {
  const indicators = computeRiskIndicators(decidedState());
  assert.equal(indicators.find(({ id }) => id === 'maker-checker-separation').value, 'pending');
});

test('computeRiskIndicators reports open anomaly count and shrinks it as flags are dispositioned', () => {
  const decided = decidedState('ACCEPT', 'admin-committed');
  const flags = computeAnomalyFlags(decided);
  assert.equal(computeRiskIndicators(decided).find(({ id }) => id === 'open-anomaly-count').value, `${flags.length}`);

  const oneDispositioned = recordRiskDisposition(decided, flags[0].id, {
    action: 'ACKNOWLEDGE',
    disposerName: 'Kavya Rao',
    reason: 'Reviewed for this synthetic demo case.',
    recordedAt: '2026-08-12T09:40:00.000Z'
  });
  assert.equal(
    computeRiskIndicators(oneDispositioned).find(({ id }) => id === 'open-anomaly-count').value,
    `${flags.length - 1}`
  );
});

test('validateDisposition requires a recognized action, a disposer name, and a reason', () => {
  assert.deepEqual(validateDisposition({ action: 'ACKNOWLEDGE', disposerName: 'Kavya Rao', reason: 'Reviewed.' }), null);
  assert.equal(validateDisposition({}).field, 'action');
  assert.equal(validateDisposition({ action: 'BOGUS', disposerName: 'A', reason: 'B' }).field, 'action');
  assert.equal(validateDisposition({ action: 'ESCALATE', disposerName: '  ', reason: 'B' }).field, 'disposerName');
  assert.equal(validateDisposition({ action: 'ESCALATE', disposerName: 'A', reason: '  ' }).field, 'reason');
});

test('recordRiskDisposition rejects an unknown or currently-inactive flag id', () => {
  const decided = decidedState('ACCEPT', 'board-committed'); // lower value: conflict-resolved-higher is inactive
  assert.throws(() => recordRiskDisposition(decided, 'conflict-resolved-higher', {
    action: 'ACKNOWLEDGE',
    disposerName: 'Kavya Rao',
    reason: 'Reviewed.',
    recordedAt: '2026-08-12T09:40:00.000Z'
  }), /unknown or inactive/i);
});

test('recordRiskDisposition rejects a disposition missing action, disposer name, or reason', () => {
  const decided = decidedState('ACCEPT', 'admin-committed');
  const flagId = computeAnomalyFlags(decided)[0].id;
  assert.throws(() => recordRiskDisposition(decided, flagId, {
    action: 'ACKNOWLEDGE', disposerName: '', reason: 'Reviewed.'
  }), /disposer name/i);
  assert.throws(() => recordRiskDisposition(decided, flagId, {
    action: 'ACKNOWLEDGE', disposerName: 'Kavya Rao', reason: ''
  }), /reason/i);
});

test('recordRiskDisposition records a deterministic timestamp like existing decisions and is retrievable by flag id', () => {
  const decided = decidedState('ACCEPT', 'admin-committed');
  const flagId = computeAnomalyFlags(decided)[0].id;
  const dispositioned = recordRiskDisposition(decided, flagId, {
    action: 'ESCALATE',
    disposerName: 'Kavya Rao',
    reason: 'Escalated for a second look.',
    recordedAt: '2026-08-12T09:40:00.000Z'
  });
  assert.equal(hasDisposition(dispositioned, flagId), true);
  assert.deepEqual(latestDisposition(dispositioned, flagId), {
    flagId,
    action: 'ESCALATE',
    disposerName: 'Kavya Rao',
    reason: 'Escalated for a second look.',
    recordedAt: '2026-08-12T09:40:00.000Z'
  });
});

test('buildAnomalyFindings pairs each flag with its disposition (or null when open)', () => {
  const decided = decidedState('ACCEPT', 'admin-committed');
  const findings = buildAnomalyFindings(decided);
  assert.equal(findings.length, computeAnomalyFlags(decided).length);
  assert.ok(findings.every((finding) => finding.disposition === null));

  const flagId = findings[0].id;
  const dispositioned = recordRiskDisposition(decided, flagId, {
    action: 'ACKNOWLEDGE',
    disposerName: 'Kavya Rao',
    reason: 'Reviewed for this synthetic demo case.',
    recordedAt: '2026-08-12T09:40:00.000Z'
  });
  const updatedFindings = buildAnomalyFindings(dispositioned);
  assert.equal(updatedFindings.find((finding) => finding.id === flagId).disposition.disposerName, 'Kavya Rao');
});

test('allFlagsDispositioned and canSignOff are false until every active flag has a disposition, then true', () => {
  let state = decidedState('ACCEPT', 'admin-committed');
  const flags = computeAnomalyFlags(state);
  assert.equal(allFlagsDispositioned(state), false);
  assert.equal(canSignOff(state), false);

  for (const flag of flags) {
    state = recordRiskDisposition(state, flag.id, {
      action: 'ACKNOWLEDGE',
      disposerName: 'Kavya Rao',
      reason: 'Reviewed for this synthetic demo case.',
      recordedAt: '2026-08-12T09:40:00.000Z'
    });
  }
  assert.equal(allFlagsDispositioned(state), true);
});

test('flag order is fixed regardless of dispositions recorded', () => {
  const decided = decidedState('ACCEPT', 'admin-committed');
  const order = flagIds(computeAnomalyFlags(decided));
  const dispositioned = recordRiskDisposition(decided, order[0], {
    action: 'ACKNOWLEDGE',
    disposerName: 'Kavya Rao',
    reason: 'Reviewed for this synthetic demo case.',
    recordedAt: '2026-08-12T09:40:00.000Z'
  });
  assert.deepEqual(flagIds(computeAnomalyFlags(dispositioned)), order);
});

test('claim safety: no flag copy contains banned fraud-detection capability language', () => {
  const decided = decidedState('ACCEPT', 'admin-committed');
  const flags = computeAnomalyFlags(decided);
  const banned = /\bdetects? fraud\b|\bfraud detection\b|\bprevents? fraud\b/iu;
  for (const flag of flags) {
    assert.doesNotMatch(flag.title, banned);
    assert.doesNotMatch(flag.explanation, banned);
    assert.doesNotMatch(flag.reference, banned);
  }
});
