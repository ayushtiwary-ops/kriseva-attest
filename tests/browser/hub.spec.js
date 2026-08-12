import { expect, test } from 'playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installLocalRoute, LOCAL_ORIGIN } from '../../scripts/local-route.mjs';

const projectRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));

async function openHub(page) {
  await installLocalRoute(page, projectRoot);
  return page.goto(`${LOCAL_ORIGIN}/`);
}

test('root serves the complete six-artifact submission hub', async ({ page }) => {
  const response = await openHub(page);
  expect(response?.status()).toBe(200);

  await expect(page.getByRole('heading', {
    name: 'Show the evidence behind a reported field, and stop when the record disagrees.',
  })).toBeVisible();

  for (const disclosure of [
    'Research-stage prototype',
    'Synthetic demo data',
    'Not a regulatory filing',
    'Not connected to IFSCA systems',
  ]) await expect(page.getByText(disclosure, { exact: true }).first()).toBeVisible();

  const artifactContracts = [
    ['prototype', 'active-artifact', 'Launch interactive prototype', 1],
    ['wireframes', 'active-artifact', 'View wireframes', 1],
    ['video', 'active-artifact', 'Watch verified demo', 1],
    ['deck', 'active-artifact', 'View verified pitch deck', 1],
    ['technical-notes', 'active-artifact', 'Read technical notes', 1],
    ['github', 'active-artifact', 'View source repository', 1],
  ];
  await expect(page.locator('[data-artifact]')).toHaveCount(6);
  for (const [artifact, stateClass, controlLabel, linkCount] of artifactContracts) {
    const card = page.locator(`[data-artifact="${artifact}"]`);
    await expect(card).toHaveCount(1);
    await expect(card).toHaveClass(new RegExp(`\\b${stateClass}\\b`, 'u'));
    await expect(card.getByText(controlLabel, { exact: true })).toBeVisible();
    await expect(card.locator('a[href]')).toHaveCount(linkCount);
  }
});

test('technical-notes action opens a readable same-origin page without downloading', async ({ page }) => {
  await openHub(page);
  const downloads = [];
  page.on('download', (download) => downloads.push(download.suggestedFilename()));

  await page.getByRole('link', { name: 'Read technical notes' }).click();

  await expect(page).toHaveURL(`${LOCAL_ORIGIN}/technical-notes.html`);
  await expect(page.getByRole('heading', { name: 'Technical notes', exact: true })).toBeVisible();
  await expect(page.getByText('A human decision with a reviewer and reason is required for a material conflict.', {
    exact: true,
  })).toBeVisible();
  expect(downloads).toEqual([]);
});

test('technical-notes page is accessible and loads only successful local resources', async ({ page }) => {
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

  const response = await page.goto(`${LOCAL_ORIGIN}/technical-notes.html`);
  expect(response?.status()).toBe(200);
  await page.waitForLoadState('networkidle');
  const axe = await new AxeBuilder({ page }).analyze();

  expect(axe.violations.filter(({ impact }) => ['serious', 'critical'].includes(impact))).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(requestFailures).toEqual([]);
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.every((url) => url.startsWith(`${LOCAL_ORIGIN}/`))).toBe(true);
  expect(responses.length).toBe(requests.length);
  expect(responses.every(({ url, status }) => url.startsWith(`${LOCAL_ORIGIN}/`) && status === 200)).toBe(true);
});

test('technical-note flow narratives retain a readable text column', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await installLocalRoute(page, projectRoot);
  await page.goto(`${LOCAL_ORIGIN}/technical-notes.html`);

  const narratives = page.locator('.notes-flow li > span');
  await expect(narratives).toHaveCount(6);
  const widths = await narratives.evaluateAll((elements) => elements.map((element) => (
    element.getBoundingClientRect().width
  )));
  expect(widths.every((width) => width >= 240)).toBe(true);
});

test('every active hub link, fragment, and stylesheet resolves locally', async ({ page }) => {
  await openHub(page);
  const targets = await page.locator('a[href], link[rel="stylesheet"][href]').evaluateAll((elements) => (
    elements.map((element) => ({
      href: element.getAttribute('href'),
      kind: element.tagName.toLowerCase(),
    }))
  ));

  // The published source repository is the only approved external destination;
  // every other hub link must stay same-origin so the package works offline.
  const approvedExternal = new Set(['https://github.com/ayushtiwary-ops/kriseva-attest']);

  expect(targets.length).toBeGreaterThan(0);
  for (const { href } of targets) {
    expect(href).not.toBeNull();
    expect(href.trim()).not.toBe('');
    expect(href).not.toBe('#');
    expect(href).not.toMatch(/^javascript:/iu);
    if (approvedExternal.has(href)) continue;
    expect(new URL(href, LOCAL_ORIGIN).origin).toBe(LOCAL_ORIGIN);
  }

  for (const { href, kind } of targets) {
    if (approvedExternal.has(href)) continue;
    if (href.startsWith('#')) {
      await expect(page.locator(href)).toHaveCount(1);
      continue;
    }
    const probe = await page.evaluate(async (url) => {
      const response = await fetch(url, { cache: 'no-store' });
      return { ok: response.ok, status: response.status };
    }, href);
    expect(probe, `${kind} ${href}`).toEqual({ ok: true, status: 200 });
  }
});

