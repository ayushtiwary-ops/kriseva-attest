import {
  computeAnomalyFlags,
  computeRiskIndicators,
  hasDisposition,
  latestDisposition
} from './risk-engine.js';

const SCREEN_NAMES = {
  dashboard: 'Case dashboard',
  'source-workspace': 'Source-to-field workspace',
  'conflict-queue': 'Conflict queue',
  'agent-trace': 'Agent trace',
  'risk-board': 'Risk and anomaly board',
  'review-signoff': 'Review and sign-off',
  'evidence-receipt': 'Evidence receipt'
};

// Guided step strip: one label per screen, in the same fixed order as
// SCREEN_NAMES / ROUTES (app.js). Rendered as a slim persistent line under
// the top navigation so a first-time reviewer always knows where they are.
const STEP_LABELS = {
  dashboard: 'Open the case',
  'source-workspace': 'Inspect the evidence',
  'conflict-queue': 'Decide the conflict',
  'agent-trace': 'Read the trace',
  'risk-board': 'Disposition the flags',
  'review-signoff': 'Confirm sign-off',
  'evidence-receipt': 'Export the receipt'
};

export const PROTOTYPE_BOUNDARY = 'RESEARCH-STAGE PROTOTYPE · SYNTHETIC DEMO DATA · NOT A REGULATORY FILING · NO REGULATOR CONNECTION';

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sourceFor(state, sourceId) {
  return state.sources.find((source) => source.id === sourceId);
}

function candidateCard(state, candidate, letter) {
  const source = sourceFor(state, candidate.sourceId);
  return `<article class="candidate-card" aria-label="Candidate ${letter}">
    <div class="candidate-topline">
      <span>Candidate ${letter}</span>
      <span>${escapeHtml(source.dataMarker)}</span>
    </div>
    <p class="candidate-value">${escapeHtml(candidate.value)}</p>
    <h3>${escapeHtml(source.label)}</h3>
    <p>${escapeHtml(candidate.reference)}</p>
    <div class="source-preview" aria-label="${escapeHtml(source.label)} synthetic source preview">
      <strong>SYNTHETIC DEMO DATA</strong>
      <span>${letter === 'A' ? 'Capital summary / reported field' : 'Schedule extract / recorded value'}</span>
      <mark>${escapeHtml(candidate.value)}</mark>
    </div>
    <dl class="coordinate-list">
      <div><dt>Exact reference</dt><dd>${escapeHtml(candidate.reference)}</dd></div>
      <div><dt>Input fingerprint</dt><dd class="fingerprint">${escapeHtml(source.fingerprint)}</dd></div>
    </dl>
  </article>`;
}

function screenHeading(route, kicker, summary) {
  return `<header class="screen-heading">
    <p class="kicker">${escapeHtml(kicker)}</p>
    <h1 id="active-screen-title" tabindex="-1">${escapeHtml(SCREEN_NAMES[route])}</h1>
    <p class="screen-summary">${escapeHtml(summary)}</p>
  </header>`;
}

export function renderEvidenceIndex(state, reviewed) {
  const counts = state.fields.reduce((totals, field) => {
    totals[field.status] = (totals[field.status] ?? 0) + 1;
    return totals;
  }, {});
  const fieldRows = state.fields.map((field, index) => {
    const href = field.status === 'CONFLICTING'
      ? '#conflict-queue'
      : field.status === 'UNSUPPORTED'
        ? '#agent-trace'
        : '#source-workspace';
    const content = `<span class="field-number">0${index + 1}</span>
      <span><strong>${escapeHtml(field.label)}</strong><small class="status status-${field.status.toLowerCase()}">${escapeHtml(field.status)}</small></span>`;
    return reviewed
      ? `<li><a href="${href}">${content}</a></li>`
      : `<li><div class="field-static">${content}</div></li>`;
  }).join('');

  return `<aside class="evidence-index" aria-label="Evidence index">
    <div class="case-register">
      <p class="kicker">Case 001 · ${escapeHtml(state.case.reportingPeriod)}</p>
      <h2>${escapeHtml(state.case.name)}</h2>
      <p class="case-id">${escapeHtml(state.case.fme)}</p>
      <p class="case-id">${escapeHtml(state.case.id)}</p>
    </div>
    <section class="state-summary" aria-labelledby="state-summary-title">
      <h3 id="state-summary-title">Evidence state</h3>
      <div class="state-counts">
        ${reviewed
          ? `<a href="#conflict-queue"><strong>${counts.CONFLICTING ?? 0}</strong><span>${counts.CONFLICTING === 1 ? 'conflict' : 'conflicts'}</span></a>
             <span><strong>${counts.SUPPORTED ?? 0}</strong><span>supported</span></span>
             <span><strong>${counts.UNSUPPORTED ?? 0}</strong><span>unsupported</span></span>`
          : `<span class="pending-count"><strong>${counts.PENDING ?? 0}</strong><span>pending</span></span>`}
      </div>
    </section>
    <nav class="field-index" aria-label="Field evidence index">
      <h3>Governed fields</h3>
      <ol>${fieldRows}</ol>
    </nav>
    <section class="input-register" aria-labelledby="input-register-title">
      <h3 id="input-register-title">Input record</h3>
      <p>${state.sources.length} local synthetic sources. No upload. No remote storage.</p>
    </section>
  </aside>`;
}

