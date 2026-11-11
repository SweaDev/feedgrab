import { expect, test } from 'bun:test';
import {
  canonicalUrl,
  findPermalink,
  suggestPermalinkParams,
  suggestPermalinks,
} from '../../../src/detect/permalink';
import { parseHtml } from '../../../src/server';

const BASE = 'https://social.test/home';

/** X-like posts: avatar and name link to the author, the time links to the post. */
const post = (user: string, id: string, extra = '') => `
  <article data-testid="tweet">
    <a href="/${user}" class="avatar"><img alt=""></a>
    <div><a href="/${user}" role="link">${user}</a>
    <a href="/${user}/status/${id}" class="css-1x9ab"><time datetime="2026-11-05">3h</time></a></div>
    <p>Post ${id}</p>
    ${extra}
  </article>`;

const photo = (user: string, id: string) =>
  `<a href="/${user}/status/${id}/photo/1"><img alt="photo"></a>`;

const items = (html: string) => {
  const doc = parseHtml(`<main>${html}</main>`, BASE);
  return Array.from(doc.querySelectorAll('main > *'));
};

const href = (el: Element | null) => el?.getAttribute('href') ?? null;

test('findPermalink: explicit, time, heading, then deepest link', () => {
  const [bookmark, time, heading, deepest, none] = items(`
    <div><a href="/u">u</a><a href="/p/1"><time>1h</time></a><a rel="nofollow bookmark" href="/p/b">x</a></div>
    <div><a href="/u">u</a><a href="/p/2/photo/1">ph</a><a href="/p/2"><time>1h</time></a></div>
    <div><a href="/u/x/y">u</a><h2><a href="/p/3">Title</a></h2></div>
    <div><a href="/u">u</a><a href="/u/p/4">open</a><a href="/u/p/5">next</a></div>
    <div>No links here</div>`);
  expect(href(findPermalink(bookmark!, BASE))).toBe('/p/b');
  expect(href(findPermalink(time!, BASE))).toBe('/p/2');
  expect(href(findPermalink(heading!, BASE))).toBe('/p/3');
  expect(href(findPermalink(deepest!, BASE))).toBe('/u/p/4');
  expect(findPermalink(none!, BASE)).toBeNull();
});

test('findPermalink: a selector wins when it finds a link, else the heuristic applies', () => {
  const [el] = items(post('alice', '1'));
  expect(href(findPermalink(el!, BASE, { type: 'css', value: 'a[role="link"]' }))).toBe('/alice');
  expect(href(findPermalink(el!, BASE, { type: 'css', value: 'time' }))).toBe('/alice/status/1');
  expect(href(findPermalink(el!, BASE, { type: 'css', value: '.missing' }))).toBe(
    '/alice/status/1',
  );
  expect(href(findPermalink(el!, BASE, { type: 'css', value: 'a[' }))).toBe('/alice/status/1');
});

test('suggestPermalinks ranks the post link first, even when the post has a photo', () => {
  const els = items(
    post('alice', '1', photo('alice', '1')) + post('bob', '2') + post('carol', '3'),
  );
  const ranked = suggestPermalinks(els, BASE);
  expect(ranked.map((c) => c.url)).toEqual([
    'https://social.test/alice/status/1',
    'https://social.test/alice',
    'https://social.test/alice/status/1/photo/1',
  ]);
  const [top] = ranked;
  expect(top!.text).toBe('3h');
  expect(top!.selector.type).toBe('css');
  for (const [i, el] of els.entries()) {
    const a = findPermalink(el, BASE, top!.selector);
    expect(href(a)).toBe(`/${['alice', 'bob', 'carol'][i]}/status/${i + 1}`);
  }
  expect(suggestPermalinks(els, BASE)).toEqual(ranked);
  expect(suggestPermalinks([], BASE)).toEqual([]);
});

test('suggestPermalinks prefers heading links and links that differ per item', () => {
  const els = items(
    ['a', 'b', 'c']
      .map((s) => `<li><a href="/tag/news">news</a><h3><a href="/2026/${s}">${s}</a></h3></li>`)
      .join(''),
  );
  const [top] = suggestPermalinks(els, BASE);
  expect(top!.url).toBe('https://social.test/2026/a');
  expect(top!.selector.value).toBe('h3 a');
});

test('canonicalUrl keeps only the listed params when given', () => {
  const href = '/watch?pp=ugUH%3D%3D&v=abc&utm_source=x#t=1';
  expect(canonicalUrl(href, BASE)).toBe('https://social.test/watch?pp=ugUH%3D%3D&v=abc');
  expect(canonicalUrl(href, BASE, ['v'])).toBe('https://social.test/watch?v=abc');
  expect(canonicalUrl(href, BASE, ['utm_source'])).toBe('https://social.test/watch?utm_source=x');
  expect(canonicalUrl(href, BASE, [])).toBe('https://social.test/watch');
});

test('suggestPermalinkParams and candidate params report coverage and uniqueness', () => {
  const video = (id: string, pp: string, extra = '') =>
    `<div><h3><a href="/watch?v=${id}&pp=${pp}${extra}">Video ${id}</a></h3></div>`;
  const els = items(video('a', 'x', '&t=5&utm_medium=s') + video('b', 'x') + video('c', 'y'));
  const params = suggestPermalinkParams(els, BASE);
  expect(params).toEqual([
    { name: 'pp', value: 'x', coverage: 1, uniqueness: 0.6667 },
    { name: 't', value: '5', coverage: 0.3333, uniqueness: 0 },
    { name: 'v', value: 'a', coverage: 1, uniqueness: 1 },
  ]);
  expect(suggestPermalinkParams(els, BASE, { type: 'css', value: 'h3 a' })).toEqual(params);
  const [top] = suggestPermalinks(els, BASE);
  expect(top!.params).toEqual(params);
  expect(suggestPermalinkParams([], BASE)).toEqual([]);
});
