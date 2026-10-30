import { expect, test } from 'bun:test';
import { removeItem, removeParts } from '../../../src/cleanup/remove';
import { detectFeeds } from '../../../src/detect/detect';
import { openFeed } from '../../../src/feed/unified-feed';
import { createProfile } from '../../../src/profile/profile';
import { loadFixture } from '../../helpers/dom';
import { domSnapshot } from '../../helpers/snapshot';

async function socialFeed() {
  const doc = loadFixture('social-feed');
  const feed = openFeed(doc, createProfile({ url: doc.URL, feeds: await detectFeeds(doc) }));
  return { doc, feed };
}

test('hide sets display none !important and the marker; restore reinstates inline display', async () => {
  const { doc, feed } = await socialFeed();
  const before = domSnapshot(doc);
  const item = feed.items()[0]!;
  (item.element as HTMLElement).style.setProperty('display', 'flex');
  const styled = domSnapshot(doc);
  const h = removeItem(item);
  const style = (item.element as HTMLElement).style;
  expect(style.getPropertyValue('display')).toBe('none');
  expect(style.getPropertyPriority('display')).toBe('important');
  expect(item.element.getAttribute('data-fd-removed')).toBe('item');
  expect(h.restore()).toBe(true);
  expect(style.getPropertyValue('display')).toBe('flex');
  expect(item.element.hasAttribute('data-fd-removed')).toBe(false);
  expect(domSnapshot(doc)).toBe(styled);
  style.removeProperty('display');
  item.element.removeAttribute('style');
  expect(domSnapshot(doc)).toBe(before);
  const h2 = removeItem(feed.items()[1]!);
  h2.restore();
  expect(domSnapshot(doc)).toBe(before);
});

test('detach and restore puts the item back at the same position', async () => {
  const { doc, feed } = await socialFeed();
  const before = domSnapshot(doc);
  const item = feed.items()[4]!;
  const parent = item.element.parentElement!;
  const index = Array.from(parent.children).indexOf(item.element);
  const h = removeItem(item, { mode: 'detach' });
  expect(item.element.isConnected).toBe(false);
  expect(h.restore()).toBe(true);
  expect(Array.from(parent.children).indexOf(item.element)).toBe(index);
  expect(domSnapshot(doc)).toBe(before);
});

test('a second remove returns the same handle; parts', async () => {
  const { doc, feed } = await socialFeed();
  const item = feed.items()[5]!;
  expect(removeItem(item)).toBe(removeItem(item));
  const parts = removeParts(item);
  expect(item.parts[0]!.element.getAttribute('data-fd-removed')).toBe('part');
  expect(parts.restore()).toBe(true);
  expect(item.parts[0]!.element.hasAttribute('data-fd-removed')).toBe(false);
  void doc;
});

test('dispose({ restore: true }) brings everything back', async () => {
  const { doc, feed } = await socialFeed();
  const before = domSnapshot(doc);
  for (const item of feed.items({ status: 'excluded' })) removeItem(item, { mode: 'detach' });
  for (const item of feed.items()) removeParts(item);
  expect(domSnapshot(doc)).not.toBe(before);
  feed.dispose({ restore: true });
  expect(domSnapshot(doc)).toBe(before);
});

test('restore returns false when the parent is gone', async () => {
  const { doc, feed } = await socialFeed();
  const item = feed.items()[0]!;
  const h = removeItem(item, { mode: 'detach' });
  doc.querySelector('.timeline')!.remove();
  expect(h.restore()).toBe(false);
});
