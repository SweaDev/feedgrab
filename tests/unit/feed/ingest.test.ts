import { expect, test } from 'bun:test';
import { detectFeeds } from '../../../src/detect/detect';
import { FeedDetectorError } from '../../../src/errors';
import { openFeed } from '../../../src/feed/unified-feed';
import { createProfile } from '../../../src/profile/profile';
import { parseHtml } from '../../../src/server';
import type { FeedItem } from '../../../src/types';
import { fixtureHtml, loadFixture } from '../../helpers/dom';

const PAGE2 = 'https://fixture.test/paginated-2';

async function page1Feed() {
  const doc = loadFixture('paginated-1');
  const profile = createProfile({ url: doc.URL, feeds: await detectFeeds(doc) });
  return openFeed(doc, profile);
}

test('ingesting page 2 HTML → 15 unique items, page 2 after page 1, sourceUrl set', async () => {
  const feed = await page1Feed();
  const added: string[] = [];
  feed.on('item:added', (i) => added.push(i.id));
  const fresh = feed.ingest(fixtureHtml('paginated-2'), { url: PAGE2 });
  expect(fresh.length).toBe(7);
  expect(added).toEqual(fresh.map((i) => i.id));
  const items = feed.items();
  expect(items.length).toBe(15);
  expect(items.slice(8)).toEqual(fresh);
  expect(fresh.every((i) => i.sourceUrl === PAGE2)).toBe(true);
  expect(items.slice(0, 8).every((i) => i.sourceUrl === undefined)).toBe(true);
  const hrefs = items.map((i) => i.element.querySelector('a')!.getAttribute('href'));
  expect(hrefs).toEqual(Array.from({ length: 15 }, (_, i) => `/item/${i + 1}`));
});

test('ingesting a Document works too', async () => {
  const feed = await page1Feed();
  const fresh = feed.ingest(parseHtml(fixtureHtml('paginated-2'), PAGE2));
  expect(fresh.length).toBe(7);
  expect(fresh[0]!.sourceUrl).toBeUndefined();
  expect(feed.ingest(fixtureHtml('paginated-2')).length).toBe(0);
});

test('a live:false iterator yields items ingested before it drains', async () => {
  const feed = await page1Feed();
  const seen: FeedItem[] = [];
  const it = feed.iterate();
  seen.push((await it.next()).value);
  feed.ingest(fixtureHtml('paginated-2'), { url: PAGE2 });
  for await (const item of it) seen.push(item);
  expect(seen.length).toBe(15);
});

test('ingest after dispose throws DISPOSED', async () => {
  const feed = await page1Feed();
  feed.dispose();
  try {
    feed.ingest(fixtureHtml('paginated-2'));
    throw new Error('expected throw');
  } catch (e) {
    expect((e as FeedDetectorError).code).toBe('DISPOSED');
    expect(e).toBeInstanceOf(FeedDetectorError);
  }
});