function dashboardMain(state, reviewed) {
  const statusCopy = reviewed
    ? 'The deterministic comparison has separated agreement, disagreement, and absent evidence for human review.'
    : 'The fixed case is loaded. No evidence classification has run and all three fields remain pending.';
  return `${screenHeading('dashboard', '01 / 07 · intake', 'One bounded case. Three governed fields. A visible human decision boundary.')}
    <section class="hero-statement" aria-labelledby="case-state-title">
      <p class="section-label">Current case state</p>
      <h2 id="case-state-title">${reviewed ? 'Evidence ready for human review' : 'Evidence review has not run'}</h2>
      <p>${statusCopy}</p>
      ${reviewed
        ? '<a class="primary-action" href="#source-workspace">Open source-to-field workspace</a>'
        : '<button class="primary-action" id="run-review" type="button">Run evidence review</button>'}
    </section>
    <section class="dashboard-ledger" aria-label="Case inventory">
      <article><span>01</span><p>Case</p><strong>${escapeHtml(state.case.reportingPeriod)}</strong></article>
      <article><span>03</span><p>Inputs</p><strong>Synthetic only</strong></article>
      <article><span>03</span><p>Fields</p><strong>${reviewed ? 'Classified' : 'Pending'}</strong></article>
    </section>
    <section class="principle-note">
      <p class="section-label">Operating principle</p>
      <blockquote>ATTEST can surface evidence. Only a named human can decide what the record should say.</blockquote>
    </section>`;
}

function workspaceMain(state) {
  const field = state.fields.find(({ id }) => id === 'committed-capital');
  return `${screenHeading('source-workspace', '02 / 07 · inspect', 'Compare proposed values with exact coordinates before any human action.')}
    <section class="selected-field" aria-labelledby="selected-field-title">
      <div><p class="section-label">Selected field</p><h2 id="selected-field-title">${escapeHtml(field.label)}</h2></div>
      <span class="status status-conflicting">${escapeHtml(field.status)}</span>
      <p>${escapeHtml(field.agentPath)} · unequal normalized values are preserved as a conflict.</p>
    </section>
    <div class="candidate-comparison">
      ${candidateCard(state, field.candidates[0], 'A')}
      ${candidateCard(state, field.candidates[1], 'B')}
    </div>
    <section class="interpretation-boundary">
      <p class="section-label">Agent explanation</p>
      <h2>Two values remain in the record.</h2>
      <p>The comparison cannot choose which source should govern. A named reviewer must inspect context and state a reason.</p>
      <a class="text-action" href="#conflict-queue">Send disagreement to conflict queue →</a>
    </section>`;
}

function conflictMain(state) {
  const field = state.fields.find(({ id }) => id === 'committed-capital');
  return `${screenHeading('conflict-queue', '03 / 07 · decide', 'No default winner. The decision is explicit, attributed, and reasoned.')}
    <section class="conflict-alert" aria-labelledby="conflict-title">
      <p class="section-label">Conflict 01 / 01</p>
      <h2 id="conflict-title">Two sources disagree</h2>
      <p>${escapeHtml(field.label)} has two unequal normalized values. Both remain visible before and after a decision.</p>
    </section>
    <div class="candidate-comparison">
      ${candidateCard(state, field.candidates[0], 'A')}
      ${candidateCard(state, field.candidates[1], 'B')}
    </div>`;
}

