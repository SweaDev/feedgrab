import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Fails fast when the bundles or Bun summaries the specs need are missing. */
export default function globalSetup(): void {
  const root = join(import.meta.dirname, '..', '..');
  for (const f of [
    'dist/browser.global.js',
    'dist-test/scenarios.global.js',
    'dist-test/bun-summaries.json',
  ]) {
    if (!existsSync(join(root, f))) {
      throw new Error(
        `${f} is missing: run "bun run test:e2e" (builds bundles and Bun summaries first)`,
      );
    }
  }
}
