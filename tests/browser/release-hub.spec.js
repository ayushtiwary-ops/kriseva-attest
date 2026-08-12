import { expect, test } from 'playwright/test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installLocalRoute, LOCAL_ORIGIN } from '../../scripts/local-route.mjs';

const projectRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));

test('verified video, deck, and published GitHub link are real hub controls', async ({ page }) => {
  await installLocalRoute(page, projectRoot);
  await page.goto(`${LOCAL_ORIGIN}/`);

  const contracts = [
    ['video', 'active-artifact', 'Watch verified demo', 'video/KRISEVA_ATTEST_DEMO_90S.mp4'],
    ['deck', 'active-artifact', 'View verified pitch deck', 'deck/'],
  ];
  for (const [artifact, stateClass, label, href] of contracts) {
    const card = page.locator(`[data-artifact="${artifact}"]`);
    await expect(card).toHaveClass(new RegExp(`\\b${stateClass}\\b`, 'u'));
    const link = card.getByRole('link', { name: label });
    await expect(link).toHaveAttribute('href', href);
    const response = await page.evaluate(async (url) => {
      const result = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      return { ok: result.ok, status: result.status };
    }, href);
    expect(response).toEqual({ ok: true, status: 200 });
  }

  const github = page.locator('[data-artifact="github"]');
  await expect(github).toHaveClass(/\bactive-artifact\b/u);
  const githubLink = github.getByRole('link', { name: 'View source repository' });
  await expect(githubLink).toHaveAttribute('href', 'https://github.com/ayushtiwary-ops/kriseva-attest');
  await expect(githubLink).toHaveAttribute('rel', 'noopener');
  await expect(github.getByText('PUBLISHED / PUBLIC', { exact: true })).toBeVisible();
});

test('deck page exposes the inspected montage and both real release files', async ({ page }) => {
  await installLocalRoute(page, projectRoot);
  const response = await page.goto(`${LOCAL_ORIGIN}/deck/`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Evidence before assertion.' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Montage of the ten-slide KRISEVA ATTEST pitch deck' })).toBeVisible();

  const files = [
    ['Open PDF', 'KRISEVA_ATTEST_GIFT_2026.pdf'],
    ['Download editable PPTX', 'KRISEVA_ATTEST_GIFT_2026.pptx'],
  ];
  for (const [label, href] of files) {
    await expect(page.getByRole('link', { name: label })).toHaveAttribute('href', href);
    const probe = await page.evaluate(async (url) => {
      const result = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      return { ok: result.ok, status: result.status, type: result.headers.get('content-type') };
    }, href);
    expect(probe.ok).toBe(true);
    expect(probe.status).toBe(200);
  }
});
