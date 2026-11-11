import { expect, test } from 'bun:test';
import { suggestPermalinks } from '../../../src/detect/permalink';
import { findReferenceItem, matchStructure, suggestStructure } from '../../../src/detect/structure';
import { captureSample } from '../../../src/feed/sample';
import { openFeed } from '../../../src/feed/unified-feed';
import { createProfile, parseProfile, serializeProfile } from '../../../src/profile/profile';
import { parseHtml } from '../../../src/server';
import type { FeedDescriptor, ItemStructure } from '../../../src/types';

const URL = 'https://social.test/home';
const tick = () => new Promise((r) => setTimeout(r, 0));

/** A post: author link, time permalink, text, actions; `photo` adds a thumbnail. */
const post = (id: number, photo = false) => `
  <article class="post">
    <a href="/u${id}" class="author">user ${id}</a>
    <a href="/u${id}/status/${id}"><time datetime="2026-11-05">3h</time></a>
    ${photo ? `<a href="/u${id}/status/${id}/photo/1"><img class="thumb" alt="photo ${id}"></a>` : ''}
    <p>Post number ${id} with some text</p>
    <div class="actions"><button data-testid="like">Like</button></div>
  </article>`;
/** Same item selector, but an ad: no time, no actions. */
const ad = `
  <article class="post">
    <a href="https://ads.test/x" class="author">Sponsor</a>
    <p>Buy our product today, it is great</p>
  </article>`;
/** A heading row, also matched by the item selector. */
const heading = '<article class="post"><h2>What is happening</h2></article>';

const page = (...rows: string[]) =>
  parseHtml(`<main><section>${rows.join('')}</section></main>`, URL);
const itemsOf = (doc: Document) => Array.from(doc.querySelectorAll('section > article'));

const descriptor = (structure?: ItemStructure): FeedDescriptor => ({
  id: 'fd_t',
  container: { type: 'css', value: 'main > section' },
  item: { type: 'css', value: ':scope > article' },
  exclude: [],
  include: [],
  source: 'manual',
  confidence: 1,
  confirmed: true,
  ...(structure ? { structure } : {}),
});

const rows = [heading, ad, post(1, true), post(2), post(3, true), post(4), post(5), post(6)];

test('suggestStructure: common parts required, the thumbnail optional, from the reference', () => {
  const items = itemsOf(page(...rows));
  const parts = suggestStructure(items, { reference: items[2] });
  const by = (label: string) => parts.filter((p) => p.label === label);
  expect(by('time')).toEqual([
    {
      selector: { type: 'css', value: 'time' },
      required: true,
      label: 'time',
      coverage: 0.75,
      text: '3h',
    },
  ]);
  expect(by('image')[0]).toMatchObject({ required: false, coverage: 0.25, text: 'photo 1' });
  expect(by('button')[0]?.selector.value).toBe('button[data-testid="like"]');
  // Only the ad and the heading lack the time link, so it is required.
  const required = { parts: parts.filter((p) => p.required) };
  expect(items.map((el) => matchStructure(el, required).ok)).toEqual([
    false,
    false,
    true,
    true,
    true,
    true,
    true,
    true,
  ]);
  // Deterministic.
  expect(suggestStructure(items, { reference: items[2] })).toEqual(parts);
});

test('suggestStructure: nothing required with too few items; empty input', () => {
  const items = itemsOf(page(post(1), post(2)));
  expect(suggestStructure(items).every((p) => !p.required)).toBe(true);
  expect(suggestStructure([])).toEqual([]);
});

test('matchStructure and findReferenceItem: first item with every required part and most optional', () => {
  const items = itemsOf(page(...rows));
  const structure: ItemStructure = {
    parts: [
      { selector: { type: 'css', value: 'time' }, required: true },
      { selector: { type: 'css', value: 'img.thumb' }, required: false },
      { selector: { type: 'css', value: '[[bad' }, required: false },
    ],
  };
  expect(matchStructure(items[1]!, structure)).toEqual({
    ok: false,
    missing: [structure.parts[0]!],
    optional: 0,
  });
  expect(matchStructure(items[2]!, structure)).toEqual({ ok: true, missing: [], optional: 1 });
  expect(findReferenceItem(items, structure)).toBe(2);
  expect(findReferenceItem(items.slice(3), structure)).toBe(1); // post 3 has the thumbnail
  expect(findReferenceItem(items.slice(0, 2), structure)).toBe(-1);
});

