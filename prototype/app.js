import { buildManifest, manifestToHtml } from '../src/manifest.js';
import { canSignOff, loadCase, recordDecision, resetCase, runEvidenceReview } from '../src/case-engine.js';
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
  'review-signoff',
  'evidence-receipt'
]);
const PROTECTED_ROUTES = new Set([...ROUTES].filter((route) => route !== 'dashboard'));
const RECORDED_AT = '2026-08-12T12:00:00+05:30';
const GENERATED_AT = '2026-08-12T12:05:00+05:30';
const EXPORT_STEM = 'kriseva-attest-meridian-horizon-q2-2026-evidence-manifest';
const CAPTURE_PRESETS = {
  dashboard: { route: 'dashboard', reviewed: false, decided: false },
  workspace: { route: 'source-workspace', reviewed: true, decided: false },
  conflict: { route: 'conflict-queue', reviewed: true, decided: false },
  trace: { route: 'agent-trace', reviewed: true, decided: false },
  receipt: { route: 'evidence-receipt', reviewed: true, decided: true }
};

const root = document.querySelector('#prototype-root');
const navigation = document.querySelector('#screen-navigation');
const announcement = document.querySelector('#announcement');
const headerReset = document.querySelector('#header-reset');
let fixture;
let state;
let pendingFocus = false;
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

function setHash(route, { replace = false, focus = true } = {}) {
  pendingFocus = focus;
  const nextHash = `#${route}`;
  if (window.location.hash === nextHash) {
    render(route);
    if (focus) focusActiveHeading();
    return;
  }
  if (replace) window.history.replaceState(null, '', routeUrl(route));
  else window.location.hash = route;
  if (replace) render(route);
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

function handleDecisionSubmit(event) {
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
  render('conflict-queue');
  announce('Decision saved. Conflict gate cleared.');
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
  document.querySelector('#run-review')?.addEventListener('click', () => {
    state = runEvidenceReview(state);
    announce('Evidence review recorded: 1 supported, 1 conflicting, 1 unsupported.');
    setHash('source-workspace');
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

function buildBrowserManifest() {
  const manifest = buildManifest(state, { generatedAt: GENERATED_AT });
  return {
    ...manifest,
    metadata: {
      research_stage: true,
      synthetic: true,
      not_a_filing: true,
      human_decision_required: true
    }
  };
}

function render(requestedRoute = routeFromHash()) {
  const route = enforceRoute(requestedRoute);
  const reviewed = isReviewed();
  const gateCleared = canSignOff(state);
  const manifest = buildBrowserManifest();
  navigation.innerHTML = renderTopNavigation(route);
  root.innerHTML = `<div class="workspace" data-route="${route}">
    ${renderEvidenceIndex(state, reviewed)}
    <main class="active-screen" id="app-screen" aria-labelledby="active-screen-title">
      ${renderMain(route, state, { reviewed, canSignOff: gateCleared, manifest })}
    </main>
    <aside class="review-drawer" aria-label="Human review panel">
      ${renderReviewDrawer(route, state, { reviewed, canSignOff: gateCleared })}
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

function resetDemo() {
  state = resetCase(fixture);
  window.history.replaceState(null, '', routeUrl('dashboard'));
  render('dashboard');
  announce('Demo reset. Three fields are pending evidence review.');
  focusRunButton();
}

function handleHashChange() {
  pendingFocus = true;
  render(routeFromHash());
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
      reason: 'Board schedule is older than the administrator statement.',
      recordedAt: RECORDED_AT
    });
  }
  const initialRoute = capturePreset?.route ?? routeFromHash();
  if (capturePreset || !window.location.hash || !ROUTES.has(window.location.hash.slice(1))) {
    window.history.replaceState(null, '', routeUrl(initialRoute));
  }
  render(initialRoute);
} catch (error) {
  root.setAttribute('aria-busy', 'false');
  root.innerHTML = `<main class="loading-state"><h1>Local case unavailable</h1><p>${String(error.message)}</p></main>`;
}
