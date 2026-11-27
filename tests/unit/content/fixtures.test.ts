import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { feedType } from '../../../src/content/kind';
import { openFeed } from '../../../src/feed/unified-feed';
import { createProfile } from '../../../src/profile/profile';
import type { FeedDescriptor, ItemContent } from '../../../src/types';
import { FIXTURES, fixtureFields, loadFixture } from '../../helpers/dom';

/** Container and item selectors per media fixture (classes only, never `data-fixture-*`). */
const FEEDS: Record<string, [string, string]> = {
  'video-grid': ['.video-grid', ':scope > .video-card'],
  'image-gallery': ['.gallery', ':scope > figure'],
  'podcast-list': ['.episodes', ':scope > article'],
  'pdf-list': ['.papers', ':scope > li'],
  'mixed-feed': ['.entries', ':scope > article'],
};

function descriptor(container: string, item: string): FeedDescriptor {
  return {
    id: 'fd_test',
    container: { type: 'css', value: container },
    item: { type: 'css', value: item },
    exclude: [],
    include: [],
    source: 'manual',
    confidence: 1,
    confirmed: true,
  };
}

/** The value `content()` reports for a fixture field name. */
function reported(c: ItemContent, field: string): string | undefined {
  switch (field) {
    case 'image':
      return c.images[0]?.src;
    case 'mediaUrl':
      return c.media?.url;
    case 'embedUrl':
      return c.media?.embedUrl;
    case 'poster':
      return c.media?.poster;
    case 'duration':
      return c.media?.duration === undefined ? undefined : String(c.media.duration);
    default:
      return (c as Record<string, unknown>)[field] as string | undefined;
  }
}

describe.each(Object.entries(FEEDS))('%s', (name, [container, item]) => {
  const doc = loadFixture(name);
  const feed = openFeed(
    doc,
    createProfile({ url: doc.URL, feeds: [descriptor(container, item)] }),
    {
      live: false,
      builtinExclusions: false,
    },
  );
  const items = feed.items();
  const expected = JSON.parse(readFileSync(join(FIXTURES, `${name}.expected.json`), 'utf8'));

  test('every true item is read', () => {
    expect(items.length).toBe(expected.feeds[0].itemCount);
  });

  test('kinds, fields and feed type match the truth', () => {
    for (const it of items) {
      const c = it.content();
      expect(c.kind).toBe(it.element.getAttribute('data-fixture-kind') as never);
      for (const [field, value] of Object.entries(fixtureFields(it.element)))
        expect({ field, value: reported(c, field) }).toEqual({ field, value });
      if (c.kind === 'video' || c.kind === 'audio' || c.kind === 'pdf')
        expect(c.html).toBeUndefined();
      else expect(c.html).toBeString();
    }
    expect(feedType(items.map((i) => i.content().kind)).type).toBe(expected.feeds[0].type);
  });

  test('content() is cached and drops data-fixture attributes only from html it never emits', () => {
    const first = items[0]!;
    expect(first.content()).toBe(first.content());
    for (const it of items) expect(it.content().html ?? '').not.toContain('data-fixture');
  });
});

test('declared content type and field rules win over the heuristics', () => {
  const doc = loadFixture('mixed-feed');
  const d: FeedDescriptor = {
    ...descriptor('.entries', ':scope > article'),
    content: {
      type: 'post',
      fields: {
        title: { selector: { type: 'css', value: 'time' } },
        publishedAt: { selector: { type: 'css', value: 'time' }, source: 'attr', attr: 'datetime' },
      },
    },
  };
  const feed = openFeed(doc, createProfile({ url: doc.URL, feeds: [d] }), { live: false });
  const c = feed.items()[1]!.content();
  expect(c.kind).toBe('post');
  expect(c.confidence).toBe(1);
  expect(c.title).toBe('Nov 2');
  expect(c.publishedAt).toBe('2026-11-02T00:00:00.000Z');
});
