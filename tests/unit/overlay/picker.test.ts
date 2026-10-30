import { expect, test } from 'bun:test';
import { getWindow } from '../../../src/env/dom';
import type { FeedDetectorError } from '../../../src/errors';
import { pickElement } from '../../../src/overlay/picker';
import { loadFixture } from '../../helpers/dom';
import { domSnapshot } from '../../helpers/snapshot';

test('pickElement resolves on click and leaves the page unchanged', async () => {
  const doc = loadFixture('social-feed');
  const before = domSnapshot(doc);
  const win = getWindow(doc)!;
  const target = doc.querySelectorAll('article.post')[2]!.querySelector('time')!;
  let pageSawClick = false;
  target.addEventListener('click', () => {
    pageSawClick = true;
  });
  const p = pickElement(doc);
  target.dispatchEvent(new win.MouseEvent('mouseover', { bubbles: true }));
  target.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  expect(await p).toBe(target);
  expect(pageSawClick).toBe(false);
  expect(domSnapshot(doc)).toBe(before);
  target.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  expect(pageSawClick).toBe(true);
});

test('pickElement rejects on Escape and on abort', async () => {
  const doc = loadFixture('social-feed');
  const win = getWindow(doc)!;
  const p = pickElement(doc);
  doc.body.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const e = (await p.catch((x) => x)) as FeedDetectorError;
  expect(e.code).toBe('OVERLAY_CANCELLED');
  const ac = new AbortController();
  const p2 = pickElement(doc, { signal: ac.signal });
  ac.abort();
  expect(((await p2.catch((x) => x)) as FeedDetectorError).code).toBe('OVERLAY_CANCELLED');
});

test('filter rejects elements', async () => {
  const doc = loadFixture('social-feed');
  const win = getWindow(doc)!;
  const p = pickElement(doc, { filter: (el) => el.tagName === 'ARTICLE' });
  doc.querySelector('time')!.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const article = doc.querySelector('article')!;
  article.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  expect(await p).toBe(article);
});
