import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findCandidates } from '../../../src/detect/heuristic';
import { computeFeatures, scoreFeatures, THRESHOLD } from '../../../src/detect/score';
import { FIXTURES, fixtureTruth, loadFixture } from '../../helpers/dom';

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
  'paginated-2',
  'placeholder',
];

describe.each(NAMES)('%s', (name) => {
  test('expected feeds are candidates and the top one is a main feed', () => {
    const doc = loadFixture(name);
    const expected = JSON.parse(readFileSync(join(FIXTURES, `${name}.expected.json`), 'utf8'));
    const truth = fixtureTruth(doc);
    const cands = findCandidates(doc);
    const containers = cands.map((c) => c.container);
    for (const f of expected.feeds) expect(containers).toContain(truth.feeds.get(f.fixtureFeed)!);
    expect([...truth.feeds.values()]).toContain(cands[0]!.container);
    console.log(
      name,
      cands.map((c) => `${c.container.tagName}.${c.container.className}=${c.score}`).join(' '),
    );
  });
});

test('nested-feeds: no candidate for the inner replies', () => {
  const cands = findCandidates(loadFixture('nested-feeds'));
  expect(cands.some((c) => c.container.classList.contains('replies'))).toBe(false);
  expect(cands.length).toBe(1);
});

test('social-feed: nav and trending score below the threshold', () => {
  const doc = loadFixture('social-feed');
  for (const sel of ['nav.main-nav', 'ul.trending']) {
    const container = doc.querySelector(sel)!;
    const s = scoreFeatures(
      computeFeatures({ container, items: Array.from(container.children) }),
      false,
    );
    expect(s).toBeLessThan(THRESHOLD);
  }
  expect(findCandidates(doc).length).toBe(1);
});

test('two-feeds: both feeds pass', () => {
  const doc = loadFixture('two-feeds');
  const cands = findCandidates(doc);
  expect(cands.length).toBe(2);
  for (const c of cands) expect(c.score).toBeGreaterThanOrEqual(THRESHOLD);
});

test('deterministic', () => {
  const a = findCandidates(loadFixture('social-feed')).map((c) => [c.score, c.signature]);
  const b = findCandidates(loadFixture('social-feed')).map((c) => [c.score, c.signature]);
  expect(a).toEqual(b);
});
