import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCase, runEvidenceReview, recordDecision, canSignOff } from '../src/case-engine.js';
import fixture from '../data/synthetic-case.json' with { type: 'json' };

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
      reviewer: 'Demo Reviewer',
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
