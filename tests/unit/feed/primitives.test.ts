import { expect, test } from 'bun:test';
import type { FeedDetectorError } from '../../../src/errors';
import { AsyncQueue } from '../../../src/feed/async-queue';
import { Emitter } from '../../../src/feed/emitter';
import { FeedItemImpl } from '../../../src/feed/feed-item';
import { itemId } from '../../../src/feed/item-id';
import { ItemRegistry } from '../../../src/feed/registry';
import { parseHtml } from '../../../src/server';
import { loadFixture } from '../../helpers/dom';

const BASE = 'https://site.test/feed';

test('same permalink with tracking params / hash → same id', () => {
  const doc = parseHtml(
    `<div id="a"><a href="/u/x">x</a><a href="/p/1?b=2&a=1&utm_source=x#c"><time>1h</time></a></div>
     <div id="b"><a href="https://site.test/p/1?a=1&b=2&fbclid=z">open</a></div>
     <div id="c"><a href="/p/2"><time>1h</time></a></div>`,
    BASE,
  );
  const id = (s: string) => itemId(doc.getElementById(s)!, BASE);
  expect(id('a')).toBe(id('b'));
  expect(id('a')).not.toBe(id('c'));
  expect(id('a')).toMatch(/^i_[0-9a-z]{7}$/);
});

test('text fallback and placeholder', () => {
  const doc = parseHtml(
    '<div id="t">A post with enough text</div><div id="s"><div class="line"></div></div><div id="j"><a href="javascript:void(0)">Short</a></div><div id="h"><a href="#top">x</a></div>',
    BASE,
  );
  expect(itemId(doc.getElementById('t')!, BASE)).toMatch(/^i_/);
  expect(itemId(doc.getElementById('s')!, BASE)).toBeNull();
  expect(itemId(doc.getElementById('j')!, BASE)).toBeNull();
  expect(itemId(doc.getElementById('h')!, BASE)).toBeNull();
  const ph = loadFixture('placeholder');
  expect(itemId(ph.querySelector('.skeleton')!, BASE)).toBeNull();
});

test('emitter: unsubscribe, once and error routing without recursion', () => {
  const em = new Emitter();
  const seen: string[] = [];
  const errors: FeedDetectorError[] = [];
  const off = em.on('feed:lost', ({ feedId }) => seen.push(feedId));
  em.once('feed:lost', ({ feedId }) => seen.push(`once:${feedId}`));
  em.on('feed:error', ({ error }) => errors.push(error));
  em.on('feed:error', () => {
    throw new Error('nested');
  });
  em.on('feed:lost', () => {
    throw new Error('boom');
  });
  em.emit('feed:lost', { feedId: 'a' });
  off();
  em.emit('feed:lost', { feedId: 'b' });
  expect(seen).toEqual(['a', 'once:a']);
  expect(errors.map((e) => [e.code, e.message])).toEqual([
    ['LISTENER_ERROR', 'boom'],
    ['LISTENER_ERROR', 'boom'],
  ]);
});

test('queue ordering, close and drain', async () => {
  const q = new AsyncQueue<number>();
  q.push(1);
  q.push(2);
  const p = (async () => {
    const out: number[] = [];
    for await (const v of q) out.push(v);
    return out;
  })();
  await Promise.resolve();
  q.push(3);
  q.drainThenClose();
  expect(await p).toEqual([1, 2, 3]);

  const live = new AsyncQueue<number>();
  const pending = live.next();
  live.close();
  expect((await pending).done).toBe(true);
  live.push(9);
  expect((await live.next()).done).toBe(true);

  const d = new AsyncQueue<number>();
  d.push(1);
  d.drainThenClose();
  d.push(2);
  expect((await d.next()).value).toBe(1);
  expect((await d.next()).value).toBe(2);
  expect((await d.next()).done).toBe(true);
});

test('registry order across two documents', () => {
  const main = parseHtml('<ul><li id="a">a</li><li id="b">b</li><li id="c">c</li></ul>', BASE);
  const next = parseHtml('<ul><li id="d">d</li><li id="e">e</li></ul>', BASE);
  const reg = new ItemRegistry();
  const mk = (doc: Document, id: string, seq: number) =>
    new FeedItemImpl({ id, feedId: 'f', element: doc.getElementById(id)!, docSeq: seq });
  for (const it of [
    mk(next, 'e', 1),
    mk(main, 'c', 0),
    mk(main, 'a', 0),
    mk(next, 'd', 1),
    mk(main, 'b', 0),
  ]) {
    reg.insert(it);
  }
  expect(reg.order.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  expect(reg.idOf(main.getElementById('b')!)).toBe('b');
});

test('FeedItemImpl text cache and apply', () => {
  const doc = parseHtml('<div id="x">Hello  world</div>', BASE);
  const item = new FeedItemImpl({
    id: 'i',
    feedId: 'f',
    element: doc.getElementById('x')!,
    docSeq: 0,
  });
  expect(item.text()).toBe('Hello world');
  doc.getElementById('x')!.textContent = 'Changed';
  expect(item.text()).toBe('Hello world');
  item.invalidateText();
  expect(item.text()).toBe('Changed');
  expect(item.apply({ status: 'pending', reasons: [], parts: [], needsLlm: true })).toBe(true);
  expect(item.apply({ status: 'pending', reasons: [], parts: [], needsLlm: false })).toBe(false);
  expect(item.status).toBe('pending');
});
