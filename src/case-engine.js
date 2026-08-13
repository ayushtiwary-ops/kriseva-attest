import { allFlagsDispositioned, computeAnomalyFlags, validateDisposition } from './risk-engine.js';

const MATERIAL_ACTIONS = new Set(['ACCEPT', 'CORRECT', 'REJECT', 'DEFER']);

function normalizeValue(candidate) {
  const value = candidate.normalizedValue ?? candidate.value;
  return String(value ?? '').trim().replaceAll(/\s+/g, ' ').toLowerCase();
}

function reviewField(field) {
  const candidates = field.candidates ?? [];
  const normalizedValues = new Set(candidates.map(normalizeValue));
  const status = candidates.length === 0
    ? 'UNSUPPORTED'
    : normalizedValues.size === 1
      ? 'SUPPORTED'
      : 'CONFLICTING';

  return {
    ...field,
    candidates,
    status,
    selectedCandidateId: null
  };
}

function hasRequiredDecisionDetails(decision) {
  return Boolean(decision.reviewer?.trim() && decision.reason?.trim());
}

export function loadCase(caseData) {
  const state = structuredClone(caseData);
  return {
    ...state,
    fields: state.fields.map((field) => ({
      ...field,
      candidates: field.candidates ?? [],
      status: 'PENDING',
      selectedCandidateId: null
    })),
    decisions: [],
    riskDispositions: [],
    signOff: null
  };
}

export function runEvidenceReview(state) {
  const nextState = structuredClone(state);
  return {
    ...nextState,
    fields: nextState.fields.map(reviewField)
  };
}

export function recordDecision(state, fieldId, decision) {
  if (!MATERIAL_ACTIONS.has(decision?.action)) {
    throw new Error('A material decision action is required.');
  }
  if (!hasRequiredDecisionDetails(decision)) {
    throw new Error('A reviewer and reason are required for a material decision.');
  }

  const field = state.fields.find((candidateField) => candidateField.id === fieldId);
  if (!field) {
    throw new Error(`Unknown field: ${fieldId}`);
  }
  if (field.status === 'PENDING') {
    throw new Error(`Field must be reviewed before recording a decision: ${fieldId}`);
  }

  const candidateRequired = ['ACCEPT', 'CORRECT'].includes(decision.action);
  const attributedCandidateId = candidateRequired ? decision.candidateId : null;
  const candidate = attributedCandidateId == null
    ? null
    : field.candidates.find((item) => item.id === attributedCandidateId);
  if (attributedCandidateId != null && !candidate) {
    throw new Error(`Unknown candidate for ${fieldId}: ${attributedCandidateId}`);
  }
  if (candidateRequired && !candidate) {
    throw new Error('A candidate is required to accept or correct a field.');
  }

  const nextState = structuredClone(state);
  const recordedDecision = {
    fieldId,
    action: decision.action,
    candidateId: attributedCandidateId ?? null,
    reviewer: decision.reviewer.trim(),
    reason: decision.reason.trim(),
    ...(decision.recordedAt == null ? {} : { recordedAt: decision.recordedAt })
  };

  return {
    ...nextState,
    fields: nextState.fields.map((candidateField) => candidateField.id === fieldId
      ? {
          ...candidateField,
          selectedCandidateId: candidateRequired
            ? recordedDecision.candidateId
            : null
        }
      : candidateField),
    decisions: [...nextState.decisions, recordedDecision]
  };
}