function traceMain(state, { envelope, replay } = {}) {
  const unsupported = state.fields.find(({ status }) => status === 'UNSUPPORTED');
  const flags = computeAnomalyFlags(state);
  return `${screenHeading('agent-trace', '04 / 07 · trace', 'A disclosed deterministic record of what the prototype compared and where it stopped.')}
    <p class="trace-disclosure">RECORDED DETERMINISTIC PROTOTYPE TRACE · NO LIVE MODEL CALL</p>
    <ol class="trace-list">
      <li><span>01</span><div><p class="section-label">Intake</p><h2>Load three governed fields</h2><p>Fixed synthetic case and three local source fingerprints.</p></div></li>
      <li><span>02</span><div><p class="section-label">Compare</p><h2>Normalize candidate values</h2><p>Equality supports agreement. Unequal values preserve a conflict.</p></div></li>
      <li><span>03</span><div><p class="section-label">Propose</p><h2>Surface evidence state</h2><p>One supported field and one conflict. No compliance conclusion.</p></div></li>
      <li class="trace-abstain"><span>04</span><div><p class="section-label">ABSTAIN</p><h2>${escapeHtml(unsupported.label)}</h2><p>No candidate evidence is present. The prototype requests evidence instead of inventing a value.</p></div></li>
      <li><span>05</span><div><p class="section-label">SCAN</p><h2>Scan sources and fields for deterministic integrity checks</h2><p>Document fingerprints, document dates, and decision direction are checked against fixed rules. No inference beyond the rule.</p></div></li>
      <li><span>06</span><div><p class="section-label">FLAG</p><h2>${flags.length} anomaly ${flags.length === 1 ? 'flag' : 'flags'} raised with exact references</h2><p>Each flag carries a severity, a lens, and its exact source or field reference. None is presented as a fraud finding.</p></div></li>
      <li><span>07</span><div><p class="section-label">AWAIT</p><h2>Await named-human disposition</h2><p>Every active flag stays open until a named reviewer escalates or acknowledges it with a reason on the risk and anomaly board.</p></div></li>
    </ol>
    ${recordedRunSection(envelope, replay)}`;
}

function recordedRunCandidateItem(candidate) {
  return `<li>
    <p class="recorded-run-value"><strong>${escapeHtml(candidate.value)}</strong></p>
    <p>Document: ${escapeHtml(candidate.documentId)}. Location: ${escapeHtml(candidate.location)}.</p>
    <p class="recorded-run-quote">“${escapeHtml(candidate.quote)}”</p>
  </li>`;
}

function recordedRunAbstentionItem(abstention) {
  return `<li>
    <p><span class="status status-unsupported">MODEL ABSTAINED</span> Document: ${escapeHtml(abstention.documentId)}.</p>
    <p>${escapeHtml(abstention.reason)}</p>
  </li>`;
}

function recordedRunField(field) {
  return `<article class="recorded-run-field" aria-labelledby="recorded-run-${escapeHtml(field.id)}-title">
    <h3 id="recorded-run-${escapeHtml(field.id)}-title">${escapeHtml(field.label)}</h3>
    <p class="recorded-run-field-summary">${field.candidates.length} candidate${field.candidates.length === 1 ? '' : 's'} · ${field.abstentions.length} abstention${field.abstentions.length === 1 ? '' : 's'}</p>
    ${field.candidates.length > 0 ? `<ul class="recorded-run-candidates">${field.candidates.map(recordedRunCandidateItem).join('')}</ul>` : ''}
    ${field.abstentions.length > 0 ? `<ul class="recorded-run-abstentions">${field.abstentions.map(recordedRunAbstentionItem).join('')}</ul>` : ''}
  </article>`;
}

function recordedRunValidatorRow(validator) {
  return `<li>
    <span class="status recorded-run-outcome-${escapeHtml(validator.outcome.toLowerCase())}">${escapeHtml(validator.outcome)}</span>
    <strong>${escapeHtml(validator.label)}</strong>
    <span>${escapeHtml(validator.explanation)}</span>
  </li>`;
}

