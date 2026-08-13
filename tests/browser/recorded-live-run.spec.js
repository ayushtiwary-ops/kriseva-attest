import { expect, test } from 'playwright/test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installLocalRoute, LOCAL_ORIGIN } from '../../scripts/local-route.mjs';

const projectRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));

// The 'trace' capture preset drives the app straight to the agent-trace
// screen with evidence review already run, matching how
// scripts/capture-artifacts.mjs captures the same screen.
async function openTraceScreen(page) {
  await installLocalRoute(page, projectRoot);
  await page.goto(`${LOCAL_ORIGIN}/prototype/?capture=trace`);
  await page.locator('#prototype-root[data-capture-ready="true"][data-capture-state="trace"]').waitFor();
}

test('agent-trace screen renders the recorded live run panel with model id, digest, and boundary line', async ({ page }) => {
  await openTraceScreen(page);

  const panel = page.locator('.recorded-run');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'A real model call, inside the same boundary' })).toBeVisible();
  await expect(panel.getByText('Recorded execution of a live model run. Replay is deterministic; the model proposed, humans decided.', { exact: true })).toBeVisible();

  await expect(panel.getByText('claude-haiku-4-5-20251001', { exact: false })).toBeVisible();
  await expect(panel.locator('#envelope-digest')).toHaveText(/^[0-9a-f]{16}$/u);
  await expect(panel.getByText(/Instruction fingerprint/i)).toBeVisible();
  await expect(panel.locator('#replay-status')).toHaveText('Replay verified: the recomputed digest matches the committed record.');
});

test('recorded live run panel shows per-field candidates with document and location, and abstentions with a reason', async ({ page }) => {
  await openTraceScreen(page);
  const panel = page.locator('.recorded-run');

  await expect(panel.getByRole('heading', { name: 'Closing NAV', exact: true })).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Committed capital', exact: true })).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Investor complaints closed', exact: true })).toBeVisible();

  const closingNavField = panel.locator('.recorded-run-field', { has: page.getByRole('heading', { name: 'Closing NAV', exact: true }) });
  await expect(closingNavField.getByText('USD 12,400,000', { exact: true })).toBeVisible();
  await expect(closingNavField.getByText(/Document: administrator-statement\. Location: L\d+\./u)).toBeVisible();

  const investorComplaintsField = panel.locator('.recorded-run-field', { has: page.getByRole('heading', { name: 'Investor complaints closed', exact: true }) });
  await expect(investorComplaintsField.getByText('0 candidates · 4 abstentions', { exact: true })).toBeVisible();
  await expect(investorComplaintsField.locator('.recorded-run-abstentions li').first()).toContainText('MODEL ABSTAINED');
});

test('recorded live run panel shows deterministic validator outcomes including the planted committed-capital conflict', async ({ page }) => {
  await openTraceScreen(page);
  const panel = page.locator('.recorded-run');
  const validators = panel.locator('.recorded-run-validators');

  await expect(validators.getByRole('heading', { name: 'Deterministic validator outcomes' })).toBeVisible();
  await expect(validators.getByText('FLAG', { exact: true }).first()).toBeVisible();
  await expect(validators.getByText('PASS', { exact: true }).first()).toBeVisible();
  await expect(validators.getByText(/Candidates for Committed capital disagree/u)).toBeVisible();
  await expect(validators.getByText(/duplicate document fingerprint/iu)).toBeVisible();
  await expect(validators.getByText(/dated more than 30 days before the quarter end/u)).toBeVisible();
});
