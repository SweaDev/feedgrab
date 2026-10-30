import { describe, expect, test } from 'bun:test';
import { evaluateSelector } from '../../../src/selector/evaluate';
import {
  buildPathSelector,
  containerSelector,
  cssEscape,
  itemSelector,
} from '../../../src/selector/generate';
import { fixtureTruth, loadFixture } from '../../helpers/dom';

const FIXTURES = [
  'social-feed',
  'search-results',
  'product-grid',
  'blog-list',
  'two-feeds',
  'nested-feeds',
  'css-modules',
  'infinite-base',
  'paginated-1',
  'placeholder',
];

describe.each(FIXTURES)('%s', (name) => {
  const doc = loadFixture(name);
  const truth = fixtureTruth(doc);
  for (const [feed, container] of truth.feeds) {
    test(`selectors for ${feed}`, () => {
      const c = containerSelector(container);
      expect(evaluateSelector(c, doc)).toEqual([container]);
      const items = truth.items.filter((el) => el.closest('[data-fixture-feed]') === container);
      const i = itemSelector(container, items);
      const matched = evaluateSelector(i, container);
      for (const el of items) expect(matched).toContain(el);
      for (const sel of [c.value, i.value]) {
        expect(sel).not.toContain('data-fixture');
        expect(sel).not.toMatch(/css-1q2w3e|_[a-z]+_[0-9a-z]{5}_/);
      }
    });
  }
});

test('expected shapes', () => {
  const doc = loadFixture('social-feed');
  const timeline = doc.querySelector('.timeline')!;
  expect(containerSelector(timeline).value).toBe('.timeline');
  expect(itemSelector(timeline, Array.from(timeline.children)).value).toBe(':scope > article');
  const css = loadFixture('css-modules');
  expect(containerSelector(css.querySelector('[role=feed]')!).value).toBe('[role="feed"]');
});

test('S2 when sibling extras are many; wrapper case uses descendant form', () => {
  const doc = loadFixture('placeholder');
  const feed = doc.querySelector('.feed')!;
  const real = Array.from(feed.querySelectorAll('[data-fixture-item]'));
  expect(itemSelector(feed, real.slice(0, 2)).value).toBe(':scope > div.item');
  const main = doc.querySelector('main')!;
  expect(itemSelector(main, real).value).toBe(':scope div.item');
});

test('cssEscape and path selector', () => {
  expect(cssEscape('a.b')).toBe('a\\.b');
  expect(cssEscape('1a')).toBe('\\31 a');
  expect(cssEscape('-')).toBe('\\-');
  const doc = loadFixture('blog-list');
  const art = doc.querySelectorAll('article')[2]!;
  const path = buildPathSelector(art, doc.body);
  expect(doc.querySelector(path)).toBe(art);
});