// Renders the recorded live model run captured by scripts/live-extract.mjs
// (data/live-run-envelope.json) on the agent-trace screen: this is a real,
// timestamped model call, distinct from the deterministic prototype trace
// above it. `replay` is the result of re-deriving the envelope digest in the
// browser (scripts/execution-envelope.mjs#replayEnvelope) without calling the
// model again, proving the on-disk record has not been altered.
function recordedRunSection(envelope, replay) {
  if (!envelope) {
    return `<section class="recorded-run" aria-labelledby="recorded-run-title">
      <p class="section-label">Recorded live run</p>
      <h2 id="recorded-run-title">Recorded live run unavailable</h2>
      <p>The recorded live-run envelope could not be loaded in this session.</p>
    </section>`;
  }

  const digest = envelope.integrity?.digest ?? '';
  const promptSha = envelope.instruction?.templateSha256 ?? '';
  const replayStatus = replay?.valid
    ? 'Replay verified: the recomputed digest matches the committed record.'
    : 'Replay could not verify the committed digest in this session.';

  return `<section class="recorded-run" aria-labelledby="recorded-run-title">
    <p class="section-label">Recorded live run</p>
    <h2 id="recorded-run-title">A real model call, inside the same boundary</h2>
    <p class="recorded-run-boundary">${escapeHtml(envelope.disclosure ?? 'Recorded execution of a live model run. Replay is deterministic; the model proposed, humans decided.')}</p>
    <dl class="recorded-run-meta">
      <div><dt>Model</dt><dd>${escapeHtml(envelope.model?.reportedId)} <small>(${escapeHtml(envelope.model?.canonicalModel ?? 'unknown')})</small></dd></div>
      <div><dt>Run recorded</dt><dd><time datetime="${escapeHtml(envelope.runTimestamp)}">${escapeHtml(envelope.runTimestamp)}</time></dd></div>
      <div><dt>Instruction fingerprint</dt><dd class="fingerprint">${escapeHtml(promptSha.slice(0, 16))}</dd></div>
      <div><dt>Envelope digest</dt><dd class="fingerprint" id="envelope-digest">${escapeHtml(digest.slice(0, 16))}</dd></div>
      <div><dt>Replay verification</dt><dd id="replay-status">${escapeHtml(replayStatus)}</dd></div>
    </dl>
    <div class="recorded-run-fields">${(envelope.fields ?? []).map(recordedRunField).join('')}</div>
    <section class="recorded-run-validators" aria-labelledby="recorded-run-validators-title">
      <h3 id="recorded-run-validators-title">Deterministic validator outcomes</h3>
      <ul>${(envelope.validators ?? []).map(recordedRunValidatorRow).join('')}</ul>
    </section>
  </section>`;
}

function indicatorCard(indicator) {
  return `<article class="indicator-card">
    <p class="indicator-label section-label">${escapeHtml(indicator.label)}</p>
    <p class="indicator-value">${escapeHtml(indicator.value)}</p>
    <p class="indicator-explanation">${escapeHtml(indicator.explanation)}</p>
    <p class="indicator-reference fingerprint">${escapeHtml(indicator.reference)}</p>
  </article>`;
}

function dispositionRecord(disposition) {
  return `<dl class="decision-audit disposition-record">
    <div><dt>Disposition</dt><dd>${escapeHtml(disposition.action)}</dd></div>
    <div><dt>Disposer</dt><dd>${escapeHtml(disposition.disposerName)}</dd></div>
    <div><dt>Reason</dt><dd>${escapeHtml(disposition.reason)}</dd></div>
    <div><dt>Recorded at</dt><dd><time datetime="${escapeHtml(disposition.recordedAt)}">${escapeHtml(disposition.recordedAt)}</time><small>Fixed synthetic demo timestamp</small></dd></div>
  </dl>`;
}

function dispositionForm(flag) {
  const safeId = escapeHtml(flag.id);
  return `<form class="disposition-form" data-flag-id="${safeId}" novalidate>
    <fieldset>
      <legend>Disposition action</legend>
      <label><input type="radio" name="action" value="ESCALATE"> <span>Escalate for investigation</span></label>
      <label><input type="radio" name="action" value="ACKNOWLEDGE"> <span>Acknowledge with reason</span></label>
    </fieldset>
    <label for="disposer-name-${safeId}">Disposer name</label>
    <input id="disposer-name-${safeId}" name="disposerName" autocomplete="off">
    <label for="disposition-reason-${safeId}">Disposition reason</label>
    <textarea id="disposition-reason-${safeId}" name="reason" rows="3"></textarea>
    <p class="form-error" id="disposition-error-${safeId}" role="alert"></p>
    <button class="primary-action" type="submit">Record disposition</button>
  </form>`;
}

function flagCard(state, flag) {
  const disposition = latestDisposition(state, flag.id);
  return `<article class="flag-card" aria-labelledby="flag-${escapeHtml(flag.id)}-title">
    <div class="flag-topline">
      <span class="status flag-severity flag-severity-${flag.severity.toLowerCase()}">${escapeHtml(flag.severity)}</span>
      <span class="kicker flag-lens">${escapeHtml(flag.lens)}</span>
    </div>
    <h3 id="flag-${escapeHtml(flag.id)}-title">${escapeHtml(flag.title)}</h3>
    <p>${escapeHtml(flag.explanation)}</p>
    <p class="flag-reference fingerprint">${escapeHtml(flag.reference)}</p>
    ${disposition ? dispositionRecord(disposition) : dispositionForm(flag)}
  </article>`;
}

