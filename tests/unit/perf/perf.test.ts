import { expect, test } from 'bun:test';
import { detectFeeds } from '../../../src/detect/detect';
import { openFeed, type UnifiedFeedImpl } from '../../../src/feed/unified-feed';
import { createProfile } from '../../../src/profile/profile';
import { appendFragment, loadFixture } from '../../helpers/dom';

const entry = (i: number) =>
  `<div class="entry"><h3><a href="/entry/${i}">Entry ${i}: field notes</a></h3><p>Generated entry number ${i} with a sentence of text for the feed.</p></div>`;

function percentile(values: number[], p: number): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] as number;
}

test('processBatch: median < 5 ms, p95 < 15 ms for batches of 5 added items', async () => {
  const doc = loadFixture('infinite-base');
  const profile = createProfile({ url: doc.URL, feeds: await detectFeeds(doc) });
  const feed = openFeed(doc, profile, { live: true }) as UnifiedFeedImpl;
  const stream = doc.getElementById('stream')!;
  await new Promise((r) => setTimeout(r, 0));
  for (let b = 0; b < 10; b++) {
    appendFragment(stream, Array.from({ length: 5 }, (_, k) => entry(6 + b * 5 + k)).join(''));
    await new Promise((r) => setTimeout(r, 0));
  }
  const stats = feed.observer!.stats;
  expect(feed.items().length).toBe(55);
  expect(stats.length).toBe(10);
  const median = percentile(stats, 50);
  const p95 = percentile(stats, 95);
  console.log(
    `[perf] processBatch ms: median=${median.toFixed(3)} p95=${p95.toFixed(3)} all=${stats.map((s) => s.toFixed(2)).join(',')}`,
  );
  feed.dispose();
  if (process.env.CI_SLOW) {
    if (median >= 5 || p95 >= 15) console.warn('[perf] over budget (soft assert: CI_SLOW is set)');
    return;
  }
  expect(median).toBeLessThan(5);
  expect(p95).toBeLessThan(15);
});
