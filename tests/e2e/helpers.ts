import { join } from 'node:path';
import type { Page } from '@playwright/test';

export const ROOT = join(import.meta.dirname, '..', '..');

/** Opens a fixture and injects the browser bundle (and optionally the scenarios). */
export async function openFixture(page: Page, name: string, scenarios = false): Promise<void> {
  await page.goto(`/${name}.html`);
  await page.addScriptTag({ path: join(ROOT, 'dist/browser.global.js') });
  if (scenarios) await page.addScriptTag({ path: join(ROOT, 'dist-test/scenarios.global.js') });
}
