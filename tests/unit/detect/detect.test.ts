import { describe, expect, test } from 'bun:test';
import { detectFeeds } from '../../../src/detect/detect';
import { evaluateSelector, resolveContainers, resolveItems } from '../../../src/selector/evaluate';
import { fixtureTruth, loadFixture } from '../../helpers/dom';

const NAMES = [
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

describe.each(NAMES)('%s', (name) => {
  test('first descriptor resolves to the truth container and covers its items', async () => {
    const doc = loadFixture(name);
    const truth = fixtureTruth(doc);
    const [d] = await detectFeeds(doc);
    expect(d).toBeDefined();
    const containers = resolveContainers(doc, d!);
    expect(containers.length).toBe(1);
    expect([...truth.feeds.values()]).toContain(containers[0]!);
    const items = resolveItems(containers[0]!, d!);
    const truthItems = truth.items.filter(
      (el) => el.closest('[data-fixture-feed]') === containers[0],
    );
    for (const el of truthItems) expect(items).toContain(el);
    expect(d!.confirmed).toBe(false);
    expect(d!.source).toBe('heuristic');
    expect(d!.id).toMatch(/^fd_[0-9a-z]{7}$/);
  });
});

test('ids are deterministic', async () => {
  const a = await detectFeeds(loadFixture('two-feeds'));
  const b = await detectFeeds(loadFixture('two-feeds'));
  expect(a).toEqual(b);
  expect(a.length).toBe(2);
  expect(evaluateSelector(a[0]!.container, loadFixture('two-feeds')).length).toBe(1);
});
