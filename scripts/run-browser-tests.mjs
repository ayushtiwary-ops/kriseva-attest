import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePlaywrightCli } from './resolve-playwright-cli.mjs';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
let cliPath;
try {
  cliPath = resolvePlaywrightCli(projectRoot);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}

const result = spawnSync(process.execPath, [cliPath, 'test', ...process.argv.slice(2)], {
  cwd: projectRoot,
  env: process.env,
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
