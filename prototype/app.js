import { buildManifest, manifestToHtml, withManifestIntegrity, sha256HexSync } from '../src/manifest.js';
import { replayEnvelope } from '../scripts/execution-envelope.mjs';
import {
  canSignOff,
  hasConflictDecision,
  loadCase,
  pendingSignOffGates,
  recordDecision,
  recordRiskDisposition,
  recordSignOff,
  resetCase,
  runEvidenceReview
} from '../src/case-engine.js';
import { computeAnomalyFlags } from '../src/risk-engine.js';
import {
  renderEvidenceIndex,
  renderMain,
  renderReviewDrawer,
  renderTopNavigation
} from '../src/dom-renderers.js';

const ROUTES = new Set([
  'dashboard',
  'source-workspace',
  'conflict-queue',
  'agent-trace',
  'risk-board',
  'review-signoff',
  'evidence-receipt'
]);
const PROTECTED_ROUTES = new Set([...ROUTES].filter((route) => route !== 'dashboard'));
const RECORDED_AT = '2026-08-12T12:00:00+05:30';
const DISPOSITIONED_AT = '2026-08-12T12:05:30+05:30';
const OFFICER_CONFIRMED_AT = '2026-08-12T12:10:00+05:30';
const GENERATED_AT = '2026-08-12T12:05:00+05:30';
const EXPORT_STEM = 'kriseva-attest-meridian-horizon-q2-2026-evidence-manifest';
// dispositionFlagIds: 'all' dispositions every currently-active flag; an
// array dispositions only those flag ids (used by the 'risk' preset to leave
// some flags visibly open); omitted means no dispositions are recorded.
const CAPTURE_PRESETS = {
  dashboard: { route: 'dashboard', reviewed: false, decided: false, signedOff: false },
  workspace: { route: 'source-workspace', reviewed: true, decided: false, signedOff: false },
  conflict: { route: 'conflict-queue', reviewed: true, decided: false, signedOff: false },
  trace: { route: 'agent-trace', reviewed: true, decided: false, signedOff: false },
  risk: { route: 'risk-board', reviewed: true, decided: true, signedOff: false, dispositionFlagIds: ['stale-source'] },
  receipt: { route: 'evidence-receipt', reviewed: true, decided: true, signedOff: true, dispositionFlagIds: 'all' }
};

// Prefer the real Web Crypto API (available in secure browsing contexts:
// https, or http://localhost). Fall back to the pure-JS implementation for
// contexts Web Crypto refuses to run in (e.g. the deterministic test/capture
// origin, which is plain http on a non-localhost hostname). Both paths
// produce byte-identical SHA-256 digests for identical input.
async function sha256Hex(text) {
  if (window.crypto?.subtle) {
    const bytes = new TextEncoder().encode(text);
    const digestBuffer = await window.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digestBuffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return sha256HexSync(text);
}

const root = document.querySelector('#prototype-root');
const navigation = document.querySelector('#screen-navigation');
const announcement = document.querySelector('#announcement');
const headerReset = document.querySelector('#header-reset');
let fixture;
let state;
let pendingFocus = false;
let recordedRunEnvelope = null;
let recordedRunReplay = null;
const requestedCapture = new URLSearchParams(window.location.search).get('capture');
const capturePreset = requestedCapture && Object.hasOwn(CAPTURE_PRESETS, requestedCapture)
  ? CAPTURE_PRESETS[requestedCapture]
  : null;

function isReviewed() {
  return state.fields.every(({ status }) => status !== 'PENDING');
}

function routeFromHash() {
  const requested = window.location.hash.slice(1);
  return ROUTES.has(requested) ? requested : 'dashboard';
}

function announce(message) {
  announcement.textContent = '';
  window.requestAnimationFrame(() => {
    announcement.textContent = message;
  });
}

function routeUrl(route) {
  return `${window.location.pathname}${window.location.search}#${route}`;
}

async function setHash(route, { replace = false, focus = true } = {}) {
  pendingFocus = focus;
  const nextHash = `#${route}`;
  if (window.location.hash === nextHash) {
    await render(route);
    if (focus) focusActiveHeading();
    return;
  }
  if (replace) window.history.replaceState(null, '', routeUrl(route));
  else window.location.hash = route;
  if (replace) await render(route);
}

function enforceRoute(route) {
  if (PROTECTED_ROUTES.has(route) && !isReviewed()) {
    window.history.replaceState(null, '', routeUrl('dashboard'));
    announce('Run evidence review first.');
    return 'dashboard';
  }
  return route;
}

function focusActiveHeading() {
  document.querySelector('#active-screen-title')?.focus({ preventScroll: true });
}

function focusRunButton() {
  document.querySelector('#run-review')?.focus({ preventScroll: true });
}

function validateDecision(form) {
  const action = form.querySelector('input[name="action"]:checked');
  const candidate = form.elements.candidateId;
  const reviewer = form.elements.reviewer;
  const reason = form.elements.reason;
  if (!action) return { message: 'Choose a human decision action.', target: form.querySelector('input[name="action"]') };
  if (['ACCEPT', 'CORRECT'].includes(action.value) && !candidate.value) return { message: 'Select a source for this action.', target: candidate };
  if (!reviewer.value.trim()) return { message: 'Enter the reviewer name.', target: reviewer };
  if (!reason.value.trim()) return { message: 'Enter a decision reason.', target: reason };
  return null;
}

async function handleDecisionSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const error = validateDecision(form);
  const errorRegion = form.querySelector('#decision-error');
  if (error) {
    errorRegion.textContent = error.message;
    error.target.focus();
    return;
  }

  const formData = new FormData(form);
  state = recordDecision(state, 'committed-capital', {
    action: formData.get('action'),
    candidateId: formData.get('candidateId') || null,
    reviewer: formData.get('reviewer'),
    reason: formData.get('reason'),
    recordedAt: RECORDED_AT
  });
  await render('conflict-queue');
  announce('Decision saved. Conflict gate cleared.');
  document.querySelector('#active-screen-title')?.focus();
}

