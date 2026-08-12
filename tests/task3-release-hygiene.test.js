import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const projectRoot = resolve(import.meta.dirname, '..');

async function isolatedTempRoot(t, prefix) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function runTestFile(relativePath, temporaryRoot, environment = {}) {
  const childEnvironment = { ...process.env };
  delete childEnvironment.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, [relativePath], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: {
      ...childEnvironment,
      TMPDIR: temporaryRoot,
      ...environment,
    },
  });
}

test('PDF validation remains green without optional Poppler commands', async (t) => {
  const temporaryRoot = await isolatedTempRoot(t, 'attest-portability-');
  const result = runTestFile('tests/deterministic-pdf.test.js', temporaryRoot, { PATH: '' });
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 0, output);
  assert.match(output, /pdfinfo was not found on PATH; internal PDF validation still ran/iu);
  assert.match(output, /pdftoppm was not found on PATH; internal PDF validation still ran/iu);
  assert.match(output, /skipped 2/iu);
});

test('PDF test removes its temporary artifacts after success', async (t) => {
  const temporaryRoot = await isolatedTempRoot(t, 'attest-pdf-hygiene-');
  const result = runTestFile('tests/deterministic-pdf.test.js', temporaryRoot);
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 0, output);
  assert.deepEqual(await readdir(temporaryRoot), []);
});

test('local-route test removes its temporary artifacts after success', async (t) => {
  const temporaryRoot = await isolatedTempRoot(t, 'attest-route-hygiene-');
  const result = runTestFile('tests/local-route.test.js', temporaryRoot);
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 0, output);
  assert.deepEqual(await readdir(temporaryRoot), []);
});
