import { expect, test } from 'bun:test';
import { detectFeeds } from '../../../src/detect/detect';
import { FeedDetectorError } from '../../../src/errors';
import { openFeed } from '../../../src/feed/unified-feed';
import { createProfile } from '../../../src/profile/profile';
import type { FeedDescriptor, FeedItem } from '../../../src/types';
import { fixtureTruth, loadFixture } from '../../helpers/dom';

async function profileFor(name: string) {
  const doc = loadFixture(name);
  const feeds = await detectFeeds(doc);
  return { doc, profile: createProfile({ url: doc.URL, feeds }) };
}

test('social-feed: count, order and builtin statuses', async () => {
  const { doc, profile } = await profileFor('social-feed');
  const feed = openFeed(doc, profile);
  const items = feed.items();
  const truth = fixtureTruth(doc);
  expect(items.map((i) => i.element)).toEqual(truth.items);
  const excluded = items
    .filter((i) => i.status === 'excluded')
    .map((i) => truth.items.indexOf(i.element) + 1);
  expect(excluded).toEqual([4, 8]);
  expect(items[5]!.parts.length).toBe(1);
  expect(items[5]!.parts[0]!.rule.ruleId).toBe('b_ad_iframe');
  expect(items.every((i) => i.connected && i.feedId === profile.feeds[0]!.id)).toBe(true);
  expect(feed.items({ status: 'excluded' }).length).toBe(2);
  expect(feed.items({ status: ['kept'] }).length).toBe(10);
  feed.dispose();
});

test('two-feeds: unified order is document order', async () => {
  const { doc, profile } = await profileFor('two-feeds');
  const feed = openFeed(doc, profile);
  expect(feed.items().map((i) => i.element)).toEqual(fixtureTruth(doc).items);
  expect(new Set(feed.items().map((i) => i.feedId)).size).toBe(2);
});

test('for await ends for live:false; status filter yields 2', async () => {
  const { doc, profile } = await profileFor('social-feed');
  const feed = openFeed(doc, profile);
  const all: FeedItem[] = [];
  for await (const item of feed) all.push(item);
  expect(all.length).toBe(12);
  const excluded: FeedItem[] = [];
  for await (const item of feed.iterate({ status: 'excluded' })) excluded.push(item);
  expect(excluded.length).toBe(2);
});

test('events fire after openFeed returns', async () => {
  const { doc, profile } = await profileFor('social-feed');
  const feed = openFeed(doc, profile);
  const added: string[] = [];
  feed.on('item:added', (item) => added.push(item.id));
  expect(added.length).toBe(0);
  await Promise.resolve();
  expect(added).toEqual(feed.items().map((i) => i.id));
});

test('a descriptor with no container → feed:lost', async () => {
  const { doc, profile } = await profileFor('social-feed');
  const ghost: FeedDescriptor = {
    ...profile.feeds[0]!,
    id: 'fd_ghost',
    container: { type: 'css', value: '.nope' },
  };
  const feed = openFeed(doc, { ...profile, feeds: [...profile.feeds, ghost] });
  const lost: string[] = [];
  feed.on('feed:lost', ({ feedId }) => lost.push(feedId));
  await Promise.resolve();
  expect(lost).toEqual(['fd_ghost']);
  expect(feed.items().length).toBe(12);
});

test('dispose is idempotent; later calls throw DISPOSED', async () => {
  const { doc, profile } = await profileFor('social-feed');
  const feed = openFeed(doc, profile);
  const it = feed.iterate({ live: true });
  feed.dispose();
  feed.dispose();
  expect((await it.next()).done).toBe(true);
  try {
    feed.items();
    throw new Error('expected throw');
  } catch (e) {
    expect(e).toBeInstanceOf(FeedDetectorError);
    expect((e as FeedDetectorError).code).toBe('DISPOSED');
  }
});
