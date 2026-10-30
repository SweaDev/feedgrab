import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { type JsonSummary, SCENARIOS } from '../scenarios/index';
import { openFixture, ROOT } from './helpers';

const bun: Record<string, JsonSummary> = JSON.parse(
  readFileSync(join(ROOT, 'dist-test/bun-summaries.json'), 'utf8'),
);

for (const s of SCENARIOS) {
  test(`parity: ${s.name}`, async ({ page }) => {
    await openFixture(page, s.fixture, true);
    const summary = await page.evaluate(async (name) => {
      const g = globalThis as unknown as {
        __FD_SCENARIOS__: typeof SCENARIOS;
        FeedDetector: Parameters<(typeof SCENARIOS)[number]['run']>[0];
      };
      const scenario = g.__FD_SCENARIOS__.find((x) => x.name === name)!;
      return scenario.run(g.FeedDetector, document, {
        fetchFixture: (n) => fetch(`/${n}.html`).then((r) => r.text()),
      });
    }, s.name);
    expect(summary).toEqual(bun[s.name]);
  });
}