// Records a named human's disposition (escalate or acknowledge, with a
// reason) of a currently-active anomaly flag. Mirrors recordDecision: the
// flag must currently be firing, the disposition must be materially
// complete, and the disposition is appended (never mutated) so a later
// disposition for the same flag simply becomes the latest one on record.
export function recordRiskDisposition(state, flagId, disposition) {
  const activeFlags = computeAnomalyFlags(state);
  if (!activeFlags.some((flag) => flag.id === flagId)) {
    throw new Error(`Unknown or inactive anomaly flag: ${flagId}`);
  }

  const error = validateDisposition(disposition);
  if (error) {
    throw new Error(`A disposition action, disposer name, and reason are required: ${error.message}`);
  }

  const nextState = structuredClone(state);
  const recordedDisposition = {
    flagId,
    action: disposition.action,
    disposerName: disposition.disposerName.trim(),
    reason: disposition.reason.trim(),
    ...(disposition.recordedAt == null ? {} : { recordedAt: disposition.recordedAt })
  };

  return {
    ...nextState,
    riskDispositions: [...(nextState.riskDispositions ?? []), recordedDisposition]
  };
}

// The conflict-decision gate: true once evidence review has run and every
// CONFLICTING field carries a materially complete decision (reviewer + reason).
// This is the maker half of maker-checker and its semantics are unchanged from
// the prior single-actor design.
export function hasConflictDecision(state) {
  if (state.fields.some((field) => !['SUPPORTED', 'CONFLICTING', 'UNSUPPORTED'].includes(field.status))) {
    return false;
  }

  return state.fields
    .filter((field) => field.status === 'CONFLICTING')
    .every((field) => {
      const decisions = state.decisions.filter((decision) => decision.fieldId === field.id);
      const latestDecision = decisions.at(-1);
      return latestDecision
        && MATERIAL_ACTIONS.has(latestDecision.action)
        && hasRequiredDecisionDetails(latestDecision);
    });
}

function latestConflictReviewer(state) {
  const conflictField = state.fields.find((field) => field.status === 'CONFLICTING');
  if (!conflictField) return '';
  const decisions = state.decisions.filter((decision) => decision.fieldId === conflictField.id);
  return decisions.at(-1)?.reviewer ?? '';
}

// The checker half of maker-checker: a second named role (the Principal
// Officer) positively confirms the evidence record for all three fields.
// Blocked until the conflict decision exists and every currently-active
// anomaly flag carries a disposition, and rejected if the confirming officer
// is the same person as the deciding reviewer.
export function recordSignOff(state, signOff) {
  if (!hasConflictDecision(state)) {
    throw new Error('Sign-off requires the conflict decision to be recorded first.');
  }
  if (!allFlagsDispositioned(state)) {
    throw new Error('Sign-off requires every active anomaly flag to have a disposition first.');
  }

  const officerName = String(signOff?.officerName ?? '').trim();
  if (!officerName) {
    throw new Error('A Principal Officer name is required to confirm sign-off.');
  }
  if (!signOff?.confirmed) {
    throw new Error('The Principal Officer confirmation checkbox must be checked to confirm sign-off.');
  }

  const reviewerName = latestConflictReviewer(state).trim();
  if (officerName.toLowerCase() === reviewerName.toLowerCase()) {
    throw new Error('Maker-checker separation: the confirming officer must differ from the deciding reviewer.');
  }

  const nextState = structuredClone(state);
  return {
    ...nextState,
    signOff: {
      officerName,
      confirmed: true,
      ...(signOff.recordedAt == null ? {} : { recordedAt: signOff.recordedAt })
    }
  };
}

// Full sign-off gate: the conflict decision, every active anomaly flag
// dispositioned, AND a confirmed, distinct Principal Officer record. The
// receipt screen and both exports require this.
export function canSignOff(state) {
  return hasConflictDecision(state) && allFlagsDispositioned(state) && Boolean(state.signOff?.confirmed);
}

// Ordered list of gate ids still blocking the officer-confirmation form, for
// UI messaging ("which gates remain"). Empty once the form is usable.
export function pendingSignOffGates(state) {
  const gates = [];
  if (!hasConflictDecision(state)) gates.push('conflict-decision');
  if (!allFlagsDispositioned(state)) gates.push('anomaly-dispositions');
  return gates;
}

export function resetCase(caseData) {
  return loadCase(caseData);
}
