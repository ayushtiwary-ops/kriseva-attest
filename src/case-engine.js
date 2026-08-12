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
    decisions: []
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

export function canSignOff(state) {
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

export function resetCase(caseData) {
  return loadCase(caseData);
}