function riskBoardMain(state) {
  const indicators = computeRiskIndicators(state);
  const flags = computeAnomalyFlags(state);
  const openCount = flags.filter((flag) => !hasDisposition(state, flag.id)).length;
  return `${screenHeading('risk-board', '05 / 07 · integrate', 'Deterministic risk indicators and anomaly flags, computed live from the same evidence record and closed only by a named human disposition.')}
    <section class="risk-indicators" aria-labelledby="risk-indicators-title">
      <p class="section-label">Compliance, risk, and fraud-analysis lenses</p>
      <h2 id="risk-indicators-title">Risk indicators</h2>
      <div class="indicator-grid">${indicators.map(indicatorCard).join('')}</div>
    </section>
    <section class="anomaly-flags" aria-labelledby="anomaly-flags-title">
      <p class="section-label">${openCount} of ${flags.length} open</p>
      <h2 id="anomaly-flags-title">Anomaly flags</h2>
      <p>Flags, not accusations: each is a deterministic integrity check with an exact reference. A named human escalates for investigation or acknowledges with a reason; the prototype never resolves one on its own.</p>
      ${flags.map((flag) => flagCard(state, flag)).join('')}
    </section>`;
}

const GATE_COPY = {
  'conflict-decision': 'the committed capital conflict decision',
  'anomaly-dispositions': 'a disposition for every open anomaly flag'
};

function signoffMain(state, { conflictDecided, canSignOff, pendingGates }) {
  const latestDecision = state.decisions.at(-1);
  const conflictDecision = latestDecision
    ? `<dl class="decision-audit">
        <div><dt>Action</dt><dd>${escapeHtml(latestDecision.action)}</dd></div>
        <div><dt>Reviewer</dt><dd>${escapeHtml(latestDecision.reviewer)}</dd></div>
        <div><dt>Reason</dt><dd>${escapeHtml(latestDecision.reason)}</dd></div>
        <div><dt>Recorded at</dt><dd><time datetime="${escapeHtml(latestDecision.recordedAt)}">${escapeHtml(latestDecision.recordedAt)}</time><small>Fixed synthetic demo timestamp</small></dd></div>
      </dl>`
    : '<p>Named reviewer and reason missing.</p>';
  const officer = state.signOff;
  const flags = computeAnomalyFlags(state);
  const openFlags = flags.filter((flag) => !hasDisposition(state, flag.id));
  const formUsable = pendingGates.length === 0;
  const disabled = formUsable ? '' : ' disabled';
  const remainingGateCopy = pendingGates.map((gate) => GATE_COPY[gate]).join(' and ');
  return `${screenHeading('review-signoff', '06 / 07 · gate', 'Inspect the human decision ledger before producing a local evidence receipt.')}
    <section class="signoff-gate ${conflictDecided ? 'gate-cleared' : 'gate-blocked'}" aria-labelledby="gate-title">
      <p class="section-label">Human review boundary</p>
      <h2 id="gate-title">${conflictDecided ? 'Conflict gate cleared' : 'Evidence-review gate blocked'}</h2>
      <p>${conflictDecided
        ? 'A named reviewer recorded a reason for the conflict. The unsupported field remains unresolved and visible.'
        : 'Committed capital still needs an explicit action, a named reviewer, and a reason.'}</p>
    </section>
    <section class="risk-gate ${openFlags.length === 0 ? 'gate-cleared' : 'gate-blocked'}" aria-labelledby="risk-gate-title">
      <p class="section-label">Anomaly flag dispositions</p>
      <h2 id="risk-gate-title">${openFlags.length === 0 ? `All ${flags.length} anomaly flags dispositioned` : `${openFlags.length} of ${flags.length} anomaly flags still open`}</h2>
      <p>${openFlags.length === 0
        ? 'Every active anomaly flag on the risk and anomaly board carries a named disposition.'
        : 'Escalate or acknowledge every open flag on the risk and anomaly board before officer confirmation can proceed.'}</p>
      <a class="secondary-action" href="#risk-board">Open risk and anomaly board</a>
    </section>
    <section class="officer-confirmation ${canSignOff ? 'gate-cleared' : 'gate-blocked'}" aria-labelledby="officer-confirmation-title">
      <p class="section-label">Principal Officer confirmation</p>
      <h2 id="officer-confirmation-title">${canSignOff ? 'Officer confirmation recorded' : 'Officer confirmation required'}</h2>
      <p>${formUsable
        ? 'A second named role confirms the evidence record for all three fields. This officer must differ from the deciding reviewer.'
        : `Blocked until ${remainingGateCopy} ${pendingGates.length > 1 ? 'are' : 'is'} recorded.`}</p>
      <form id="signoff-form" novalidate>
        <label for="officer-name">Principal Officer (demo persona)</label>
        <input id="officer-name" name="officerName" autocomplete="off"${disabled} value="${escapeHtml(officer?.officerName ?? '')}">
        <label class="officer-checkbox">
          <input type="checkbox" id="officer-confirm" name="confirmed"${disabled}${officer?.confirmed ? ' checked' : ''}>
          <span>I confirm the evidence record for all three fields has been reviewed</span>
        </label>
        <p class="form-error" id="signoff-error" role="alert"></p>
        <button class="primary-action" type="submit"${disabled}>Confirm sign-off</button>
      </form>
    </section>
    <section class="decision-ledger" aria-labelledby="decision-ledger-title">
      <div class="section-heading"><p class="section-label">Decision ledger</p><h2 id="decision-ledger-title">Three field records</h2></div>
      <article><span class="status status-supported">SUPPORTED</span><h3>Closing NAV</h3><p>Two normalized values agree. No human conflict decision recorded.</p></article>
      <article><span class="status status-conflicting">CONFLICTING</span><h3>Committed capital</h3>${conflictDecision}</article>
      <article><span class="status status-unsupported">UNSUPPORTED</span><h3>Investor complaints closed</h3><p>Evidence request remains open. No value was synthesized.</p></article>
    </section>`;
}

