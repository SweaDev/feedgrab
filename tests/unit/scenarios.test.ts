import { expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runScenarios } from '../scenarios/run';

test('scenarios run in Bun and their summaries are written for the E2E parity check', async () => {
  const summaries = await runScenarios();
  expect(summaries['detect-social']!.items.length).toBe(12);
  expect(summaries['ingest-paginated']!.items.length).toBe(15);
  expect(summaries['feed-two-feeds']!.descriptors.length).toBe(2);
  const dir = join(import.meta.dir, '..', '..', 'dist-test');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'bun-summaries.json'), JSON.stringify(summaries, null, 2));
});
