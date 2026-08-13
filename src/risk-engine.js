// Pure, deterministic risk and anomaly computation. No ML, no live model call,
// no fraud-accusation language: this module produces flags and indicators
// only, never a verdict. A named human always disposes of a flag (escalate or
// acknowledge with a reason); this module never resolves one on its own.

const STALE_THRESHOLD_DAYS = 30;
const DISPOSITION_ACTIONS = new Set(['ESCALATE', 'ACKNOWLEDGE']);

function fieldById(state, fieldId) {
  return (state.fields ?? []).find((field) => field.id === fieldId) ?? null;
}

function sourceById(state, sourceId) {
  return (state.sources ?? []).find((source) => source.id === sourceId) ?? null;
}

function numericValue(candidate) {
  const raw = candidate?.normalizedValue ?? candidate?.value;
  if (raw == null) return null;
  const parsed = Number.parseFloat(String(raw).replaceAll(/[^0-9.-]/gu, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function daysBetween(earlierIsoDate, laterIsoDate) {
  const earlier = new Date(`${earlierIsoDate}T00:00:00Z`);
  const later = new Date(`${laterIsoDate}T00:00:00Z`);
  return Math.round((later.getTime() - earlier.getTime()) / (1000 * 60 * 60 * 24));
}

// --- Anomaly flags ---------------------------------------------------------

function noEvidenceCoverageFlag(state) {
  const field = fieldById(state, 'investor-complaints-closed');
  if (!field || (field.candidates ?? []).length > 0) return null;
  return {
    id: 'no-evidence-coverage',
    severity: 'HIGH',
    title: 'No evidence coverage',
    lens: 'COMPLIANCE',
    explanation: `${field.label} has zero candidate evidence; no source has been supplied for this field.`,
    reference: `Field · ${field.id} (${field.label}) · 0 of 0 candidates supplied`
  };
}

function duplicateFingerprintFlag(state) {
  const sources = state.sources ?? [];
  const byFingerprint = new Map();
  for (const source of sources) {
    if (!source.fingerprint) continue;
    const group = byFingerprint.get(source.fingerprint) ?? [];
    group.push(source);
    byFingerprint.set(source.fingerprint, group);
  }
  for (const [fingerprint, group] of byFingerprint) {
    if (group.length < 2) continue;
    const [first, second] = group;
    return {
      id: 'duplicate-fingerprint',
      severity: 'HIGH',
      title: 'Duplicate document fingerprint',
      lens: 'FRAUD ANALYSIS',
      explanation: 'Two distinct claimed sources carry an identical document fingerprint.',
      reference: `Sources · ${first.id} (${first.label}) & ${second.id} (${second.label}) · fingerprint ${fingerprint}`
    };
  }
  return null;
}

function conflictResolvedHigherFlag(state) {
  const field = fieldById(state, 'committed-capital');
  if (!field) return null;
  const latest = (state.decisions ?? []).filter((decision) => decision.fieldId === 'committed-capital').at(-1);
  if (!latest || !['ACCEPT', 'CORRECT'].includes(latest.action) || latest.candidateId == null) return null;

  const candidates = field.candidates ?? [];
  const accepted = candidates.find((candidate) => candidate.id === latest.candidateId);
  const others = candidates.filter((candidate) => candidate.id !== latest.candidateId);
  const acceptedValue = numericValue(accepted);
  if (!accepted || acceptedValue == null || others.length === 0) return null;

  const isHigher = others.every((candidate) => {
    const otherValue = numericValue(candidate);
    return otherValue == null || acceptedValue > otherValue;
  });
  if (!isHigher) return null;

  const otherLabel = others.map((candidate) => candidate.value).join(', ');
  return {
    id: 'conflict-resolved-higher',
    severity: 'MEDIUM',
    title: 'Conflict resolved toward higher value',
    lens: 'FRAUD ANALYSIS',
    explanation: 'The recorded decision accepted the higher of two conflicting values; the reason is retained for review.',
    reference: `Field · ${field.id} (${field.label}) · accepted ${accepted.value} over ${otherLabel} · decision reason on file`
  };
}

function staleSourceFlag(state) {
  const source = sourceById(state, 'board-schedule');
  const quarterEndDate = state.case?.quarterEndDate;
  if (!source?.documentDate || !quarterEndDate) return null;
  const staleDays = daysBetween(source.documentDate, quarterEndDate);
  if (staleDays <= STALE_THRESHOLD_DAYS) return null;
  return {
    id: 'stale-source',
    severity: 'LOW',
    title: 'Stale source',
    lens: 'RISK',
    explanation: `${source.label} is dated more than ${STALE_THRESHOLD_DAYS} days before the quarter end.`,
    reference: `Source · ${source.id} (${source.label}) · document date ${source.documentDate} · quarter end ${quarterEndDate} · ${staleDays} days stale`
  };
}

// Deterministic, fixed order: compliance coverage, fraud-analysis integrity
// checks, then the risk check. Order is stable regardless of state so the UI
// and manifest never reflow flags between renders.
export function computeAnomalyFlags(state) {
  return [
    noEvidenceCoverageFlag(state),
    duplicateFingerprintFlag(state),
    conflictResolvedHigherFlag(state),
    staleSourceFlag(state)
  ].filter(Boolean);
}

// --- Dispositions ------------------------------------------------------------

export function isDispositionAction(value) {
  return DISPOSITION_ACTIONS.has(value);
}

export function validateDisposition(disposition) {
  if (!isDispositionAction(disposition?.action)) {
    return { field: 'action', message: 'Choose a disposition action.' };
  }
  if (!disposition?.disposerName?.trim()) {
    return { field: 'disposerName', message: 'Enter the disposer name.' };
  }
  if (!disposition?.reason?.trim()) {
    return { field: 'reason', message: 'Enter a disposition reason.' };
  }
  return null;
}

export function latestDisposition(state, flagId) {
  const matches = (state.riskDispositions ?? []).filter((disposition) => disposition.flagId === flagId);
  return matches.at(-1) ?? null;
}

export function hasDisposition(state, flagId) {
  return latestDisposition(state, flagId) != null;
}

export function allFlagsDispositioned(state) {
  return computeAnomalyFlags(state).every((flag) => hasDisposition(state, flag.id));
}

export function buildAnomalyFindings(state) {
  return computeAnomalyFlags(state).map((flag) => ({
    id: flag.id,
    flag: flag.title,
    severity: flag.severity,
    lens: flag.lens,
    explanation: flag.explanation,
    reference: flag.reference,
    disposition: latestDisposition(state, flag.id)
  }));
}

// --- Risk indicators ---------------------------------------------------------

function describeOverrideDirection(field, decision) {
  if (!field || !decision) {
    return {
      value: 'Not yet decided',
      explanation: 'No conflict decision has been recorded for committed capital yet.',
      reference: 'Field · committed-capital (Committed capital) · decision pending'
    };
  }
  if (!['ACCEPT', 'CORRECT'].includes(decision.action) || decision.candidateId == null) {
    return {
      value: 'No value accepted',
      explanation: `The recorded decision (${decision.action}) did not attribute either candidate value.`,
      reference: `Field · committed-capital (Committed capital) · decision ${decision.action}`
    };
  }

  const candidates = field.candidates ?? [];
  const accepted = candidates.find((candidate) => candidate.id === decision.candidateId);
  const others = candidates.filter((candidate) => candidate.id !== decision.candidateId);
  const acceptedValue = accepted ? numericValue(accepted) : null;
  if (!accepted || acceptedValue == null || others.length === 0) {
    return {
      value: 'Not determined',
      explanation: 'The accepted candidate value could not be compared numerically.',
      reference: `Field · committed-capital (Committed capital) · candidate ${decision.candidateId}`
    };
  }

  const isHigher = others.every((candidate) => {
    const otherValue = numericValue(candidate);
    return otherValue == null || acceptedValue > otherValue;
  });
  return {
    value: isHigher ? 'Higher value accepted' : 'Lower value accepted',
    explanation: `The decision accepted ${accepted.value}, the ${isHigher ? 'higher' : 'lower'} of the two candidate values.`,
    reference: `Field · committed-capital (Committed capital) · accepted ${accepted.value}`
  };
}

export function computeRiskIndicators(state) {
  const fields = state.fields ?? [];
  const totalFields = fields.length;
  const withEvidence = fields.filter((field) => (field.candidates ?? []).length > 0).length;
  const conflicting = fields.filter((field) => field.status === 'CONFLICTING').length;
  const unsupported = fields.filter((field) => field.status === 'UNSUPPORTED').length;

  const committedCapital = fieldById(state, 'committed-capital');
  const latestCapitalDecision = (state.decisions ?? []).filter((decision) => decision.fieldId === 'committed-capital').at(-1) ?? null;
  const overrideDirection = describeOverrideDirection(committedCapital, latestCapitalDecision);

  const makerCheckerCleared = Boolean(state.signOff?.confirmed);
  const flags = computeAnomalyFlags(state);
  const openFlags = flags.filter((flag) => !hasDisposition(state, flag.id));

  return [
    {
      id: 'evidence-coverage',
      label: 'Evidence coverage',
      value: `${withEvidence}/${totalFields}`,
      explanation: `${withEvidence} of ${totalFields} governed fields carry at least one candidate source.`,
      reference: `Fields · ${fields.map((field) => field.id).join(', ')}`
    },
    {
      id: 'conflict-rate',
      label: 'Conflict rate',
      value: `${conflicting}/${totalFields}`,
      explanation: `${conflicting} of ${totalFields} governed fields carry two disagreeing candidate values.`,
      reference: committedCapital ? `Field · ${committedCapital.id} (${committedCapital.label})` : 'No conflicting field on record'
    },
    {
      id: 'abstention-count',
      label: 'Abstention count',
      value: `${unsupported}`,
      explanation: `${unsupported} field has no candidate evidence; no value was synthesized in its place.`,
      reference: 'Field · investor-complaints-closed (Investor complaints closed)'
    },
    {
      id: 'override-direction',
      label: 'Decision override direction',
      value: overrideDirection.value,
      explanation: overrideDirection.explanation,
      reference: overrideDirection.reference
    },
    {
      id: 'maker-checker-separation',
      label: 'Maker-checker separation status',
      value: makerCheckerCleared ? 'cleared' : 'pending',
      explanation: makerCheckerCleared
        ? 'A confirming Principal Officer distinct from the deciding reviewer has recorded confirmation.'
        : 'A confirming Principal Officer distinct from the deciding reviewer has not yet confirmed.',
      reference: state.signOff?.officerName
        ? `Sign-off · ${state.signOff.officerName}`
        : 'Sign-off · not recorded'
    },
    {
      id: 'open-anomaly-count',
      label: 'Open anomaly count',
      value: `${openFlags.length}`,
      explanation: `${openFlags.length} of ${flags.length} active anomaly flags do not yet carry a recorded disposition.`,
      reference: openFlags.length > 0
        ? `Flags · ${openFlags.map((flag) => flag.id).join(', ')}`
        : 'Flags · none open'
    }
  ];
}
