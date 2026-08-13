import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadCase,
  runEvidenceReview,
  recordDecision,
  recordRiskDisposition,
  recordSignOff,
  hasConflictDecision,
  canSignOff,
  pendingSignOffGates
} from '../src/case-engine.js';
import { computeAnomalyFlags } from '../src/risk-engine.js';
import fixture from '../data/synthetic-case.json' with { type: 'json' };

function decidedFixture(reviewer = 'Rhea Menon') {
  return recordDecision(runEvidenceReview(loadCase(fixture)), 'committed-capital', {
    action: 'ACCEPT',
    candidateId: 'admin-committed',
    reviewer,
    reason: 'Synthetic reviewer decision.',
    recordedAt: '2026-08-12T09:30:00.000Z'
  });
}

// decidedFixture() accepts the higher candidate, so all four designed
// anomaly flags are active by that point. This helper dispositions every
// currently-active flag so the sign-off gate opens.
function dispositionAllFlags(state, recordedAt = '2026-08-12T09:40:00.000Z') {
  return computeAnomalyFlags(state).reduce((accumulatedState, flag) => recordRiskDisposition(accumulatedState, flag.id, {
    action: 'ACKNOWLEDGE',
    disposerName: 'Kavya Rao',
    reason: 'Reviewed and acknowledged for this synthetic demo case.',
    recordedAt
  }), state);
}

function readyForSignOff(reviewer = 'Rhea Menon') {
  return dispositionAllFlags(decidedFixture(reviewer));
}

test('review preserves supported, conflicting, and unsupported states', () => {
  const reviewed = runEvidenceReview(loadCase(fixture));
  assert.deepEqual(reviewed.fields.map((field) => field.status), [
    'SUPPORTED', 'CONFLICTING', 'UNSUPPORTED'
  ]);
});

test('two unequal candidates can never become supported by source count', () => {
  const reviewed = runEvidenceReview(loadCase(fixture));
  const committed = reviewed.fields.find((field) => field.id === 'committed-capital');
  assert.equal(committed.status, 'CONFLICTING');
  assert.equal(committed.selectedCandidateId, null);
});

test('conflict decision requires a reviewer and reason before sign-off', () => {
  const reviewed = runEvidenceReview(loadCase(fixture));
  assert.throws(() => recordDecision(reviewed, 'committed-capital', {
    action: 'ACCEPT', candidateId: 'admin-committed', reviewer: '', reason: ''
  }), /reviewer and reason/i);
  assert.equal(canSignOff(reviewed), false);
});

test('recorded decisions preserve a supplied timestamp', () => {
  const reviewed = runEvidenceReview(loadCase(fixture));
  const decision = recordDecision(reviewed, 'committed-capital', {
    action: 'ACCEPT',
    candidateId: 'admin-committed',
    reviewer: 'Rhea Menon',
    reason: 'Synthetic reviewer decision.',
    recordedAt: '2026-08-12T09:30:00.000Z'
  });

  assert.equal(decision.decisions[0].recordedAt, '2026-08-12T09:30:00.000Z');
});

for (const [action, expectedCandidateId] of [
  ['ACCEPT', 'admin-committed'],
  ['CORRECT', 'admin-committed'],
  ['REJECT', null],
  ['DEFER', null]
]) {
  test(`${action} canonicalizes candidate attribution to ${expectedCandidateId ?? 'none'}`, () => {
    const reviewed = runEvidenceReview(loadCase(fixture));
    const decided = recordDecision(reviewed, 'committed-capital', {
      action,
      candidateId: 'admin-committed',
      reviewer: 'Priya Nair',
      reason: 'Synthetic reviewer decision.',
      recordedAt: '2026-08-12T12:00:00+05:30'
    });

    assert.equal(decided.decisions[0].candidateId, expectedCandidateId);
    assert.equal(
      decided.fields.find(({ id }) => id === 'committed-capital').selectedCandidateId,
      expectedCandidateId
    );
  });
}

test('sign-off is blocked until evidence review completes', () => {
  assert.equal(canSignOff(loadCase(fixture)), false);
});

