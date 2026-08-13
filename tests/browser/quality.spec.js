import { expect, test } from 'playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installLocalRoute, LOCAL_ORIGIN } from '../../scripts/local-route.mjs';

const projectRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const screens = [
  'Case dashboard',
  'Source-to-field workspace',
  'Conflict queue',
  'Agent trace',
  'Review and sign-off',
  'Evidence receipt',
];
const captureStates = {
  dashboard: { route: 'dashboard', reviewed: false, decision: false },
  workspace: { route: 'source-workspace', reviewed: true, decision: false },
  conflict: { route: 'conflict-queue', reviewed: true, decision: false },
  trace: { route: 'agent-trace', reviewed: true, decision: false },
  receipt: { route: 'evidence-receipt', reviewed: true, decision: true },
};
const fixedRecordedAt = '2026-08-12T12:00:00+05:30';
const fixedOfficerConfirmedAt = '2026-08-12T12:10:00+05:30';
const fixedGeneratedAt = '2026-08-12T12:05:00+05:30';

async function openBoard(page) {
  await installLocalRoute(page, projectRoot);
  return page.goto(`${LOCAL_ORIGIN}/wireframes/`);
}

async function openCapture(page, state) {
  await installLocalRoute(page, projectRoot);
  const response = await page.goto(`${LOCAL_ORIGIN}/prototype/?capture=${state}`);
  expect(response?.status()).toBe(200);
  const root = page.locator('#prototype-root');
  await expect(root).toHaveAttribute('data-capture-ready', 'true');
  await expect(root).toHaveAttribute('data-capture-state', state);
  return root;
}

