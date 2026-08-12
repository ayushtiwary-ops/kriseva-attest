import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolvePlaywrightCli } from '../scripts/resolve-playwright-cli.mjs';

test('Playwright CLI resolution accepts only the declared checkout dependency', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'attest-playwright-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  assert.throws(
    () => resolvePlaywrightCli(root),
    /Playwright is unavailable\. Run npm install to use the declared local dependency\./u,
  );

  const cli = join(root, 'node_modules', 'playwright', 'cli.js');
  await mkdir(join(root, 'node_modules', 'playwright'), { recursive: true });
  await writeFile(cli, '#!/usr/bin/env node\n');
  assert.equal(resolvePlaywrightCli(root), cli);
});
