import { expect, test } from 'bun:test';
import { FeedDetectorError } from '../../../src/errors';
import { evaluateSelector, resolveContainers, resolveItems } from '../../../src/selector/evaluate';
import { matchSelector, validateSelector } from '../../../src/selector/match';
import { loadFixture } from '../../helpers/dom';

const doc = loadFixture('social-feed');
const timeline = doc.querySelector('.timeline')!;

test('css against document and relative :scope path', () => {
  expect(evaluateSelector({ type: 'css', value: 'article.post' }, doc).length).toBe(12);
  expect(evaluateSelector({ type: 'css', value: ':scope > article' }, timeline).length).toBe(12);
});

test('xpath relative to a container', () => {
  const els = evaluateSelector({ type: 'xpath', value: './/article' }, timeline);
  expect(els.length).toBe(12);
  expect(els[0]!.tagName).toBe('ARTICLE');
  expect(evaluateSelector({ type: 'xpath', value: '//div[@class="timeline"]' }, doc)).toEqual([
    timeline,
  ]);
});

test('xpath returns elements only', () => {
  expect(evaluateSelector({ type: 'xpath', value: './/p/text()' }, timeline)).toEqual([]);
});

test('resolveContainers / resolveItems keep descendants only', () => {
  const d = {
    container: { type: 'css', value: '.timeline' },
    item: { type: 'css', value: 'article' },
  } as const;
  const [c] = resolveContainers(doc, d);
  expect(c).toBe(timeline);
  expect(resolveItems(c!, d).length).toBe(12);
  const self = resolveItems(c!, { item: { type: 'xpath', value: '. | .//article' } });
  expect(self).not.toContain(timeline);
});

test('invalid css and xpath throw INVALID_SELECTOR', () => {
  for (const sel of [
    { type: 'css', value: 'div[[' },
    { type: 'xpath', value: '//div[' },
  ] as const) {
    try {
      evaluateSelector(sel, doc);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(FeedDetectorError);
      expect((e as FeedDetectorError).code).toBe('INVALID_SELECTOR');
      expect((e as FeedDetectorError).details).toHaveProperty('cause');
    }
  }
});

test('validateSelector never throws', () => {
  expect(validateSelector(doc, { type: 'css', value: '.post' })).toEqual({
    valid: true,
    count: 12,
  });
  const bad = validateSelector(doc, { type: 'css', value: 'div[[' });
  expect(bad.valid).toBe(false);
  expect(bad.count).toBe(0);
  expect(typeof bad.error).toBe('string');
});

test('matchSelector has no boxes without layout and honors root', () => {
  const r = matchSelector(doc, { type: 'css', value: 'a' }, { root: timeline });
  expect(r.boxes).toBeUndefined();
  expect(r.elements.every((el) => timeline.contains(el))).toBe(true);
});
