import { expect, test } from 'bun:test';
import { detectFeeds } from '../../../src/detect/detect';
import { createProfile, serializeProfile } from '../../../src/profile/profile';
import { loadFixture } from '../../helpers/dom';

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

test.each(NAMES)('detectFeeds is deterministic: %s', async (name) => {
  const serialize = async (doc: Document) =>
    serializeProfile(createProfile({ url: doc.URL, feeds: await detectFeeds(doc) }));
  const doc = loadFixture(name);
  const runs = [
    await serialize(doc),
    await serialize(doc),
    await serialize(doc),
    await serialize(loadFixture(name)),
  ];
  expect(new Set(runs).size).toBe(1);
});
