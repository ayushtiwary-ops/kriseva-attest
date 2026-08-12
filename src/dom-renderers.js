const SCREEN_NAMES = {
  dashboard: 'Case dashboard',
  'source-workspace': 'Source-to-field workspace',
  'conflict-queue': 'Conflict queue',
  'agent-trace': 'Agent trace',
  'review-signoff': 'Review and sign-off',
  'evidence-receipt': 'Evidence receipt'
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
      <h3>Whitelisted fields</h3>
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
  return `${screenHeading('dashboard', '01 / 06 · intake', 'One bounded case. Three whitelisted fields. A visible human decision boundary.')}
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
  return `${screenHeading('source-workspace', '02 / 06 · inspect', 'Compare proposed values with exact coordinates before any human action.')}
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
  return `${screenHeading('conflict-queue', '03 / 06 · decide', 'No default winner. The decision is explicit, attributed, and reasoned.')}
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

function traceMain(state) {
  const unsupported = state.fields.find(({ status }) => status === 'UNSUPPORTED');
  return `${screenHeading('agent-trace', '04 / 06 · trace', 'A disclosed deterministic record of what the prototype compared and where it stopped.')}
    <p class="trace-disclosure">RECORDED DETERMINISTIC PROTOTYPE TRACE · NO LIVE MODEL CALL</p>
    <ol class="trace-list">
      <li><span>01</span><div><p class="section-label">Intake</p><h2>Load three whitelisted fields</h2><p>Fixed synthetic case and three local source fingerprints.</p></div></li>
      <li><span>02</span><div><p class="section-label">Compare</p><h2>Normalize candidate values</h2><p>Equality supports agreement. Unequal values preserve a conflict.</p></div></li>
      <li><span>03</span><div><p class="section-label">Propose</p><h2>Surface evidence state</h2><p>One supported field and one conflict. No compliance conclusion.</p></div></li>
      <li class="trace-abstain"><span>04</span><div><p class="section-label">ABSTAIN</p><h2>${escapeHtml(unsupported.label)}</h2><p>No candidate evidence is present. The prototype requests evidence instead of inventing a value.</p></div></li>
    </ol>`;
}

function signoffMain(state, canSignOff) {
  const latestDecision = state.decisions.at(-1);
  const conflictDecision = latestDecision
    ? `<dl class="decision-audit">
        <div><dt>Action</dt><dd>${escapeHtml(latestDecision.action)}</dd></div>
        <div><dt>Reviewer</dt><dd>${escapeHtml(latestDecision.reviewer)}</dd></div>
        <div><dt>Reason</dt><dd>${escapeHtml(latestDecision.reason)}</dd></div>
        <div><dt>Recorded at</dt><dd><time datetime="${escapeHtml(latestDecision.recordedAt)}">${escapeHtml(latestDecision.recordedAt)}</time><small>Fixed synthetic demo timestamp</small></dd></div>
      </dl>`
    : '<p>Named reviewer and reason missing.</p>';
  return `${screenHeading('review-signoff', '05 / 06 · gate', 'Inspect the human decision ledger before producing a local evidence receipt.')}
    <section class="signoff-gate ${canSignOff ? 'gate-cleared' : 'gate-blocked'}" aria-labelledby="gate-title">
      <p class="section-label">Human review boundary</p>
      <h2 id="gate-title">${canSignOff ? 'Conflict gate cleared' : 'Evidence-review gate blocked'}</h2>
      <p>${canSignOff
        ? 'A named reviewer recorded a reason for the conflict. The unsupported field remains unresolved and visible.'
        : 'Committed capital still needs an explicit action, a named reviewer, and a reason.'}</p>
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
  const unsupported = manifest.fields.find(({ id }) => id === 'investor-complaints-closed');
  return `${screenHeading('evidence-receipt', '06 / 06 · retain', 'A local, printable record of inputs, candidates, a human decision, and unresolved evidence.')}
    <section class="receipt-header" aria-labelledby="receipt-title">
      <p class="section-label">Receipt / ${escapeHtml(manifest.case.id)}</p>
      <h2 id="receipt-title">${decision ? 'Human decision recorded' : 'No human decision recorded'}</h2>
      <p>Research-stage synthetic evidence record. This receipt is not approval, verification, or a regulatory filing.</p>
    </section>
    <section class="receipt-section" aria-labelledby="fingerprints-title">
      <p class="section-label">Input record</p><h2 id="fingerprints-title">Source fingerprints</h2>
      <dl class="receipt-list">${manifest.sources.map((source) => `<div><dt>${escapeHtml(source.label)}</dt><dd>${escapeHtml(source.reference)}</dd><dd class="fingerprint">${escapeHtml(source.fingerprint)}</dd></div>`).join('')}</dl>
    </section>
    <section class="receipt-section" aria-labelledby="candidate-record-title">
      <p class="section-label">Preserved disagreement</p><h2 id="candidate-record-title">Committed capital candidates</h2>
      <div class="receipt-candidates">${conflict.candidates.map((candidate, index) => `<article><span>Candidate ${index === 0 ? 'A' : 'B'}</span><strong>${escapeHtml(candidate.value)}</strong><p>${escapeHtml(candidate.reference)}</p></article>`).join('')}</div>
      ${decision ? `<dl class="human-decision"><div><dt>Action</dt><dd>${escapeHtml(decision.action)}</dd></div>${decision.candidateId == null ? '' : `<div><dt>Selected source</dt><dd>${escapeHtml(decision.candidateId)}</dd></div>`}<div><dt>Reviewer</dt><dd>${escapeHtml(decision.reviewer)}</dd></div><div><dt>Reason</dt><dd>${escapeHtml(decision.reason)}</dd></div><div><dt>Recorded at</dt><dd><time datetime="${escapeHtml(decision.recordedAt)}">${escapeHtml(decision.recordedAt)}</time><small>Fixed synthetic demo timestamp</small></dd></div></dl>` : '<p>No decision is present.</p>'}
    </section>
    <section class="receipt-section unresolved-record" aria-labelledby="unresolved-title">
      <p class="section-label">Evidence request remains open</p><h2 id="unresolved-title">${escapeHtml(unsupported.label)}</h2>
      <p><strong>${escapeHtml(unsupported.status)}</strong> · No candidate source. No value synthesized.</p>
    </section>
    <section class="receipt-section receipt-export" aria-labelledby="receipt-export-title">
      <p class="section-label">Local export</p><h2 id="receipt-export-title">Retain the bounded evidence record</h2>
      <p>Downloads remain local and preserve both conflicting candidates and the unresolved evidence request.</p>
      <div class="receipt-export-actions">
        <button class="primary-action" id="download-manifest-json" type="button">Download JSON evidence manifest</button>
        <button class="secondary-action" id="download-manifest-html" type="button">Download printable HTML evidence manifest</button>
      </div>
    </section>`;
}