const timeRequired: ItemStructure = {
  parts: [
    { selector: { type: 'css', value: 'time' }, required: true, label: 'time' },
    { selector: { type: 'css', value: 'img.thumb' }, required: false, label: 'image' },
  ],
};

test('openFeed: items missing a required part are excluded with a structure reason', async () => {
  const doc = page(...rows);
  const feed = openFeed(doc, createProfile({ url: URL, feeds: [descriptor(timeRequired)] }));
  const items = feed.items();
  expect(items.map((i) => i.status)).toEqual([
    'excluded',
    'excluded',
    'kept',
    'kept',
    'kept',
    'kept',
    'kept',
    'kept',
  ]);
  expect(items[1]!.reasons).toEqual([
    {
      ruleId: 'r_structure',
      origin: 'user',
      kind: 'structure',
      selector: { type: 'css', value: 'time' },
    },
  ]);
  feed.dispose();
});

test('openFeed: an include rule rescues; no outlier check when a structure is set', () => {
  const odd =
    '<div class="promo"><a href="/u9/status/9"><time>1h</time></a><p>An odd one but real</p></div>';
  const doc = page(post(1), post(2), post(3), odd, ad);
  const d = {
    ...descriptor(timeRequired),
    item: { type: 'css' as const, value: ':scope > *' },
    include: [
      {
        kind: 'selector' as const,
        selector: { type: 'css' as const, value: 'article' },
        scope: 'item' as const,
      },
    ],
  };
  const feed = openFeed(doc, createProfile({ url: URL, feeds: [d] }));
  // The div is no outlier (its structure is fine); the ad is rescued by the include rule.
  expect(feed.items().map((i) => i.status)).toEqual(['kept', 'kept', 'kept', 'kept', 'kept']);
  expect(feed.items()[4]!.rescuedBy?.origin).toBe('user');
  feed.dispose();
});

test('openFeed (live): an item becomes kept once its required part renders', async () => {
  const doc = page(post(1), '<article class="post"><p>Loading the post text here</p></article>');
  const feed = openFeed(doc, createProfile({ url: URL, feeds: [descriptor(timeRequired)] }), {
    live: true,
  });
  const late = feed.items()[1]!;
  expect(late.status).toBe('excluded');
  const updates: string[] = [];
  feed.on('item:updated', (i, prev) => updates.push(`${prev}->${i.status}`));
  late.element.insertAdjacentHTML('beforeend', '<time>now</time>');
  await tick();
  expect(late.status).toBe('kept');
  expect(updates).toEqual(['excluded->kept']);
  feed.dispose();
});

test('captureSample: keeps the reference item (given, or found by the structure)', () => {
  const doc = page(...rows);
  const items = itemsOf(doc);
  const texts = (html: string | null) =>
    itemsOf(parseHtml(html!, URL))
      .filter((el) => el.childNodes.length > 0)
      .map((el) => el.querySelector('p, h2')?.textContent?.trim().slice(0, 13));
  expect(texts(captureSample(doc, descriptor()))).toEqual(['What is happe', 'Buy our produ']);
  expect(texts(captureSample(doc, descriptor(), { reference: items[4] }))).toEqual([
    'What is happe',
    'Post number 3',
  ]);
  const html = captureSample(doc, descriptor(timeRequired), { items: 3 });
  expect(texts(html)).toEqual(['What is happe', 'Buy our produ', 'Post number 1']);
  // The sample still yields the reference item under the structure.
  const sampled = itemsOf(parseHtml(html!, URL));
  expect(findReferenceItem(sampled, timeRequired)).toBe(sampled.length - 1);
});

test('suggestPermalinks: ranks the links of the reference item', () => {
  const items = itemsOf(page(...rows));
  expect(suggestPermalinks(items, URL)).toEqual([]); // the heading row has no links
  const [best] = suggestPermalinks(items, URL, { reference: items[2] });
  expect(best?.url).toBe('https://social.test/u1/status/1');
});

test('structure round-trips through profiles; invalid parts are rejected', () => {
  const p = createProfile({ url: URL, feeds: [descriptor(timeRequired)] });
  expect(parseProfile(serializeProfile(p))).toEqual(p);
  const bad = JSON.parse(serializeProfile(p));
  bad.feeds[0].structure.parts[0].required = 'yes';
  expect(() => parseProfile(JSON.stringify(bad))).toThrow();
});
