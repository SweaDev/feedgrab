import { expect, test } from 'bun:test';
import { detectFeeds } from '../../../src/detect/detect';
import { openFeed } from '../../../src/feed/unified-feed';
import { createProfile } from '../../../src/profile/profile';
import { fixtureHtml, loadFixture } from '../../helpers/dom';
import { domSnapshot } from '../../helpers/snapshot';

const NAMES = [
  'social-feed',
  'search-results',
  'product-grid',
  'blog-list',
  'two-feeds',
  'nested-feeds',
  'css-modules',
  'infinite-base',
  'paginated-1',
  'paginated-2',
  'placeholder',
];

for (const live of [false, true]) {
  test.each(NAMES)(`read-only invariant (live: ${live}): %s`, async (name) => {
    const doc = loadFixture(name);
    const before = domSnapshot(doc);
    const feeds = await detectFeeds(doc);
    const feed = openFeed(doc, createProfile({ url: doc.URL, feeds }), { live });
    const it = feed.iterate({ live: false });
    if (name === 'paginated-1')
      feed.ingest(fixtureHtml('paginated-2'), { url: 'https://fixture.test/p2' });
    for await (const item of it) item.text();
    await new Promise((r) => setTimeout(r, 0));
    feed.dispose();
    expect(domSnapshot(doc)).toBe(before);
  });
}
