import { expect, test } from 'bun:test';
import { checkDescriptor } from '../../../src/feed/check';
import type { FeedDescriptor } from '../../../src/types';
import { loadFixture } from '../../helpers/dom';
import { domSnapshot } from '../../helpers/snapshot';

const base: FeedDescriptor = {
  id: 'fd_check',
  container: { type: 'css', value: '.video-grid' },
  item: { type: 'css', value: ':scope > .video-card' },
  exclude: [],
  include: [],
  source: 'manual',
  confidence: 1,
  confirmed: true,
};

test('reports items, link hits, structure matches and content type without touching the page', () => {
  const doc = loadFixture('video-grid');
  const before = domSnapshot(doc);
  const r = checkDescriptor(doc, {
    ...base,
    permalink: { type: 'css', value: 'h3 a' },
    structure: {
      parts: [
        { selector: { type: 'css', value: '.badge' }, required: true },
        { selector: { type: 'css', value: '.nope' }, required: false },
      ],
    },
  });
  expect(r.items.length).toBe(8);
  expect(r.withLink).toBe(8);
  expect(r.matchingStructure).toBe(8);
  expect(r.type).toBe('video');
  expect(r.kinds.video).toBe(1);
  expect(domSnapshot(doc)).toBe(before);
});

test('no permalink or structure; bad selectors find nothing', () => {
  const doc = loadFixture('video-grid');
  const r = checkDescriptor(doc, base);
  expect([r.withLink, r.matchingStructure]).toEqual([0, 8]);
  const bad = checkDescriptor(doc, { ...base, container: { type: 'css', value: '[[' } });
  expect(bad.items).toEqual([]);
  expect(bad.type).toBe('post');
});
