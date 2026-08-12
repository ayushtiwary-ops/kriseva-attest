#!/usr/bin/env node
// Regenerate CHECKSUMS.sha256 for the five governed release artifacts.
// The path order is a release contract asserted by tests/release-package.test.js.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GOVERNED_ARTIFACTS = [
  'deck/KRISEVA_ATTEST_GIFT_2026.pptx',
  'deck/KRISEVA_ATTEST_GIFT_2026.pdf',
  'video/KRISEVA_ATTEST_DEMO_90S.mp4',
  'artifacts/KRISEVA_ATTEST_WIREFRAMES.pdf',
  'data/synthetic-case.json',
];

export async function buildChecksums(sourceRoot) {
  const lines = [];
  for (const relativePath of GOVERNED_ARTIFACTS) {
    const content = await readFile(resolve(sourceRoot, relativePath));
    const digest = createHash('sha256').update(content).digest('hex');
    lines.push(`${digest}  ${relativePath}`);
  }
  return `${lines.join('\n')}\n`;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';

if (invokedPath === fileURLToPath(import.meta.url)) {
  const sourceRoot = resolve(import.meta.dirname, '..');
  const output = resolve(sourceRoot, 'CHECKSUMS.sha256');
  const content = await buildChecksums(sourceRoot);
  await writeFile(output, content, 'utf8');
  process.stdout.write(content);
}
