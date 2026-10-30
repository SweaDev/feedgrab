import { expect, test } from 'bun:test';
import { detectFeeds } from '../../../src/detect/detect';
import { openFeed, type UnifiedFeedImpl } from '../../../src/feed/unified-feed';
import { createProfile } from '../../../src/profile/profile';
import type { FeedItem } from '../../../src/types';
import { appendFragment, fixtureHtml, loadFixture } from '../../helpers/dom';

const tick = () => new Promise((r) => setTimeout(r, 0));

async function liveFeed(name: string, opts: Record<string, unknown> = {}) {
  const doc = loadFixture(name);
  const profile = createProfile({ url: doc.URL, feeds: await detectFeeds(doc) });
  const feed = openFeed(doc, profile, { live: true, ...opts }) as UnifiedFeedImpl;
  const events: string[] = [];
  feed.on('item:added', (i) => events.push(`added:${i.id}`));
  feed.on('item:updated', (i) => events.push(`updated:${i.id}`));
  feed.on('item:removed', (i) => events.push(`removed:${i.id}`));
  feed.on('feed:lost', ({ feedId }) => events.push(`lost:${feedId}`));
  await tick();
  events.length = 0;
  return { doc, feed, events };
}

test('appending chunk 2 adds 5 items in order; a live iterator yields them', async () => {
  const { doc, feed, events } = await liveFeed('infinite-base');
  expect(feed.observer).not.toBeNull();
  const it = feed.iterate();
  const first: FeedItem[] = [];
  for (let i = 0; i < 5; i++) first.push((await it.next()).value);
  appendFragment(doc.getElementById('stream')!, fixtureHtml('infinite-chunk-2'));
  await tick();
  const added = events.filter((e) => e.startsWith('added:'));
  expect(added.length).toBe(5);
  expect(feed.items().length).toBe(10);
  expect(added).toEqual(
    feed
      .items()
      .slice(5)
      .map((i) => `added:${i.id}`),
  );
  const next: FeedItem[] = [];
  for (let i = 0; i < 5; i++) next.push((await it.next()).value);
  expect(next.map((i) => i.element.querySelector('a')!.getAttribute('href'))).toEqual([
    '/entry/6',
    '/entry/7',
    '/entry/8',
    '/entry/9',
    '/entry/10',
  ]);
  feed.dispose();
  expect((await it.next()).done).toBe(true);
});

test('remove + re-insert a clone → removed then updated (not added), not yielded again', async () => {
  const { doc, feed, events } = await liveFeed('infinite-base');
  const it = feed.iterate();
  for (let i = 0; i < 5; i++) await it.next();
  const stream = doc.getElementById('stream')!;
  const third = stream.children[2]!;
  const clone = third.cloneNode(true) as Element;
  const id = feed.items()[2]!.id;
  third.remove();
  await tick();
  expect(events).toEqual([`removed:${id}`]);
  expect(feed.items()[2]!.connected).toBe(false);
  stream.insertBefore(clone, stream.children[2]!);
  await tick();
  expect(events).toEqual([`removed:${id}`, `updated:${id}`]);
  expect(feed.items()[2]!.element).toBe(clone);
  expect(feed.items()[2]!.connected).toBe(true);
  appendFragment(stream, fixtureHtml('infinite-chunk-3'));
  await tick();
  const next = (await it.next()).value as FeedItem;
  expect(next.element.querySelector('a')!.getAttribute('href')).toBe('/entry/11');
  feed.dispose();
});

test('placeholders are emitted once filled', async () => {
  const { doc, feed, events } = await liveFeed('placeholder');
  expect(feed.items().length).toBe(4);
  const skeletons = Array.from(doc.querySelectorAll('.skeleton'));
  skeletons.forEach((s, i) => {
    s.innerHTML = `<a href="/story/${10 + i}">Story ${10 + i}</a><p>Now loaded with real text.</p>`;
  });
  await tick();
  expect(events.filter((e) => e.startsWith('added:')).length).toBe(3);
  expect(feed.items().length).toBe(7);
  feed.dispose();
});

test('re-mounted container: items continue without feed:lost', async () => {
  const { doc, feed, events } = await liveFeed('infinite-base', { lostTimeoutMs: 20 });
  const stream = doc.getElementById('stream')!;
  const replacement = stream.cloneNode(true) as Element;
  stream.replaceWith(replacement);
  await tick();
  expect(events.every((e) => e.startsWith('updated:'))).toBe(true);
  expect(feed.items().every((i) => i.connected && replacement.contains(i.element))).toBe(true);
  appendFragment(replacement, fixtureHtml('infinite-chunk-2'));
  await tick();
  await new Promise((r) => setTimeout(r, 40));
  expect(events.filter((e) => e.startsWith('added:')).length).toBe(5);
  expect(events.some((e) => e.startsWith('lost:'))).toBe(false);
  feed.dispose();
});

test('container removed permanently → feed:lost after the timeout', async () => {
  const { doc, feed, events } = await liveFeed('infinite-base', { lostTimeoutMs: 20 });
  doc.getElementById('stream')!.remove();
  await tick();
  expect(events.filter((e) => e.startsWith('removed:')).length).toBe(5);
  expect(events.some((e) => e.startsWith('lost:'))).toBe(false);
  await new Promise((r) => setTimeout(r, 40));
  expect(events.filter((e) => e.startsWith('lost:'))).toEqual([
    `lost:${feed.profile.feeds[0]!.id}`,
  ]);
  feed.dispose();
});
