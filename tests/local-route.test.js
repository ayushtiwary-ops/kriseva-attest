import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readLocalAsset, resolveLocalAsset } from '../scripts/local-route.mjs';

test('local route maps directory requests to an index beneath the repository root', () => {
  const asset = resolveLocalAsset('/work/attest', 'http://attest.local/wireframes/');

  assert.equal(asset.filePath, '/work/attest/wireframes/index.html');
  assert.equal(asset.contentType, 'text/html; charset=utf-8');
});

test('local route rejects encoded traversal before resolving a file', () => {
  assert.throws(
    () => resolveLocalAsset('/work/attest', 'http://attest.local/wireframes/%2e%2e/%2e%2e/private.txt'),
    /path traversal/i,
  );
});

test('local route rejects a symlink that resolves outside the repository root', async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'attest-route-'));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const publicRoot = join(temporaryRoot, 'public');
  const outsideFile = join(temporaryRoot, 'outside.txt');
  await mkdir(publicRoot);
  await writeFile(outsideFile, 'outside evidence');
  await symlink(outsideFile, join(publicRoot, 'escape.txt'));

  await assert.rejects(
    () => readLocalAsset(publicRoot, 'http://attest.local/escape.txt'),
    /symlink|path traversal/i,
  );
});