function receiptMain(manifest) {
  const conflict = manifest.fields.find(({ id }) => id === 'committed-capital');
  const decision = manifest.humanDecisions.at(-1);
  const officer = manifest.principalOfficerConfirmation;
  const signedOff = Boolean(decision && officer?.confirmed);
  const unsupported = manifest.fields.find(({ id }) => id === 'investor-complaints-closed');
  const digest = manifest.integrity?.digest;
  const exportsDisabled = signedOff ? '' : ' disabled';
  const anomalyFindings = manifest.anomalyFindings ?? [];
  const dispositionedCount = anomalyFindings.filter((finding) => finding.disposition).length;
  const openCount = anomalyFindings.length - dispositionedCount;
  return `${screenHeading('evidence-receipt', '07 / 07 · retain', 'A local, printable record of inputs, candidates, a human decision, and unresolved evidence.')}
    <section class="receipt-header" aria-labelledby="receipt-title">
      <p class="section-label">Receipt / ${escapeHtml(manifest.case.id)}</p>
      <h2 id="receipt-title">${decision ? 'Human decision recorded' : 'No human decision recorded'}</h2>
      <p>Research-stage synthetic evidence record. This receipt is not approval, verification, or a regulatory filing.</p>
      <p class="risk-summary">Risk summary: ${anomalyFindings.length} anomaly ${anomalyFindings.length === 1 ? 'flag' : 'flags'} · ${openCount} open · ${dispositionedCount} dispositioned.</p>
    </section>
    <section class="receipt-section" aria-labelledby="fingerprints-title">
      <p class="section-label">Input record</p><h2 id="fingerprints-title">Source fingerprints</h2>
      <dl class="receipt-list">${manifest.sources.map((source) => `<div><dt>${escapeHtml(source.label)}</dt><dd>${escapeHtml(source.reference)}</dd><dd class="fingerprint">${escapeHtml(source.fingerprint)}</dd></div>`).join('')}</dl>
      ${digest ? `<p class="manifest-integrity">Manifest content fingerprint <span class="fingerprint" id="manifest-digest">${escapeHtml(digest.slice(0, 16))}</span></p>` : ''}
    </section>
    <section class="receipt-section" aria-labelledby="candidate-record-title">
      <p class="section-label">Preserved disagreement</p><h2 id="candidate-record-title">Committed capital candidates</h2>
      <div class="receipt-candidates">${conflict.candidates.map((candidate, index) => `<article><span>Candidate ${index === 0 ? 'A' : 'B'}</span><strong>${escapeHtml(candidate.value)}</strong><p>${escapeHtml(candidate.reference)}</p></article>`).join('')}</div>
      ${decision ? `<dl class="human-decision"><div><dt>Role</dt><dd>Deciding reviewer</dd></div><div><dt>Action</dt><dd>${escapeHtml(decision.action)}</dd></div>${decision.candidateId == null ? '' : `<div><dt>Selected source</dt><dd>${escapeHtml(decision.candidateId)}</dd></div>`}<div><dt>Reviewer</dt><dd>${escapeHtml(decision.reviewer)}</dd></div><div><dt>Reason</dt><dd>${escapeHtml(decision.reason)}</dd></div><div><dt>Recorded at</dt><dd><time datetime="${escapeHtml(decision.recordedAt)}">${escapeHtml(decision.recordedAt)}</time><small>Fixed synthetic demo timestamp</small></dd></div></dl>` : '<p>No decision is present.</p>'}
      ${officer?.confirmed
        ? `<dl class="human-decision officer-confirmation-record"><div><dt>Role</dt><dd>Confirming Principal Officer</dd></div><div><dt>Principal Officer</dt><dd>${escapeHtml(officer.officerName)}</dd></div><div><dt>Confirmed at</dt><dd><time datetime="${escapeHtml(officer.recordedAt)}">${escapeHtml(officer.recordedAt)}</time><small>Fixed synthetic demo timestamp</small></dd></div></dl>`
        : '<p class="officer-pending">Principal Officer confirmation pending. Complete the Review and sign-off screen to confirm this record.</p>'}
    </section>
    <section class="receipt-section unresolved-record" aria-labelledby="unresolved-title">
      <p class="section-label">Evidence request remains open</p><h2 id="unresolved-title">${escapeHtml(unsupported.label)}</h2>
      <p><strong>${escapeHtml(unsupported.status)}</strong> · No candidate source. No value synthesized.</p>
    </section>
    <section class="receipt-section receipt-export" aria-labelledby="receipt-export-title">
      <p class="section-label">Local export</p><h2 id="receipt-export-title">Retain the bounded evidence record</h2>
      <p>${signedOff
        ? 'Downloads remain local and preserve both conflicting candidates and the unresolved evidence request.'
        : 'Downloads are blocked until the deciding reviewer and the confirming Principal Officer are both recorded.'}</p>
      <div class="receipt-export-actions">
        <button class="primary-action" id="download-manifest-json" type="button"${exportsDisabled}>Download JSON evidence manifest</button>
        <button class="secondary-action" id="download-manifest-html" type="button"${exportsDisabled}>Download printable HTML evidence manifest</button>
      </div>
    </section>`;
}