test('decisions require evidence review first', () => {
  assert.throws(() => recordDecision(loadCase(fixture), 'committed-capital', {
    action: 'ACCEPT',
    candidateId: 'admin-committed',
    reviewer: 'Rhea Menon',
    reason: 'Synthetic reviewer decision.',
    recordedAt: '2026-08-12T09:30:00.000Z'
  }), /reviewed/i);
});

test('hasConflictDecision is false before evidence review and before a decision', () => {
  assert.equal(hasConflictDecision(loadCase(fixture)), false);
  assert.equal(hasConflictDecision(runEvidenceReview(loadCase(fixture))), false);
});

test('hasConflictDecision is true once the conflict decision is recorded, independent of sign-off', () => {
  assert.equal(hasConflictDecision(decidedFixture()), true);
});

test('sign-off is blocked without a Principal Officer confirmation even after the conflict is decided', () => {
  const decided = decidedFixture();
  assert.equal(canSignOff(decided), false);
});

test('recordSignOff requires the conflict decision to exist first', () => {
  const reviewed = runEvidenceReview(loadCase(fixture));
  assert.throws(() => recordSignOff(reviewed, {
    officerName: 'Arjun Verma',
    confirmed: true,
    recordedAt: '2026-08-12T09:45:00.000Z'
  }), /conflict decision/i);
});

test('recordSignOff is blocked until every active anomaly flag has a disposition, even with a conflict decision on file', () => {
  const decided = decidedFixture(); // higher-value ACCEPT: all four flags are active
  assert.throws(() => recordSignOff(decided, {
    officerName: 'Arjun Verma',
    confirmed: true,
    recordedAt: '2026-08-12T09:45:00.000Z'
  }), /active anomaly flag/i);
  assert.equal(canSignOff(decided), false);
});

test('pendingSignOffGates names conflict-decision and anomaly-dispositions in order, clearing as each gate closes', () => {
  const reviewed = runEvidenceReview(loadCase(fixture));
  assert.deepEqual(pendingSignOffGates(reviewed), ['conflict-decision', 'anomaly-dispositions']);

  const decided = decidedFixture();
  assert.deepEqual(pendingSignOffGates(decided), ['anomaly-dispositions']);

  const dispositioned = dispositionAllFlags(decided);
  assert.deepEqual(pendingSignOffGates(dispositioned), []);
});

test('recordSignOff requires a non-empty Principal Officer name', () => {
  const ready = readyForSignOff();
  assert.throws(() => recordSignOff(ready, {
    officerName: '   ',
    confirmed: true,
    recordedAt: '2026-08-12T09:45:00.000Z'
  }), /officer name/i);
});

test('recordSignOff requires the confirmation checkbox to be checked', () => {
  const ready = readyForSignOff();
  assert.throws(() => recordSignOff(ready, {
    officerName: 'Arjun Verma',
    confirmed: false,
    recordedAt: '2026-08-12T09:45:00.000Z'
  }), /confirm/i);
});

test('recordSignOff blocked when the officer name matches the deciding reviewer (trimmed, case-insensitive)', () => {
  const ready = readyForSignOff('Rhea Menon');
  assert.throws(() => recordSignOff(ready, {
    officerName: '  rhea menon  ',
    confirmed: true,
    recordedAt: '2026-08-12T09:45:00.000Z'
  }), /maker-checker separation: the confirming officer must differ from the deciding reviewer/i);
});

test('recordSignOff allowed and clears the sign-off gate when the officer name is distinct', () => {
  const ready = readyForSignOff('Rhea Menon');
  const signedOff = recordSignOff(ready, {
    officerName: 'Arjun Verma',
    confirmed: true,
    recordedAt: '2026-08-12T09:45:00.000Z'
  });

  assert.equal(canSignOff(signedOff), true);
  assert.deepEqual(pendingSignOffGates(signedOff), []);
  assert.deepEqual(signedOff.signOff, {
    officerName: 'Arjun Verma',
    confirmed: true,
    recordedAt: '2026-08-12T09:45:00.000Z'
  });
});

test('recordSignOff trims the officer name before storing it', () => {
  const ready = readyForSignOff('Rhea Menon');
  const signedOff = recordSignOff(ready, {
    officerName: '  Arjun Verma  ',
    confirmed: true,
    recordedAt: '2026-08-12T09:45:00.000Z'
  });

  assert.equal(signedOff.signOff.officerName, 'Arjun Verma');
});
