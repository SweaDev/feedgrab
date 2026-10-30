import { expect, test } from '@playwright/test';
import { openFixture } from './helpers';

type Api = typeof import('../../src/index');
type State = { feed: ReturnType<Api['openFeed']>; added: string[]; before: string; nodes: number };

test('live feed picks up appended items in order; DOM otherwise unchanged', async ({ page }) => {
  await openFixture(page, 'infinite-base');
  await page.evaluate(async () => {
    const FD = (globalThis as unknown as { FeedDetector: Api }).FeedDetector;
    const before = document.documentElement.outerHTML;
    const feeds = await FD.detectFeeds(document);
    const feed = FD.openFeed(document, FD.createProfile({ url: location.href, feeds }));
    const added: string[] = [];
    feed.on('item:added', (item) =>
      added.push(item.element.querySelector('a')!.getAttribute('href')!),
    );
    const nodes = document.getElementById('stream')!.childNodes.length;
    (globalThis as unknown as { __fd: State }).__fd = { feed, added, before, nodes };
  });
  await page.evaluate(async () => {
    const html = await fetch('/infinite-chunk-2.html').then((r) => r.text());
    document.getElementById('stream')!.insertAdjacentHTML('beforeend', html);
  });
  await expect
    .poll(() => page.evaluate(() => (globalThis as unknown as { __fd: State }).__fd.added.length))
    .toBe(10);
  const result = await page.evaluate(() => {
    const { feed, added, before, nodes } = (globalThis as unknown as { __fd: State }).__fd;
    const count = feed.items().length;
    feed.dispose();
    const stream = document.getElementById('stream')!;
    while (stream.childNodes.length > nodes) stream.lastChild!.remove();
    return { added, count, same: document.documentElement.outerHTML === before };
  });
  expect(result.added.slice(5)).toEqual([
    '/entry/6',
    '/entry/7',
    '/entry/8',
    '/entry/9',
    '/entry/10',
  ]);
  expect(result.count).toBe(10);
  expect(result.same).toBe(true);
});
