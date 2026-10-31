import { expect, test } from 'bun:test';
import { detectFromSelector, inspectFromElement } from '../../../src/detect/inspect';
import { FeedgrabError } from '../../../src/errors';
import { resolveContainers, resolveItems } from '../../../src/selector/evaluate';
import { loadFixture } from '../../helpers/dom';

const doc = loadFixture('social-feed');
const timeline = doc.querySelector('.timeline')!;

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof FeedgrabError ? e.code : 'OTHER';
  }
  return undefined;
}

test('inspect from a deep element returns the timeline', () => {
  const time = doc.querySelectorAll('article.post')[2]!.querySelector('time')!;
  const d = inspectFromElement(time);
  expect(d.source).toBe('inspect');
  expect(resolveContainers(doc, d)).toEqual([timeline]);
  expect(resolveItems(timeline, d).length).toBe(12);
  expect(d.confidence).toBeGreaterThan(0.45);
});

test('inspect throws NO_REPEATING_ANCESTOR', () => {
  const lone = loadFixture('social-feed').querySelector('a.logo')!;
  expect(code(() => inspectFromElement(lone, { minItems: 50 }))).toBe('NO_REPEATING_ANCESTOR');
});

test('detectFromSelector: container + item', () => {
  const d = detectFromSelector(doc, {
    container: { type: 'css', value: '.timeline' },
    item: { type: 'css', value: ':scope > article' },
  });
  expect(d.source).toBe('manual');
  expect(d.confidence).toBe(1);
  expect(d.confirmed).toBe(false);
  expect(resolveItems(timeline, d).length).toBe(12);
});

test('detectFromSelector: container only', () => {
  const d = detectFromSelector(doc, {
    container: { type: 'xpath', value: '//div[@class="timeline"]' },
  });
  expect(d.item.value).toBe(':scope > article');
  expect(resolveContainers(doc, d)).toEqual([timeline]);
});

test('detectFromSelector: item only', () => {
  const d = detectFromSelector(doc, { item: { type: 'css', value: 'article.post' } });
  expect(d.item).toEqual({ type: 'css', value: 'article.post' });
  expect(resolveContainers(doc, d)).toEqual([timeline]);
  expect(resolveItems(timeline, d).length).toBe(12);
});

test('detectFromSelector errors', () => {
  expect(code(() => detectFromSelector(doc, { container: { type: 'css', value: '.nope' } }))).toBe(
    'NO_MATCH',
  );
  expect(
    code(() =>
      detectFromSelector(doc, {
        container: { type: 'css', value: '.timeline' },
        item: { type: 'css', value: '.nope' },
      }),
    ),
  ).toBe('NO_MATCH');
  expect(code(() => detectFromSelector(doc, { item: { type: 'css', value: '[[' } }))).toBe(
    'INVALID_SELECTOR',
  );
});
