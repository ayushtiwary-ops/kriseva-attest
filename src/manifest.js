const DISCLOSURES = [
  'RESEARCH-STAGE PROTOTYPE',
  'SYNTHETIC DEMO DATA',
  'NOT A REGULATORY FILING',
  'NOT CONNECTED TO IFSCA SYSTEMS',
  'NAMED HUMAN DECISION REQUIRED'
];

const PERMITTED_SOURCE_MARKERS = new Set(['SYNTHETIC DEMO DATA', 'PUBLIC SOURCE']);

function assertExportBoundary(state) {
  if (state.case?.synthetic !== true) {
    throw new Error('Manifest export requires an explicitly synthetic case.');
  }

  if ((state.sources ?? []).some((source) => !PERMITTED_SOURCE_MARKERS.has(source.dataMarker))) {
    throw new Error('Manifest export requires every source to be explicitly marked synthetic or public.');
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderCandidates(candidates) {
  if (candidates.length === 0) {
    return '<p>No candidate evidence supplied.</p>';
  }

  return `<ul>${candidates.map((candidate) => `
    <li>
      <strong>${escapeHtml(candidate.value)}</strong>
      <span>Source: ${escapeHtml(candidate.sourceId)}. Reference: ${escapeHtml(candidate.reference)}.</span>
    </li>`).join('')}</ul>`;
}

export function buildManifest(state, { generatedAt } = {}) {
  assertExportBoundary(state);

  const manifest = {
    product: 'KRISEVA ATTEST',
    case: structuredClone(state.case),
    metadata: {
      researchStage: true,
      synthetic: state.case.synthetic,
      notARegulatoryFiling: true,
      humanDecisionRequired: true
    },
    sources: structuredClone(state.sources ?? []),
    sourceFingerprints: (state.sources ?? []).map(({ id, fingerprint }) => ({ id, fingerprint })),
    fields: structuredClone(state.fields ?? []),
    humanDecisions: structuredClone(state.decisions ?? []),
    unresolvedItems: state.fields
      .filter((field) => field.status !== 'SUPPORTED')
      .map((field) => structuredClone(field)),
    disclosures: [...DISCLOSURES]
  };

  return generatedAt === undefined ? manifest : { ...manifest, generatedAt };
}

export function manifestToHtml(manifest) {
  assertExportBoundary(manifest);

  const caseDetails = manifest.case ?? {};
  const sources = manifest.sources ?? [];
  const fields = manifest.fields ?? [];
  const decisions = manifest.humanDecisions ?? [];
  const unresolvedItems = manifest.unresolvedItems ?? [];

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(manifest.product)} evidence manifest</title>
  <style>
    body { color: #111; font: 16px/1.45 system-ui, sans-serif; margin: 32px auto; max-width: 900px; }
    h1, h2 { line-height: 1.15; }
    section { border-top: 1px solid #999; margin-top: 24px; padding-top: 16px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #999; padding: 8px; text-align: left; vertical-align: top; }
    .status, .disclosures { font-weight: 700; }
    @media print { body { margin: 0; max-width: none; } section { break-inside: avoid; } }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(manifest.product)} evidence manifest</h1>
    <p>Case: ${escapeHtml(caseDetails.id)}. ${escapeHtml(caseDetails.dataMarker)}</p>
    ${manifest.generatedAt === undefined ? '' : `<p>Generated at: ${escapeHtml(manifest.generatedAt)}</p>`}
  </header>
  <section>
    <h2>Disclosures</h2>
    <ul class="disclosures">${(manifest.disclosures ?? []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
  </section>
  <section>
    <h2>Source fingerprints</h2>
    <table><thead><tr><th>Source</th><th>Reference</th><th>Fingerprint</th></tr></thead><tbody>
      ${sources.map((source) => `<tr><td>${escapeHtml(source.label)}</td><td>${escapeHtml(source.reference)}</td><td>${escapeHtml(source.fingerprint)}</td></tr>`).join('')}
    </tbody></table>
  </section>
  <section>
    <h2>Field evidence candidates</h2>
    ${fields.map((field) => `<article>
      <h3>${escapeHtml(field.label)}</h3>
      <p class="status">${escapeHtml(field.status)}</p>
      <p>Agent path: ${escapeHtml(field.agentPath)}</p>
      ${renderCandidates(field.candidates ?? [])}
    </article>`).join('')}
  </section>
  <section>
    <h2>Human decisions</h2>
    ${decisions.length === 0 ? '<p>No human decisions recorded.</p>' : `<table><thead><tr><th>Field</th><th>Action</th><th>Reviewer</th><th>Reason</th><th>Recorded at</th></tr></thead><tbody>
      ${decisions.map((decision) => `<tr><td>${escapeHtml(decision.fieldId)}</td><td>${escapeHtml(decision.action)}</td><td>${escapeHtml(decision.reviewer)}</td><td>${escapeHtml(decision.reason)}</td><td>${escapeHtml(decision.recordedAt)}</td></tr>`).join('')}
    </tbody></table>`}
  </section>
  <section>
    <h2>Unresolved items</h2>
    ${unresolvedItems.length === 0 ? '<p>No unresolved items.</p>' : `<ul>${unresolvedItems.map((field) => `<li>${escapeHtml(field.label)}: ${escapeHtml(field.status)}</li>`).join('')}</ul>`}
  </section>
</body>
</html>`;
}
