import { expect, test } from 'bun:test';
import { captureSample } from '../../../src/feed/sample';
import { openFeed } from '../../../src/feed/unified-feed';
import { createProfile, parseProfile, serializeProfile } from '../../../src/profile/profile';
import { parseHtml } from '../../../src/server';
import type { FeedDescriptor } from '../../../src/types';

const URL = 'https://social.test/home';
const bytes = (s: string) => new TextEncoder().encode(s).length;

const descriptor = (over: Partial<FeedDescriptor> = {}): FeedDescriptor => ({
  id: 'fd_t',
  container: { type: 'css', value: 'main > section' },
  item: { type: 'css', value: ':scope > article' },
  exclude: [],
  include: [],
  source: 'manual',
  confidence: 1,
  confirmed: true,
  ...over,
});

const post = (i: number) => `
  <article class="post css-1x9ab" style="color:red" onclick="steal()">
    <script>alert(1)</script><style>.x{}</style>
    <svg viewBox="0 0 10 10"><path d="M0 0L10 10"></path></svg>
    <img src="https://cdn.test/${i}.png" alt="">
    <a href="/u${i}" data-testid="User">user ${i}</a>
    <a href="/u${i}/status/${i}"><time datetime="2026-11-05">3h</time></a>
    <p>${'Long post text '.repeat(40)}</p>
  </article>`;

const page = () =>
  parseHtml(
    `<html><head><title>t</title><script>x()</script></head><body><nav><a href="/">home</a></nav>
     <main><aside>side</aside><section>${[1, 2, 3, 4].map(post).join('')}</section></main>
     <footer>f</footer></body></html>`,
    URL,
  );

test('captureSample keeps two stripped items that still match the descriptor', () => {
  const doc = page();
  const before = doc.documentElement.outerHTML;
  const html = captureSample(doc, descriptor())!;
  expect(doc.documentElement.outerHTML).toBe(before);
  expect(bytes(html)).toBeLessThanOrEqual(20000);
  for (const bad of ['alert(1)', '.x{}', '<path', 'cdn.test', 'onclick', 'style=', 'footer'])
    expect(html).not.toContain(bad);
  expect(html).toContain('data-testid="User"');
  expect(html).toContain('datetime="2026-11-05"');

  const sample = parseHtml(html, URL);
  expect(sample.querySelectorAll('article')).toHaveLength(2);
  const live = openFeed(doc, createProfile({ url: URL, feeds: [descriptor()] }), { live: false });
  const copy = openFeed(sample, createProfile({ url: URL, feeds: [descriptor()] }), {
    live: false,
  });
  expect(copy.items().map((i) => i.id)).toEqual(
    live
      .items()
      .slice(0, 2)
      .map((i) => i.id),
  );
  expect(copy.items().map((i) => i.permalink)).toEqual([
    'https://social.test/u1/status/1',
    'https://social.test/u2/status/2',
  ]);
});

test('captureSample keeps positions for nth selectors and honours the budget', () => {
  const doc = page();
  const nth = descriptor({
    container: { type: 'css', value: 'body > main > section:nth-child(2)' },
  });
  const html = captureSample(doc, nth, { items: 1 })!;
  expect(parseHtml(html, URL).querySelectorAll('section:nth-child(2) > article')).toHaveLength(1);
  const small = captureSample(doc, descriptor(), { maxBytes: 1500, maxText: 10 });
  expect(small && bytes(small)).toBeLessThanOrEqual(1500);
  expect(captureSample(doc, descriptor(), { maxBytes: 100 })).toBeNull();
  expect(captureSample(doc, descriptor({ container: { type: 'css', value: '.none' } }))).toBeNull();
});

test('descriptor permalink: parsed, used for ids and exposed on items', () => {
  const doc = page();
  const d = descriptor({ permalink: { type: 'css', value: 'a[data-testid="User"]' } });
  const profile = parseProfile(serializeProfile(createProfile({ url: URL, feeds: [d] })));
  expect(profile.feeds[0]!.permalink).toEqual(d.permalink!);
  const [first] = openFeed(doc, profile, { live: false }).items();
  expect(first!.permalink).toBe('https://social.test/u1');
  const [auto] = openFeed(doc, createProfile({ url: URL, feeds: [descriptor()] }), {
    live: false,
  }).items();
  expect(auto!.permalink).toBe('https://social.test/u1/status/1');
  expect(auto!.id).not.toBe(first!.id);
});

test('permalinkParams: parsed, keeps only those params in ids and item.permalink', () => {
  const html = ['p1', 'p2']
    .map(
      (pp) => `<article><a href="/watch?pp=${pp}&v=abc"><time>1h</time></a> same video</article>`,
    )
    .join('');
  const doc = parseHtml(`<main><section>${html}</section></main>`, URL);
  const all = openFeed(doc, createProfile({ url: URL, feeds: [descriptor()] }), { live: false });
  expect(all.items().map((i) => i.permalink)).toEqual([
    'https://social.test/watch?pp=p1&v=abc',
    'https://social.test/watch?pp=p2&v=abc',
  ]);
  const d = descriptor({ permalinkParams: ['v'] });
  const profile = parseProfile(serializeProfile(createProfile({ url: URL, feeds: [d] })));
  expect(profile.feeds[0]!.permalinkParams).toEqual(['v']);
  const items = openFeed(doc, profile, { live: false }).items();
  expect(items.map((i) => i.permalink)).toEqual(['https://social.test/watch?v=abc']);
  expect(() =>
    parseProfile(serializeProfile({ ...profile, feeds: [{ ...d, permalinkParams: [''] }] })),
  ).toThrow();
});