test('hub has no serious accessibility issue or browser resource failure', async ({ page }) => {
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

  await openHub(page);
  await page.waitForLoadState('networkidle');
  const axe = await new AxeBuilder({ page }).analyze();

  expect(axe.violations.filter(({ impact }) => ['serious', 'critical'].includes(impact))).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(requestFailures).toEqual([]);
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.every((url) => url.startsWith(`${LOCAL_ORIGIN}/`))).toBe(true);
  expect(responses.length).toBe(requests.length);
  expect(responses.every(({ url, status }) => url.startsWith(`${LOCAL_ORIGIN}/`) && status === 200)).toBe(true);
});

test('skip navigation and every active action are keyboard-operable with 44px targets', async ({ page }) => {
  await openHub(page);
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to submission dossier' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#submission-dossier')).toBeFocused();

  const keyboardActions = [
    ['Launch interactive prototype', 'prototype/', '/prototype/', 2],
    ['Launch interactive prototype', 'prototype/', '/prototype/', 3],
    ['View wireframes', 'wireframes/', '/wireframes/', 4],
    ['Watch verified demo', 'video/KRISEVA_ATTEST_DEMO_90S.mp4', '/video/KRISEVA_ATTEST_DEMO_90S.mp4', 5],
    ['View verified pitch deck', 'deck/', '/deck/', 6],
    ['Read technical notes', 'technical-notes.html', '/technical-notes.html', 7],
  ];
  for (const [label, hrefAttribute, destination, tabCount] of keyboardActions) {
    await openHub(page);
    for (let index = 0; index < tabCount; index += 1) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => ({
      href: document.activeElement?.getAttribute('href'),
      label: document.activeElement?.textContent.trim(),
    }))).toEqual({ href: hrefAttribute, label });
    const downloads = [];
    page.once('download', (download) => downloads.push(download.suggestedFilename()));
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`${LOCAL_ORIGIN}${destination}`);
    expect(downloads).toEqual([]);
  }

  // The published repository link must be reachable by keyboard; activation is
  // not pressed because the suite runs without external network access.
  await openHub(page);
  for (let index = 0; index < 8; index += 1) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => ({
    href: document.activeElement?.getAttribute('href'),
    label: document.activeElement?.textContent.trim(),
  }))).toEqual({
    href: 'https://github.com/ayushtiwary-ops/kriseva-attest',
    label: 'View source repository',
  });

  await openHub(page);
  const targetSizes = await page.locator('a[href]').evaluateAll((links) => links.map((link) => {
    const box = link.getBoundingClientRect();
    return { label: link.textContent.trim(), width: box.width, height: box.height };
  }));
  expect(targetSizes.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);
});

test('hub typography meets body and supporting-copy floors and honors reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openHub(page);
  const audit = await page.evaluate(() => ({
    body: Number.parseFloat(getComputedStyle(document.body).fontSize),
    bodyCopy: [...document.querySelectorAll('.hero-summary, .visual-copy, .artifact-description, .boundary-copy')]
      .map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
    support: [...document.querySelectorAll('.classification, .eyebrow, .artifact-status, .evidence-reference, .step-number')]
      .map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
    scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    animated: [...document.querySelectorAll('*')]
      .filter((element) => {
        const style = getComputedStyle(element);
        const hasAnimation = style.animationName !== 'none'
          && style.animationDuration.split(',').some((duration) => Number.parseFloat(duration) > 0);
        const hasTransition = style.transitionDuration.split(',')
          .some((duration) => Number.parseFloat(duration) > 0);
        return hasAnimation || hasTransition;
      })
      .map((element) => element.className),
  }));

  expect(audit.body).toBeGreaterThanOrEqual(17);
  expect(audit.bodyCopy.length).toBeGreaterThan(0);
  expect(audit.bodyCopy.every((size) => size >= 17)).toBe(true);
  expect(audit.support.length).toBeGreaterThan(0);
  expect(audit.support.every((size) => size >= 14)).toBe(true);
  expect(audit.scrollBehavior).toBe('auto');
  expect(audit.animated).toEqual([]);
});

for (const width of [390, 768, 1440]) {
  test(`hub has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : width === 768 ? 1024 : 1000 });
    await openHub(page);
    const geometry = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      overflowing: [...document.querySelectorAll('main, section, article, figure')]
        .filter((element) => element.scrollWidth > element.clientWidth)
        .map((element) => `${element.tagName.toLowerCase()}#${element.id}.${element.className}`),
    }));
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.overflowing).toEqual([]);
  });

  test(`technical-notes page has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : width === 768 ? 1024 : 1000 });
    await installLocalRoute(page, projectRoot);
    const response = await page.goto(`${LOCAL_ORIGIN}/technical-notes.html`);
    expect(response?.status()).toBe(200);
    const geometry = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      overflowing: [...document.querySelectorAll('main, section, article')]
        .filter((element) => element.scrollWidth > element.clientWidth)
        .map((element) => `${element.tagName.toLowerCase()}#${element.id}.${element.className}`),
    }));
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.overflowing).toEqual([]);
  });
}

for (const width of [768, 1440]) {
  test(`conflict status remains an unbroken word at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 768 ? 1024 : 1000 });
    await openHub(page);
    const status = await page.locator('.field-card strong').evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return {
        lineBoxes: range.getClientRects().length,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      };
    });
    expect(status.lineBoxes).toBe(1);
    expect(status.scrollWidth).toBeLessThanOrEqual(status.clientWidth);
  });
}