function validateSignOff(form, reviewerName) {
  const officerName = form.elements.officerName;
  const confirmed = form.elements.confirmed;
  if (!officerName.value.trim()) return { message: 'Enter the Principal Officer (demo) name.', target: officerName };
  if (officerName.value.trim().toLowerCase() === reviewerName.trim().toLowerCase()) {
    return {
      message: 'Maker-checker separation: the confirming officer must differ from the deciding reviewer.',
      target: officerName
    };
  }
  if (!confirmed.checked) return { message: 'Confirm the evidence record for all three fields has been reviewed.', target: confirmed };
  return null;
}

function validateDispositionForm(form) {
  const action = form.querySelector('input[name="action"]:checked');
  const disposerName = form.elements.disposerName;
  const reason = form.elements.reason;
  if (!action) return { message: 'Choose a disposition action.', target: form.querySelector('input[name="action"]') };
  if (!disposerName.value.trim()) return { message: 'Enter the disposer name.', target: disposerName };
  if (!reason.value.trim()) return { message: 'Enter a disposition reason.', target: reason };
  return null;
}

async function handleDispositionSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const flagId = form.dataset.flagId;
  const error = validateDispositionForm(form);
  const errorRegion = form.querySelector(`#disposition-error-${flagId}`);
  if (error) {
    errorRegion.textContent = error.message;
    error.target.focus();
    return;
  }

  const formData = new FormData(form);
  state = recordRiskDisposition(state, flagId, {
    action: formData.get('action'),
    disposerName: formData.get('disposerName'),
    reason: formData.get('reason'),
    recordedAt: DISPOSITIONED_AT
  });
  await render('risk-board');
  announce('Disposition recorded for this anomaly flag.');
  document.querySelector('#active-screen-title')?.focus();
}

async function handleSignOffSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const reviewerName = state.decisions.at(-1)?.reviewer ?? '';
  const error = validateSignOff(form, reviewerName);
  const errorRegion = form.querySelector('#signoff-error');
  if (error) {
    errorRegion.textContent = error.message;
    error.target.focus();
    return;
  }

  state = recordSignOff(state, {
    officerName: form.elements.officerName.value,
    confirmed: form.elements.confirmed.checked,
    recordedAt: OFFICER_CONFIRMED_AT
  });
  await render('review-signoff');
  announce('Principal Officer sign-off recorded. The evidence record now carries both named actors.');
  document.querySelector('#active-screen-title')?.focus();
}

function downloadManifest(contents, type, filename) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function bindInteractions(manifest) {
  document.querySelector('#run-review')?.addEventListener('click', async () => {
    state = runEvidenceReview(state);
    announce('Evidence review recorded: 1 supported, 1 conflicting, 1 unsupported.');
    await setHash('source-workspace');
  });
  const decisionForm = document.querySelector('#decision-form');
  if (decisionForm) {
    const candidate = decisionForm.elements.candidateId;
    const syncCandidateControl = () => {
      const action = decisionForm.querySelector('input[name="action"]:checked')?.value;
      const sourceApplies = ['ACCEPT', 'CORRECT'].includes(action);
      if (!sourceApplies && action) candidate.value = '';
      candidate.disabled = Boolean(action) && !sourceApplies;
    };
    decisionForm.querySelectorAll('input[name="action"]').forEach((control) => {
      control.addEventListener('change', syncCandidateControl);
    });
    syncCandidateControl();
  }
  document.querySelector('#decision-form')?.addEventListener('submit', handleDecisionSubmit);
  document.querySelectorAll('.disposition-form').forEach((form) => {
    form.addEventListener('submit', handleDispositionSubmit);
  });
  document.querySelector('#signoff-form')?.addEventListener('submit', handleSignOffSubmit);
  document.querySelector('#reset-demo')?.addEventListener('click', resetDemo);
  document.querySelector('#download-manifest-json')?.addEventListener('click', () => {
    downloadManifest(
      `${JSON.stringify(manifest, null, 2)}\n`,
      'application/json;charset=utf-8',
      `${EXPORT_STEM}.json`
    );
  });
  document.querySelector('#download-manifest-html')?.addEventListener('click', () => {
    downloadManifest(
      manifestToHtml(manifest),
      'text/html;charset=utf-8',
      `${EXPORT_STEM}.html`
    );
  });
}