export function renderMain(route, state, { reviewed, conflictDecided, canSignOff, pendingGates, manifest, envelope, replay }) {
  if (route === 'source-workspace') return workspaceMain(state);
  if (route === 'conflict-queue') return conflictMain(state);
  if (route === 'agent-trace') return traceMain(state, { envelope, replay });
  if (route === 'risk-board') return riskBoardMain(state);
  if (route === 'review-signoff') return signoffMain(state, { conflictDecided, canSignOff, pendingGates });
  if (route === 'evidence-receipt') return receiptMain(manifest);
  return dashboardMain(state, reviewed);
}

function conflictForm(state) {
  const field = state.fields.find(({ id }) => id === 'committed-capital');
  return `<section class="review-panel" aria-labelledby="decision-title">
    <p class="section-label">Named human decision</p>
    <h2 id="decision-title">Record the conflict decision</h2>
    <form id="decision-form" novalidate>
      <fieldset>
        <legend>Decision action</legend>
        <label><input type="radio" name="action" value="ACCEPT"> <span>Accept selected source</span></label>
        <label><input type="radio" name="action" value="CORRECT"> <span>Correct with selected source</span></label>
        <label><input type="radio" name="action" value="REJECT"> <span>Reject proposed field</span></label>
        <label><input type="radio" name="action" value="DEFER"> <span>Defer pending evidence</span></label>
      </fieldset>
      <p class="field-guidance">ACCEPT keeps the proposed value as evidenced by the selected source. CORRECT replaces it with the selected source's value.</p>
      <label for="candidate-select">Select source</label>
      <select id="candidate-select" name="candidateId" aria-describedby="candidate-guidance">
        <option value="">No source selected</option>
        ${field.candidates.map((candidate, index) => `<option value="${escapeHtml(candidate.id)}">Candidate ${index === 0 ? 'A' : 'B'} · ${escapeHtml(candidate.value)}</option>`).join('')}
      </select>
      <p class="field-guidance" id="candidate-guidance">Required for accept or correct. Not attributed for reject or defer.</p>
      <label for="reviewer">Reviewer, Compliance Officer (demo persona)</label>
      <input id="reviewer" name="reviewer" autocomplete="off">
      <label for="decision-reason">Decision reason</label>
      <textarea id="decision-reason" name="reason" rows="5"></textarea>
      <p class="form-error" id="decision-error" role="alert"></p>
      <button class="primary-action" type="submit">Record human decision</button>
    </form>
  </section>`;
}