async function readDownloadText(download) {
  expect(await download.failure()).toBeNull();
  const stream = await download.createReadStream();
  expect(stream).not.toBeNull();
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

test('each wireframe exposes its complete semantic review contract', async ({ page }) => {
  const response = await openBoard(page);
  expect(response?.status()).toBe(200);

  for (const name of screens) {
    const article = page.getByRole('article', { name });
    await expect(article.getByRole('heading', { name })).toBeVisible();
    for (const label of ['Task', 'Primary action', 'Error / empty state', 'Mobile collapse']) {
      await expect(article.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(article.getByText('SYNTHETIC DEMO DATA', { exact: true }).first()).toBeVisible();
  }
});

test('wireframe board has no serious or critical axe violations', async ({ page }) => {
  await openBoard(page);
  const results = await new AxeBuilder({ page }).analyze();
  const violations = results.violations.filter(({ impact }) => ['serious', 'critical'].includes(impact));
  expect(violations).toEqual([]);
});

test('skip link and screen navigation are keyboard accessible', async ({ page }) => {
  await openBoard(page);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to wireframe board' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#wireframe-board$/u);
  await expect(page.getByRole('main')).toBeFocused();

  const firstScreenLink = page.getByRole('navigation', { name: 'Wireframe screen index' })
    .getByRole('link', { name: /Case dashboard/u });
  await firstScreenLink.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#case-dashboard$/u);
  await expect(page.getByRole('article', { name: 'Case dashboard' })).toBeFocused();
});

for (const width of [390, 768, 1440]) {
  test(`wireframe board has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openBoard(page);
    const geometry = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      overflowingArticles: [...document.querySelectorAll('article')]
        .filter((article) => article.scrollWidth > article.clientWidth)
        .map((article) => article.id),
    }));

    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.overflowingArticles).toEqual([]);
  });
}

test('computed body and supporting copy meet font-size floors', async ({ page }) => {
  await openBoard(page);
  const floors = await page.evaluate(() => {
    const sizes = (selector) => [...document.querySelectorAll(selector)]
      .map((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    return {
      body: Number.parseFloat(getComputedStyle(document.body).fontSize),
      bodyCopy: sizes('.board-subtitle, .screen-contract dd, .case-name, .panel-body'),
      support: sizes('.classification, .folio, .panel-label, .case-line, .status-line, .screen-contract dt, .stage-notice, .screen-index a, .marker, .stage-action, .panel-meta'),
    };
  });

  expect(floors.body).toBeGreaterThanOrEqual(17);
  expect(floors.bodyCopy.every((fontSize) => fontSize >= 17)).toBe(true);
  expect(floors.support.every((fontSize) => fontSize >= 14)).toBe(true);
});

test('board loads without console errors, remote requests, or failed local resources', async ({ page }) => {
  const consoleErrors = [];
  const requests = [];
  const responses = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('request', (request) => requests.push(request.url()));
  page.on('response', (response) => responses.push({ url: response.url(), status: response.status() }));

  await openBoard(page);
  await page.waitForLoadState('networkidle');

  expect(consoleErrors).toEqual([]);
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.every((url) => url.startsWith(`${LOCAL_ORIGIN}/`))).toBe(true);
  expect(responses.length).toBe(requests.length);
  expect(responses.every(({ url, status }) => url.startsWith(`${LOCAL_ORIGIN}/`) && status === 200)).toBe(true);
});

test('receipt downloads deterministic, bounded JSON and printable HTML with audited Blob cleanup', async ({ page }) => {
  await page.addInitScript(() => {
    const createObjectURL = URL.createObjectURL.bind(URL);
    const revokeObjectURL = URL.revokeObjectURL.bind(URL);
    window.__attestBlobAudit = [];
    URL.createObjectURL = (blob) => {
      const url = createObjectURL(blob);
      const record = { url, type: blob.type, size: blob.size, text: null, revokeCount: 0 };
      window.__attestBlobAudit.push(record);
      blob.text().then((text) => { record.text = text; });
      return url;
    };
    URL.revokeObjectURL = (url) => {
      const record = window.__attestBlobAudit.find((entry) => entry.url === url);
      if (record) record.revokeCount += 1;
      return revokeObjectURL(url);
    };
  });
  await openCapture(page, 'receipt');

  const jsonDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON evidence manifest' }).click();
  const jsonDownload = await jsonDownloadPromise;
  expect(jsonDownload.suggestedFilename()).toBe('kriseva-attest-meridian-horizon-q2-2026-evidence-manifest.json');

  const htmlDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download printable HTML evidence manifest' }).click();
  const htmlDownload = await htmlDownloadPromise;
  expect(htmlDownload.suggestedFilename()).toBe('kriseva-attest-meridian-horizon-q2-2026-evidence-manifest.html');

  const downloadedJson = await readDownloadText(jsonDownload);
  const downloadedHtml = await readDownloadText(htmlDownload);

  await expect.poll(() => page.evaluate(() => window.__attestBlobAudit.map((entry) => ({
    type: entry.type,
    size: entry.size,
    text: entry.text,
    revokeCount: entry.revokeCount,
  })))).toEqual([
    expect.objectContaining({ type: 'application/json;charset=utf-8', revokeCount: 1 }),
    expect.objectContaining({ type: 'text/html;charset=utf-8', revokeCount: 1 }),
  ]);
  const audit = await page.evaluate(() => window.__attestBlobAudit);
  expect(audit.every(({ size, text }) => size > 0 && typeof text === 'string' && text.length > 0)).toBe(true);
  expect(downloadedJson).toBe(audit[0].text);
  expect(downloadedHtml).toBe(audit[1].text);

  const manifest = JSON.parse(downloadedJson);
  expect(manifest.product).toBe('KRISEVA ATTEST');
  expect(manifest.generatedAt).toBe(fixedGeneratedAt);
  expect(manifest.metadata).toEqual({
    research_stage: true,
    synthetic: true,
    not_a_filing: true,
    human_decision_required: true,
  });
  expect(manifest.fields.map(({ id, status }) => ({ id, status }))).toEqual([
    { id: 'closing-nav', status: 'SUPPORTED' },
    { id: 'committed-capital', status: 'CONFLICTING' },
    { id: 'investor-complaints-closed', status: 'UNSUPPORTED' },
  ]);
  expect(manifest.fields.find(({ id }) => id === 'committed-capital').candidates.map(({ value }) => value)).toEqual([
    'USD 25,000,000',
    'USD 24,000,000',
  ]);
  expect(manifest.humanDecisions).toEqual([expect.objectContaining({
    fieldId: 'committed-capital',
    reviewer: 'Demo Reviewer',
    reason: 'Administrator figure ties to the executed subscription register; earlier schedule superseded.',
    recordedAt: fixedRecordedAt,
  })]);
  expect(manifest.principalOfficerConfirmation).toEqual({
    officerName: 'Demo Officer',
    confirmed: true,
    recordedAt: fixedOfficerConfirmedAt,
  });
  expect(manifest.integrity.algorithm).toBe('sha256');
  expect(manifest.integrity.digest).toMatch(/^[0-9a-f]{64}$/u);
  expect(manifest.unresolvedItems.map(({ id, status }) => ({ id, status }))).toEqual([
    { id: 'committed-capital', status: 'CONFLICTING' },
    { id: 'investor-complaints-closed', status: 'UNSUPPORTED' },
  ]);

  const printable = downloadedHtml;
  expect(printable.startsWith('<!doctype html>')).toBe(true);
  for (const requiredText of [
    '@media print',
    'USD 25,000,000',
    'USD 24,000,000',
    'Demo Reviewer',
    'Administrator figure ties to the executed subscription register; earlier schedule superseded.',
    'Investor complaints closed',
    'NOT A REGULATORY FILING',
    'Demo Officer',
    'Confirming Principal Officer',
    manifest.integrity.digest,
  ]) expect(printable).toContain(requiredText);
  expect(printable).not.toMatch(/<script\b|https?:\/\/|data:|file:\/\/|\/Users\/|mailto:|tel:|(?:phone|mobile)\s*[:=]|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/iu);
});

for (const [captureState, contract] of Object.entries(captureStates)) {
  test(`capture preset ${captureState} resolves its exact deterministic route and state`, async ({ page }) => {
    const root = await openCapture(page, captureState);
    await expect(page).toHaveURL(new RegExp(`\\?capture=${captureState}#${contract.route}$`, 'u'));
    await expect(root.locator(`.workspace[data-route="${contract.route}"]`)).toBeVisible();
    await expect(root.locator('.field-index .status-pending')).toHaveCount(contract.reviewed ? 0 : 3);
    await expect(root.locator('.field-index .status-supported')).toHaveCount(contract.reviewed ? 1 : 0);
    if (captureState === 'conflict') {
      await expect(page.locator('input[name="action"]:checked')).toHaveCount(0);
      await expect(page.getByLabel('Select source')).toHaveValue('');
    }
    if (captureState === 'trace') {
      await expect(page.getByText('ABSTAIN', { exact: true })).toBeVisible();
    }
    if (contract.decision) {
      await expect(page.getByText('Demo Reviewer', { exact: true })).toBeVisible();
      await expect(page.getByText(fixedRecordedAt, { exact: true })).toBeVisible();
      await expect(page.getByText('Demo Officer', { exact: true })).toBeVisible();
      await expect(page.getByText(fixedOfficerConfirmedAt, { exact: true })).toBeVisible();
      await expect(page.getByText('Deciding reviewer', { exact: true })).toBeVisible();
      await expect(page.getByText('Confirming Principal Officer', { exact: true })).toBeVisible();
      await expect(root.locator('#manifest-digest')).toHaveText(/^[0-9a-f]{16}$/u);
      await expect(page.getByRole('button', { name: 'Download JSON evidence manifest' })).toBeEnabled();
    }
  });
}

test('unknown capture query cannot bypass default protection and ordinary visits stay fresh', async ({ page }) => {
  await installLocalRoute(page, projectRoot);
  await page.goto(`${LOCAL_ORIGIN}/prototype/?capture=unknown#evidence-receipt`);
  await expect(page).toHaveURL(/\?capture=unknown#dashboard$/u);
  await expect(page.locator('#prototype-root')).not.toHaveAttribute('data-capture-ready', 'true');
  await expect(page.locator('.field-index .status-pending')).toHaveCount(3);

  await openCapture(page, 'receipt');
  await page.goto(`${LOCAL_ORIGIN}/prototype/`);
  await expect(page).toHaveURL(/\/prototype\/#dashboard$/u);
  await expect(page.locator('.field-index .status-pending')).toHaveCount(3);
  await expect(page.getByText('Demo Reviewer', { exact: true })).toHaveCount(0);
});

test('inherited capture names are rejected and never announce capture readiness', async ({ page }) => {
  await installLocalRoute(page, projectRoot);

  for (const inheritedName of ['constructor', '__proto__', 'toString']) {
    await page.goto(`${LOCAL_ORIGIN}/prototype/?capture=${encodeURIComponent(inheritedName)}#evidence-receipt`);
    await expect(page).toHaveURL(new RegExp(`\\?capture=${encodeURIComponent(inheritedName)}#dashboard$`, 'u'));
    const root = page.locator('#prototype-root');
    await expect(root).not.toHaveAttribute('data-capture-ready', 'true');
    await expect(root).not.toHaveAttribute('data-capture-state', inheritedName);
    await expect(root.locator('.field-index .status-pending')).toHaveCount(3);
  }
});

for (const captureState of Object.keys(captureStates)) {
  for (const width of [390, 768, 1440]) {
    test(`${captureState} capture has no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : width === 768 ? 1024 : 1000 });
      await openCapture(page, captureState);
      const geometry = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        overflowing: [...document.querySelectorAll('main, aside, section, article')]
          .filter((element) => element.scrollWidth > element.clientWidth)
          .map((element) => `${element.tagName.toLowerCase()}#${element.id}.${element.className}`),
      }));
      expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
      expect(geometry.overflowing).toEqual([]);
    });
  }

  test(`${captureState} capture is axe-clean at 1440px`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openCapture(page, captureState);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter(({ impact }) => ['serious', 'critical'].includes(impact))).toEqual([]);
  });
}

test('all capture presets load only successful local resources without browser errors', async ({ page }) => {
  const consoleErrors = [];
  const pageErrors = [];
  const requestFailures = [];
  const requests = [];
  const responses = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => requestFailures.push(request.url()));
  page.on('request', (request) => requests.push(request.url()));
  page.on('response', (response) => responses.push({ url: response.url(), status: response.status() }));
  await installLocalRoute(page, projectRoot);

  for (const captureState of Object.keys(captureStates)) {
    await page.goto(`${LOCAL_ORIGIN}/prototype/?capture=${captureState}`);
    await expect(page.locator('#prototype-root')).toHaveAttribute('data-capture-ready', 'true');
  }
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(requestFailures).toEqual([]);
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.every((url) => url.startsWith(`${LOCAL_ORIGIN}/`))).toBe(true);
  expect(responses.length).toBe(requests.length);
  expect(responses.every(({ url, status }) => url.startsWith(`${LOCAL_ORIGIN}/`) && status === 200)).toBe(true);
});
