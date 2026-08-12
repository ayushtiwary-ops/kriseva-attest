import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function resolvePlaywrightCli(projectRoot) {
  const localCli = resolve(projectRoot, 'node_modules', 'playwright', 'cli.js');
  if (!existsSync(localCli)) {
    throw new Error('Playwright is unavailable. Run npm install to use the declared local dependency.');
  }
  return localCli;
}