async function buildBrowserManifest() {
  const manifest = buildManifest(state, { generatedAt: GENERATED_AT });
  const withDisplayMetadata = {
    ...manifest,
    metadata: {
      research_stage: true,
      synthetic: true,
      not_a_filing: true,
      human_decision_required: true
    }
  };
  return withManifestIntegrity(withDisplayMetadata, { sha256Hex });
}

async function render(requestedRoute = routeFromHash()) {
  const route = enforceRoute(requestedRoute);
  const reviewed = isReviewed();
  const conflictDecided = hasConflictDecision(state);
  const gateCleared = canSignOff(state);
  const pendingGates = pendingSignOffGates(state);
  const manifest = await buildBrowserManifest();
  navigation.innerHTML = renderTopNavigation(route);
  root.innerHTML = `<div class="workspace" data-route="${route}">
    ${renderEvidenceIndex(state, reviewed)}
    <main class="active-screen" id="app-screen" aria-labelledby="active-screen-title">
      ${renderMain(route, state, { reviewed, conflictDecided, canSignOff: gateCleared, pendingGates, manifest, envelope: recordedRunEnvelope, replay: recordedRunReplay })}
    </main>
    <aside class="review-drawer" aria-label="Human review panel">
      ${renderReviewDrawer(route, state, { reviewed, conflictDecided, canSignOff: gateCleared })}
    </aside>
  </div>`;
  root.setAttribute('aria-busy', 'false');
  if (capturePreset) {
    root.dataset.captureReady = 'true';
    root.dataset.captureState = requestedCapture;
  } else {
    delete root.dataset.captureReady;
    delete root.dataset.captureState;
  }
  bindInteractions(manifest);
  if (pendingFocus) {
    pendingFocus = false;
    focusActiveHeading();
  }
}

async function resetDemo() {
  state = resetCase(fixture);
  window.history.replaceState(null, '', routeUrl('dashboard'));
  await render('dashboard');
  announce('Demo reset. Three fields are pending evidence review.');
  focusRunButton();
}

async function handleHashChange() {
  pendingFocus = true;
  await render(routeFromHash());
}

document.querySelector('.skip-link').addEventListener('click', (event) => {
  event.preventDefault();
  focusActiveHeading();
});

headerReset.addEventListener('click', resetDemo);
window.addEventListener('hashchange', handleHashChange);

try {
  const response = await fetch('../data/synthetic-case.json');
  if (!response.ok) throw new Error(`Unable to load local fixture (${response.status}).`);
  fixture = await response.json();
  state = loadCase(fixture);
  if (capturePreset?.reviewed) state = runEvidenceReview(state);
  if (capturePreset?.decided) {
    state = recordDecision(state, 'committed-capital', {
      action: 'ACCEPT',
      candidateId: 'admin-committed',
      reviewer: 'Demo Reviewer',
      reason: 'Administrator figure ties to the executed subscription register; earlier schedule superseded.',
      recordedAt: RECORDED_AT
    });
  }
  if (capturePreset?.dispositionFlagIds) {
    const flagIds = capturePreset.dispositionFlagIds === 'all'
      ? computeAnomalyFlags(state).map((flag) => flag.id)
      : capturePreset.dispositionFlagIds;
    for (const flagId of flagIds) {
      state = recordRiskDisposition(state, flagId, {
        action: 'ACKNOWLEDGE',
        disposerName: 'Demo Officer',
        reason: 'Reviewed and acknowledged for this synthetic demo case.',
        recordedAt: DISPOSITIONED_AT
      });
    }
  }
  if (capturePreset?.signedOff) {
    state = recordSignOff(state, {
      officerName: 'Demo Officer',
      confirmed: true,
      recordedAt: OFFICER_CONFIRMED_AT
    });
  }
  // The recorded live-run envelope is a supplementary panel on the agent-trace
  // screen, not the local case fixture: a missing or unreadable envelope must
  // not take down the rest of the prototype, so its failure is caught here
  // rather than by the outer try/catch.
  try {
    const envelopeResponse = await fetch('../data/live-run-envelope.json');
    if (envelopeResponse.ok) {
      recordedRunEnvelope = await envelopeResponse.json();
      recordedRunReplay = await replayEnvelope(recordedRunEnvelope, { sha256Hex });
    }
  } catch {
    recordedRunEnvelope = null;
    recordedRunReplay = null;
  }

  const initialRoute = capturePreset?.route ?? routeFromHash();
  if (capturePreset || !window.location.hash || !ROUTES.has(window.location.hash.slice(1))) {
    window.history.replaceState(null, '', routeUrl(initialRoute));
  }
  await render(initialRoute);
} catch (error) {
  root.setAttribute('aria-busy', 'false');
  root.innerHTML = `<main class="loading-state"><h1>Local case unavailable</h1><p>${String(error.message)}</p></main>`;
}