export function renderMain(route, state, { reviewed, canSignOff, manifest }) {
  if (route === 'source-workspace') return workspaceMain(state);
  if (route === 'conflict-queue') return conflictMain(state);
  if (route === 'agent-trace') return traceMain(state);
  if (route === 'review-signoff') return signoffMain(state, canSignOff);
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
      <label for="candidate-select">Select source</label>
      <select id="candidate-select" name="candidateId" aria-describedby="candidate-guidance">
        <option value="">No source selected</option>
        ${field.candidates.map((candidate, index) => `<option value="${escapeHtml(candidate.id)}">Candidate ${index === 0 ? 'A' : 'B'} · ${escapeHtml(candidate.value)}</option>`).join('')}
      </select>
      <p class="field-guidance" id="candidate-guidance">Required for accept or correct. Not attributed for reject or defer.</p>
      <label for="reviewer">Reviewer</label>
      <input id="reviewer" name="reviewer" autocomplete="off">
      <label for="decision-reason">Decision reason</label>
      <textarea id="decision-reason" name="reason" rows="5"></textarea>
      <p class="form-error" id="decision-error" role="alert"></p>
      <button class="primary-action" type="submit">Record human decision</button>
    </form>
  </section>`;
}

export function renderReviewDrawer(route, state, { reviewed, canSignOff }) {
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
    return `<section class="review-panel" aria-labelledby="trace-scope-title"><p class="section-label">Trace scope</p><h2 id="trace-scope-title">Bounded and replayable</h2><p>The shown path is deterministic prototype behavior, not a live model run.</p><a class="secondary-action" href="#review-signoff">Inspect review gate</a></section>`;
  }
  if (route === 'review-signoff') {
    return `<section class="review-panel" aria-labelledby="signoff-action-title"><p class="section-label">Gate action</p><h2 id="signoff-action-title">${canSignOff ? 'Conflict decision retained' : 'Conflict decision required'}</h2><p>${canSignOff ? 'The local receipt can now show the named decision while retaining the unsupported item.' : 'Return to the conflict queue. Select an action and provide reviewer context.'}</p><a class="secondary-action" href="${canSignOff ? '#evidence-receipt' : '#conflict-queue'}">${canSignOff ? 'Open evidence receipt' : 'Resolve conflict'}</a></section>`;
  }
  return `<section class="review-panel" aria-labelledby="receipt-scope-title"><p class="section-label">Receipt scope</p><h2 id="receipt-scope-title">Local evidence record</h2><p>Both candidates, all input fingerprints, the human reason, and the unsupported field remain visible.</p><button class="secondary-action" id="reset-demo" type="button">Reset demo</button></section>`;
}

export function renderTopNavigation(route) {
  return Object.entries(SCREEN_NAMES).map(([slug, name], index) => `<a href="#${slug}" ${slug === route ? 'aria-current="page"' : ''}><span>0${index + 1}</span>${escapeHtml(name)}</a>`).join('');
}
