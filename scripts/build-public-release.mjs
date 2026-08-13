import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanPublicFiles } from './verify-claims.mjs';

const defaultProjectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

export const PUBLIC_ROOT_FILES = Object.freeze([
  '.gitignore',
  'ARCHITECTURE.md',
  'ARTIFACT_INDEX.md',
  'CHECKSUMS.sha256',
  'CONTRIBUTING.md',
  'DEMO_WALKTHROUGH.md',
  'EVAL.md',
  'LICENSE',
  'PRIVACY.md',
  'README.md',
  'SECURITY.md',
  'index.html',
  'package-lock.json',
  'package.json',
  'playwright.config.js',
  'technical-notes.html',
]);

export const PUBLIC_DIRECTORIES = Object.freeze([
  'artifacts',
  'assets',
  'data',
  'deck',
  'prototype',
  'scripts',
  'src',
  'styles',
  'tests',
  'video',
  'wireframes',
]);

export const PUBLIC_DOC_FILES = Object.freeze([
  'docs/CLAIMS_REGISTER.md',
  'docs/QA_REPORT.md',
]);

function isReleaseFile(path) {
  const name = basename(path);
  return !name.startsWith('.')
    && !name.endsWith('.tmp')
    && !name.endsWith('.log')
    && !name.startsWith('~$')
    && !name.startsWith('.~lock.');
}

async function collectFiles(root, directory) {
  const absoluteDirectory = resolve(root, directory);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = `${directory}/${entry.name}`;
    if (!isReleaseFile(relativePath)) continue;
    if (entry.isSymbolicLink()) throw new Error(`Public release rejects symbolic links: ${relativePath}`);
    if (entry.isDirectory()) files.push(...await collectFiles(root, relativePath));
    if (entry.isFile()) files.push(relativePath);
  }
  return files;
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

function assertContained(root, target, label) {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  if (resolvedTarget === resolvedRoot || !resolvedTarget.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error(`${label} must be a contained path: ${resolvedTarget}`);
  }
}

export async function buildPublicRelease({
  sourceRoot = defaultProjectRoot,
  destination,
  sourceRevision = 'UNCOMMITTED_LOCAL_RELEASE',
}) {
  if (!destination) throw new Error('A public-release destination is required.');
  const resolvedSource = resolve(sourceRoot);
  const resolvedDestination = resolve(destination);
  if (resolvedDestination === resolvedSource) throw new Error('Public release cannot overwrite the source repository.');

  await mkdir(resolvedDestination, { recursive: true });
  const existing = await readdir(resolvedDestination);
  if (existing.length > 0) throw new Error(`Public-release destination must be empty: ${resolvedDestination}`);

  const files = [...PUBLIC_ROOT_FILES, ...PUBLIC_DOC_FILES];
  for (const directory of PUBLIC_DIRECTORIES) files.push(...await collectFiles(resolvedSource, directory));
  const uniqueFiles = [...new Set(files)].sort();

  const receiptFiles = [];
  for (const path of uniqueFiles) {
    const source = resolve(resolvedSource, path);
    assertContained(resolvedSource, source, 'Public source');
    const sourceStat = await stat(source);
    if (!sourceStat.isFile()) throw new Error(`Public-release path is not a file: ${path}`);
    const target = resolve(resolvedDestination, path);
    assertContained(resolvedDestination, target, 'Public target');
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
    receiptFiles.push({ path, sha256: await sha256(target), bytes: sourceStat.size });
  }

  // Static-host marker: GitHub Pages must serve the tree verbatim instead of
  // running it through Jekyll, which drops or rewrites some static paths.
  await writeFile(resolve(resolvedDestination, '.nojekyll'), '');
  receiptFiles.push({ path: '.nojekyll', sha256: await sha256(resolve(resolvedDestination, '.nojekyll')), bytes: 0 });

  const findings = await scanPublicFiles(resolvedDestination);
  if (findings.length > 0) {
    throw new Error(`Public-release claim/privacy scan failed: ${JSON.stringify(findings)}`);
  }

  const receipt = {
    schemaVersion: 1,
    product: 'KRISEVA ATTEST',
    releaseState: 'LOCAL_RELEASE_CANDIDATE',
    sourceRevision,
    publicationPerformed: false,
    files: receiptFiles,
  };
  await writeFile(
    resolve(resolvedDestination, 'PUBLIC_RELEASE_MANIFEST.json'),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
  return receipt;
}

async function runCli() {
  const destination = process.argv[2];
  const sourceRevision = process.argv[3] ?? 'UNCOMMITTED_LOCAL_RELEASE';
  const receipt = await buildPublicRelease({ destination, sourceRevision });
  process.stdout.write(`Built GitHub-ready public release with ${receipt.files.length} files at ${resolve(destination)}\n`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) await runCli();