export function renderReviewDrawer(route, state, { reviewed, conflictDecided, canSignOff }) {
  if (route === 'conflict-queue') return conflictForm(state);
  if (route === 'dashboard') {
    return `<section class="review-panel boundary-panel" aria-labelledby="boundary-title">
      <p class="section-label">Permanent boundary</p><h2 id="boundary-title">Human remains accountable</h2>
      <p>The prototype proposes evidence links and abstains when evidence is absent. It does not interpret regulation.</p>
      ${reviewed ? '<a class="secondary-action" href="#conflict-queue">Review 1 conflict</a>' : '<p class="review-state">3 fields pending evidence review</p>'}
    </section>`;
  }
  if (route === 'source-workspace') {
    return `<section class="review-panel" aria-labelledby="review-context-title"><p class="section-label">Review context</p><h2 id="review-context-title">Disagreement needs judgment</h2><p>Inspect exact references and both fingerprints. The comparison provides no preferred source.</p><a class="secondary-action" href="#conflict-queue">Open conflict decision</a></section>`;
  }
  if (route === 'agent-trace') {
    return `<section class="review-panel" aria-labelledby="trace-scope-title"><p class="section-label">Trace scope</p><h2 id="trace-scope-title">Bounded and replayable</h2><p>The shown path is deterministic prototype behavior, not a live model run.</p><a class="secondary-action" href="#risk-board">Open risk and anomaly board</a></section>`;
  }
  if (route === 'risk-board') {
    const flags = computeAnomalyFlags(state);
    const openCount = flags.filter((flag) => !hasDisposition(state, flag.id)).length;
    return `<section class="review-panel" aria-labelledby="risk-scope-title">
      <p class="section-label">Flag disposition</p>
      <h2 id="risk-scope-title">${openCount === 0 ? 'All flags dispositioned' : `${openCount} of ${flags.length} flags need disposition`}</h2>
      <p>${openCount === 0
        ? 'Every active anomaly flag carries a named disposition. Continue to review and sign-off.'
        : 'Escalate or acknowledge each flag with a disposer name and reason before officer confirmation can proceed.'}</p>
      <a class="secondary-action" href="${openCount === 0 ? '#review-signoff' : '#risk-board'}">${openCount === 0 ? 'Open review and sign-off' : 'Disposition remaining flags'}</a>
    </section>`;
  }
  if (route === 'review-signoff') {
    return `<section class="review-panel" aria-labelledby="signoff-action-title"><p class="section-label">Gate action</p><h2 id="signoff-action-title">${conflictDecided ? 'Conflict decision retained' : 'Conflict decision required'}</h2><p>${conflictDecided ? (canSignOff ? 'The local receipt now shows both the named decision and the Principal Officer confirmation.' : 'The local receipt can show the named decision, but exports stay blocked until every anomaly flag is dispositioned and a Principal Officer confirms.') : 'Return to the conflict queue. Select an action and provide reviewer context.'}</p><a class="secondary-action" href="${conflictDecided ? '#evidence-receipt' : '#conflict-queue'}">${conflictDecided ? 'Open evidence receipt' : 'Resolve conflict'}</a></section>`;
  }
  return `<section class="review-panel" aria-labelledby="receipt-scope-title"><p class="section-label">Receipt scope</p><h2 id="receipt-scope-title">Local evidence record</h2><p>Both candidates, all input fingerprints, the human reason, and the unsupported field remain visible.</p><button class="secondary-action" id="reset-demo" type="button">Reset demo</button></section>`;
}

export function renderTopNavigation(route) {
  return Object.entries(SCREEN_NAMES).map(([slug, name], index) => `<a href="#${slug}" ${slug === route ? 'aria-current="page"' : ''}><span>0${index + 1}</span>${escapeHtml(name)}</a>`).join('');
}

// Plain text (not markup): app.js sets this directly via textContent onto
// the persistent #step-strip element it creates alongside the top nav.
export function renderStepStrip(route) {
  const routes = Object.keys(SCREEN_NAMES);
  const stepIndex = routes.includes(route) ? routes.indexOf(route) : 0;
  const label = STEP_LABELS[route] ?? STEP_LABELS.dashboard;
  return `Step ${stepIndex + 1} of ${routes.length}: ${label}`;
}
