import { expect, test } from 'playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installLocalRoute, LOCAL_ORIGIN } from '../../scripts/local-route.mjs';

const projectRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const routeNames = {
  dashboard: 'Case dashboard',
  'source-workspace': 'Source-to-field workspace',
  'conflict-queue': 'Conflict queue',
  'agent-trace': 'Agent trace',
  'review-signoff': 'Review and sign-off',
  'evidence-receipt': 'Evidence receipt'
};

async function openPrototype(page, hash = '') {
  await installLocalRoute(page, projectRoot);
  const response = await page.goto(`${LOCAL_ORIGIN}/prototype/${hash}`);
  await expect(page.locator('#prototype-root')).toHaveAttribute('aria-busy', 'false');
  return response;
}

async function runReview(page) {
  await page.getByRole('button', { name: 'Run evidence review' }).click();
  await expect(page).toHaveURL(/#source-workspace$/u);
}

async function recordConflictDecision(page) {
  await page.getByRole('link', { name: /1 conflict/i }).click();
  await page.getByLabel('Accept selected source').check();
  await page.getByLabel('Select source').selectOption('admin-committed');
  await page.getByLabel('Reviewer').fill('Demo Reviewer');
  await page.getByLabel('Decision reason').fill('Board schedule is older than the administrator statement.');
  await page.getByRole('button', { name: 'Record human decision' }).click();
}

async function openConflictForm(page) {
  await openPrototype(page);
  await runReview(page);
  await page.getByRole('link', { name: /1 conflict/i }).click();
  await expect(page.getByRole('heading', { name: 'Record the conflict decision' })).toBeVisible();
}

test('reviewer can inspect a conflict, decide with reason, and reach receipt', async ({ page }) => {
  const response = await openPrototype(page);
  expect(response?.status()).toBe(200);

  await runReview(page);
  await page.getByRole('link', { name: /1 conflict/i }).click();
  await expect(page.getByText('Two sources disagree')).toBeVisible();
  await page.getByLabel('Accept selected source').check();
  await page.getByLabel('Select source').selectOption('admin-committed');
  await page.getByLabel('Reviewer').fill('Demo Reviewer');
  await page.getByLabel('Decision reason').fill('Board schedule is older than the administrator statement.');
  await page.getByRole('button', { name: 'Record human decision' }).click();
  await page.getByRole('link', { name: 'Evidence receipt' }).click();
  await expect(page.getByText('Human decision recorded')).toBeVisible();
});

test('case begins with exactly three pending fields and protected routes redirect', async ({ page }) => {
  await openPrototype(page, '#evidence-receipt');
  await expect(page).toHaveURL(/#dashboard$/u);
  await expect(page.locator('#announcement')).toHaveText('Run evidence review first.');
  await expect(page.locator('.field-index .status-pending')).toHaveCount(3);
  await expect(page.locator('.field-index .status-supported')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Case dashboard' })).toBeVisible();
});

test('evidence review produces exactly one supported, conflicting, and unsupported field', async ({ page }) => {
  await openPrototype(page);
  await runReview(page);
  await expect(page.locator('.field-index .status-supported')).toHaveCount(1);
  await expect(page.locator('.field-index .status-conflicting')).toHaveCount(1);
  await expect(page.locator('.field-index .status-unsupported')).toHaveCount(1);
  await expect(page.locator('.source-preview strong')).toHaveCount(2);
  await expect(page.locator('.source-preview strong').filter({ hasText: 'SYNTHETIC DEMO DATA' })).toHaveCount(2);
});

test('conflict form has no defaults and focuses each missing control without mutation', async ({ page }) => {
  await openPrototype(page);
  await runReview(page);
  await page.getByRole('link', { name: /1 conflict/i }).click();

  const submit = page.getByRole('button', { name: 'Record human decision' });
  await expect(submit).toBeEnabled();
  await expect(page.locator('input[name="action"]:checked')).toHaveCount(0);
  await expect(page.getByLabel('Select source')).toHaveValue('');

  await submit.click();
  await expect(page.getByLabel('Accept selected source')).toBeFocused();
  await expect(page.getByText('Choose a human decision action.')).toBeVisible();
  await page.locator('.screen-navigation a[href="#review-signoff"]').click();
  await expect(page.getByRole('heading', { name: 'Evidence-review gate blocked' })).toBeVisible();
  await page.locator('.screen-navigation a[href="#conflict-queue"]').click();

  await page.getByLabel('Accept selected source').check();
  await submit.click();
  await expect(page.getByLabel('Select source')).toBeFocused();

  await page.getByLabel('Select source').selectOption('admin-committed');
  await submit.click();
  await expect(page.getByLabel('Reviewer')).toBeFocused();

  await page.getByLabel('Reviewer').fill('Demo Reviewer');
  await submit.click();
  await expect(page.getByLabel('Decision reason')).toBeFocused();

  await page.getByLabel('Decision reason').fill('Board schedule is older than the administrator statement.');
  await submit.click();
  await expect(page.locator('#announcement')).toHaveText('Decision saved. Conflict gate cleared.');
  await page.getByRole('link', { name: 'Review and sign-off' }).click();
  await expect(page.getByRole('heading', { name: 'Conflict gate cleared' })).toBeVisible();
  await expect(page.getByText(/unsupported field remains unresolved/i)).toBeVisible();
});

test('filled review controls retain readable foreground and background contrast', async ({ page }) => {
  await openConflictForm(page);
  await page.getByLabel('Accept selected source').check();
  await page.getByLabel('Select source').selectOption('admin-committed');
  await page.getByLabel('Reviewer').fill('Demo Reviewer');
  await page.getByLabel('Decision reason').fill('Readable decision text must remain visible.');

  const contrast = await page.locator('#candidate-select, #reviewer, #decision-reason').evaluateAll((controls) => {
    const rgb = (value) => value.match(/[\d.]+/gu).slice(0, 3).map(Number);
    const luminance = (value) => {
      const channels = rgb(value).map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
    };
    return controls.map((control) => {
      const styles = getComputedStyle(control);
      const foreground = luminance(styles.color);
      const background = luminance(styles.backgroundColor);
      return {
        id: control.id,
        color: styles.color,
        backgroundColor: styles.backgroundColor,
        ratio: (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
      };
    });
  });

  expect(contrast.map(({ id }) => id)).toEqual(['candidate-select', 'reviewer', 'decision-reason']);
  expect(contrast.every(({ ratio }) => ratio >= 4.5)).toBe(true);
});

for (const action of ['Defer pending evidence', 'Reject proposed field']) {
  test(`${action} clears stale source attribution in form and receipt`, async ({ page }) => {
    await openConflictForm(page);
    await page.getByLabel('Accept selected source').check();
    await page.getByLabel('Select source').selectOption('admin-committed');
    await page.getByLabel(action).check();
    await expect(page.getByLabel('Select source')).toBeDisabled();
    await expect(page.getByLabel('Select source')).toHaveValue('');
    await page.getByLabel('Reviewer').fill('Demo Reviewer');
    await page.getByLabel('Decision reason').fill('More evidence is required before choosing a source.');
    await page.getByRole('button', { name: 'Record human decision' }).click();
    await page.getByRole('link', { name: 'Evidence receipt' }).click();
    await expect(page.getByRole('heading', { name: 'Human decision recorded' })).toBeVisible();
    await expect(page.getByText('Selected source', { exact: true })).toHaveCount(0);
    await expect(page.getByText('admin-committed', { exact: true })).toHaveCount(0);
  });
}

for (const action of ['Accept selected source', 'Correct with selected source']) {
  test(`${action} retains explicit source attribution`, async ({ page }) => {
    await openConflictForm(page);
    await page.getByLabel(action).check();
    await page.getByLabel('Select source').selectOption('admin-committed');
    await page.getByLabel('Reviewer').fill('Demo Reviewer');
    await page.getByLabel('Decision reason').fill('The selected source governs this synthetic decision.');
    await page.getByRole('button', { name: 'Record human decision' }).click();
    await page.getByRole('link', { name: 'Evidence receipt' }).click();
    await expect(page.getByText('Selected source', { exact: true })).toBeVisible();
    await expect(page.getByText('admin-committed', { exact: true })).toBeVisible();
  });
}

test('reset clears disabled source and action state', async ({ page }) => {
  await openConflictForm(page);
  await page.getByLabel('Accept selected source').check();
  await page.getByLabel('Select source').selectOption('admin-committed');
  await page.getByLabel('Defer pending evidence').check();
  await expect(page.getByLabel('Select source')).toBeDisabled();
  await page.getByRole('button', { name: 'Reset demo' }).first().click();
  await runReview(page);
  await page.getByRole('link', { name: /1 conflict/i }).click();
  await expect(page.getByLabel('Select source')).toBeEnabled();
  await expect(page.getByLabel('Select source')).toHaveValue('');
  await expect(page.locator('input[name="action"]:checked')).toHaveCount(0);
});

test('trace discloses deterministic behavior and abstains when evidence is absent', async ({ page }) => {
  await openPrototype(page);
  await runReview(page);
  await page.getByRole('link', { name: 'Agent trace' }).click();
  await expect(page.getByText('RECORDED DETERMINISTIC PROTOTYPE TRACE · NO LIVE MODEL CALL', { exact: true })).toBeVisible();
  await expect(page.getByText('ABSTAIN', { exact: true })).toBeVisible();
  await expect(page.getByText(/No candidate evidence is present/)).toBeVisible();
});

test('receipt retains both candidates, reason, fingerprints, unsupported item, and decision marker', async ({ page }) => {
  await openPrototype(page);
  await runReview(page);
  await recordConflictDecision(page);
  await page.getByRole('link', { name: 'Evidence receipt' }).click();

  const receipt = page.locator('.active-screen');
  await expect(receipt.getByRole('heading', { name: 'Human decision recorded' })).toBeVisible();
  await expect(receipt.getByText('INR 50,000,000', { exact: true })).toBeVisible();
  await expect(receipt.getByText('INR 48,000,000', { exact: true })).toBeVisible();
  await expect(receipt.getByText('Board schedule is older than the administrator statement.', { exact: true })).toBeVisible();
  await expect(receipt.getByText('Recorded at', { exact: true })).toBeVisible();
  await expect(receipt.getByText('2026-08-12T12:00:00+05:30', { exact: true })).toBeVisible();
  for (const fingerprint of [
    'synthetic:admin-statement:9b2d7f',
    'synthetic:ledger:38a4c1',
    'synthetic:board-schedule:4f71aa'
  ]) {
    await expect(receipt.getByText(fingerprint, { exact: true })).toBeVisible();
  }
  await expect(receipt.getByRole('heading', { name: 'Investor complaints closed' })).toBeVisible();
  await expect(receipt.getByText(/No candidate source. No value synthesized./)).toBeVisible();
});

test('review ledger exposes the fixed synthetic decision timestamp', async ({ page }) => {
  await openPrototype(page);
  await runReview(page);
  await recordConflictDecision(page);
  await page.getByRole('link', { name: 'Review and sign-off' }).click();
  const ledger = page.locator('.decision-ledger');
  await expect(ledger.getByText('Recorded at', { exact: true })).toBeVisible();
  await expect(ledger.getByText('2026-08-12T12:00:00+05:30', { exact: true })).toBeVisible();
});

test('reset returns to dashboard, clears the decision, announces, and focuses review action', async ({ page }) => {
  await openPrototype(page);
  await runReview(page);
  await recordConflictDecision(page);
  await page.getByRole('link', { name: 'Evidence receipt' }).click();
  await page.getByRole('button', { name: 'Reset demo' }).last().click();

  await expect(page).toHaveURL(/#dashboard$/u);
  await expect(page.locator('.field-index .status-pending')).toHaveCount(3);
  await expect(page.locator('#announcement')).toHaveText('Demo reset. Three fields are pending evidence review.');
  await expect(page.getByRole('button', { name: 'Run evidence review' })).toBeFocused();
  await page.getByRole('link', { name: 'Evidence receipt' }).click();
  await expect(page).toHaveURL(/#dashboard$/u);
});

test('skip link, hash navigation, and browser history preserve keyboard focus', async ({ page }) => {
  await openPrototype(page);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to active screen' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Case dashboard' })).toBeFocused();

  await runReview(page);
  await expect(page.getByRole('heading', { name: 'Source-to-field workspace' })).toBeFocused();
  await page.locator('.screen-navigation a[href="#conflict-queue"]').click();
  await expect(page.getByRole('heading', { name: 'Conflict queue' })).toBeFocused();
  await page.locator('.screen-navigation a[href="#agent-trace"]').click();
  await expect(page.getByRole('heading', { name: 'Agent trace' })).toBeFocused();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Conflict queue' })).toBeFocused();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Agent trace' })).toBeFocused();
});

