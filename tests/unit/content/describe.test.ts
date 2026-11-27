import { expect, test } from 'bun:test';
import { describeFeed, fieldRuleFor, suggestFields } from '../../../src/content/describe';
import { readField } from '../../../src/content/fields';
import type { FeedDescriptor } from '../../../src/types';
import { loadFixture } from '../../helpers/dom';
import { domSnapshot } from '../../helpers/snapshot';

const feed = (container: string, item: string): FeedDescriptor => ({
  id: 'fd_d',
  container: { type: 'css', value: container },
  item: { type: 'css', value: item },
  exclude: [],
  include: [],
  source: 'manual',
  confidence: 1,
  confirmed: true,
});

test('describeFeed reports type, kinds and per-field coverage and values, read-only', () => {
  const doc = loadFixture('video-grid');
  const before = domSnapshot(doc);
  const d = describeFeed(doc, feed('.video-grid', ':scope > .video-card'));
  expect([d.type, d.detected, d.items, d.reference]).toEqual(['video', 'video', 8, 0]);
  expect(d.kinds.video).toBe(1);
  const by = Object.fromEntries(d.fields.map((f) => [f.field, f]));
  expect(by.title).toEqual({
    field: 'title',
    value: 'Harbor lights at dusk',
    coverage: 1,
    ruled: false,
  });
  expect(by.embedUrl?.value).toBe('https://www.youtube-nocookie.com/embed/aB3dE5fG7hI');
  expect(by.duration?.value).toBe('180');
  expect(by.html?.coverage).toBe(0);
  expect(domSnapshot(doc)).toBe(before);
});

test('describeFeed keeps the detected type apart from a declared one; reference item', () => {
  const doc = loadFixture('mixed-feed');
  const items = Array.from(doc.querySelectorAll('.entries > article'));
  const d = describeFeed(
    doc,
    {
      ...feed('.entries', ':scope > article'),
      content: { type: 'post', fields: { title: { selector: { type: 'css', value: 'time' } } } },
    },
    { reference: items[2] },
  );
  expect([d.type, d.detected, d.reference]).toEqual(['post', 'mixed', 2]);
  expect(d.kinds).toMatchObject({ post: 0.4, video: 0.3, image: 0.3 });
  expect(d.fields.find((f) => f.field === 'title')).toMatchObject({ value: 'Nov 3', ruled: true });
});

test('suggestFields ranks rules that work across items', () => {
  const doc = loadFixture('podcast-list');
  const items = Array.from(doc.querySelectorAll('.episodes > article'));
  const s = suggestFields(items, { baseUrl: doc.URL });
  expect(s.title?.[0]).toMatchObject({ coverage: 1, value: 'Episode 1: Harbor lights at dusk' });
  expect(s.mediaUrl?.[0]).toMatchObject({
    rule: { source: 'attr', attr: 'src' },
    coverage: 1,
    value: 'https://cdn.podcast.test/ep1.mp3',
  });
  expect(s.publishedAt?.[0]?.value).toBe('2026-10-01T00:00:00.000Z');
  expect(s.duration?.[0]?.value).toBe('2400');
  expect(s.author?.[0]?.value).toBe('Sam Rivera');
  for (const list of Object.values(s))
    for (const c of list ?? []) {
      for (const it of items.slice(0, 1))
        expect(readField(it, c.field, c.rule, doc.URL)).toBe(c.value);
    }
});

test('fieldRuleFor turns a picked element into a rule, or null when it cannot hold the field', () => {
  const doc = loadFixture('video-grid');
  const items = Array.from(doc.querySelectorAll('.video-card'));
  const root = items[3]!;
  const channel = root.querySelector('.channel-name')!;
  const c = fieldRuleFor('author', channel, root, items, doc.URL)!;
  expect(c).toMatchObject({ field: 'author', coverage: 1, value: 'Maker Channel 4' });
  expect(items.map((i) => readField(i, 'author', c.rule, doc.URL))[0]).toBe('Maker Channel 1');
  expect(fieldRuleFor('duration', root.querySelector('h3')!, root, items, doc.URL)).toBeNull();
  expect(fieldRuleFor('title', items[0]!.querySelector('h3')!, root, items, doc.URL)).toBeNull();
  expect(
    fieldRuleFor('embedUrl', root.querySelector('.thumb')!, root, items, doc.URL)?.rule,
  ).toMatchObject({
    source: 'attr',
    attr: 'href',
  });
});