test('all six reviewed screens have no serious or critical accessibility violations', async ({ page }) => {
  await openPrototype(page);
  await runReview(page);
  for (const route of ['dashboard', 'source-workspace', 'conflict-queue', 'agent-trace', 'review-signoff', 'evidence-receipt']) {
    await page.locator(`.screen-navigation a[href="#${route}"]`).click();
    await expect(page.getByRole('heading', { name: routeNames[route] })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter(({ impact }) => ['serious', 'critical'].includes(impact))).toEqual([]);
  }
});

for (const width of [390, 768, 1440]) {
  test(`prototype preserves DOM order, layout contract, and width at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await openPrototype(page);
    await runReview(page);
    await recordConflictDecision(page);
    await page.getByRole('link', { name: 'Evidence receipt' }).click();
    await expect(page.getByRole('heading', { name: 'Evidence receipt' })).toBeVisible();

    const geometry = await page.evaluate(() => {
      const evidence = document.querySelector('.evidence-index').getBoundingClientRect();
      const main = document.querySelector('.active-screen').getBoundingClientRect();
      const review = document.querySelector('.review-drawer').getBoundingClientRect();
      const children = [...document.querySelector('.workspace').children].map(({ className }) => className);
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        children,
        evidence: { x: evidence.x, y: evidence.y, bottom: evidence.bottom },
        main: { x: main.x, y: main.y, bottom: main.bottom },
        review: { x: review.x, y: review.y }
      };
    });

    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.children).toEqual(['evidence-index', 'active-screen', 'review-drawer']);
    if (width === 1440) {
      expect(geometry.evidence.x).toBeLessThan(geometry.main.x);
      expect(geometry.main.x).toBeLessThan(geometry.review.x);
      expect(geometry.evidence.y).toBe(geometry.main.y);
      expect(geometry.main.y).toBe(geometry.review.y);
    } else if (width === 768) {
      expect(geometry.evidence.x).toBeLessThan(geometry.main.x);
      expect(geometry.evidence.y).toBe(geometry.main.y);
      expect(geometry.review.y).toBeGreaterThanOrEqual(Math.max(geometry.evidence.bottom, geometry.main.bottom) - 1);
    } else {
      expect(geometry.main.y).toBeGreaterThanOrEqual(geometry.evidence.bottom - 1);
      expect(geometry.review.y).toBeGreaterThanOrEqual(geometry.main.bottom - 1);
    }
  });
}

test('type and interactive controls meet release floors', async ({ page }) => {
  await openPrototype(page);
  await runReview(page);
  await page.locator('.screen-navigation a[href="#conflict-queue"]').click();
  await expect(page.getByRole('heading', { name: 'Conflict queue' })).toBeVisible();
  const floors = await page.evaluate(() => ({
    body: Number.parseFloat(getComputedStyle(document.body).fontSize),
    support: [...document.querySelectorAll('.kicker, .section-label, .status, .candidate-topline, .prototype-boundary')]
      .map((node) => Number.parseFloat(getComputedStyle(node).fontSize)),
    controls: [...document.querySelectorAll('button, select, textarea, form > input, fieldset label')]
      .map((node) => node.getBoundingClientRect().height)
  }));
  expect(floors.body).toBeGreaterThanOrEqual(17);
  expect(floors.support.every((size) => size >= 14)).toBe(true);
  expect(floors.controls.every((height) => height >= 44)).toBe(true);
});

test('reduced-motion mode removes meaningful animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openPrototype(page);
  const durations = await page.locator('.active-screen > *').evaluateAll((nodes) => nodes.map((node) => {
    const toMilliseconds = (value) => value.endsWith('ms')
      ? Number.parseFloat(value)
      : Number.parseFloat(value) * 1000;
    return {
      animation: toMilliseconds(getComputedStyle(node).animationDuration),
      transition: toMilliseconds(getComputedStyle(node).transitionDuration)
    };
  }));
  expect(durations.every(({ animation, transition }) => animation <= 0.001 && transition <= 0.001)).toBe(true);
});

test('prototype loads only local resources without console failures', async ({ page }) => {
  const consoleErrors = [];
  const requests = [];
  const failed = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('request', (request) => requests.push(request.url()));
  page.on('requestfailed', (request) => failed.push(request.url()));
  await openPrototype(page);
  await page.waitForLoadState('networkidle');
  expect(consoleErrors).toEqual([]);
  expect(failed).toEqual([]);
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.every((url) => url.startsWith(`${LOCAL_ORIGIN}/`))).toBe(true);
});
