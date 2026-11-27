import { expect, test } from 'bun:test';
import { extractContent } from '../../../src/content/extract';
import { cleanHtml, findImages, readField, toIsoDate } from '../../../src/content/fields';
import { feedType, itemKind } from '../../../src/content/kind';
import { findMedia, parseDuration } from '../../../src/content/media';
import { detectFeeds } from '../../../src/detect/detect';
import { openFeed } from '../../../src/feed/unified-feed';
import { createProfile } from '../../../src/profile/profile';
import { parseHtml } from '../../../src/server';
import { loadFixture } from '../../helpers/dom';
import { domSnapshot } from '../../helpers/snapshot';

const BASE = 'https://site.test/feed/';
const item = (html: string) => parseHtml(`<div id="i">${html}</div>`, BASE).getElementById('i')!;

test('parseDuration reads badges and ISO 8601', () => {
  expect(parseDuration('12:34')).toBe(754);
  expect(parseDuration('1:02:03')).toBe(3723);
  expect(parseDuration('PT1H2M3S')).toBe(3723);
  expect(parseDuration('PT45M')).toBe(2700);
  expect(parseDuration('P')).toBeUndefined();
  expect(parseDuration('12 min')).toBeUndefined();
  expect(parseDuration('')).toBeUndefined();
});

test('toIsoDate accepts only machine-readable dates', () => {
  expect(toIsoDate('2026-05-01')).toBe('2026-05-01T00:00:00.000Z');
  expect(toIsoDate('2026-05-01T10:00:00Z')).toBe('2026-05-01T10:00:00.000Z');
  expect(toIsoDate('May 1')).toBeUndefined();
  expect(toIsoDate('2026-13-45')).toBeUndefined();
});

test('findImages skips avatars, icons, tiny and data images; reads lazy sources', () => {
  const el = item(`
    <img class="avatar" src="/a.jpg">
    <img src="/logo.png" alt="Logo">
    <img src="/i.jpg" width="16" height="16">
    <img src="data:image/gif;base64,R0" data-src="/lazy.jpg" alt=" Lazy  one ">
    <picture><source srcset="/p.webp 1x, /p@2x.webp 2x"><img src="/p.jpg"></picture>
    <div style="background-image: url('/bg.jpg')"></div>
    <img src="/lazy.jpg">`);
  expect(findImages(el, BASE)).toEqual([
    { src: 'https://site.test/lazy.jpg', alt: 'Lazy one' },
    {
      src: 'https://site.test/p.jpg',
      srcset: 'https://site.test/p.webp 1x, https://site.test/p@2x.webp 2x',
    },
    { src: 'https://site.test/bg.jpg' },
  ]);
});

test('cleanHtml drops scripts, embeds, forms and handlers, and absolutizes links', () => {
  const el =
    item(`<p onclick="x()" class="c" style="color:red">Hi <a href="/p/1" target="_blank">there</a></p>
    <script>alert(1)</script><style>p{}</style><iframe src="/f"></iframe><form><input></form>
    <img src="/x.jpg" alt="x" onerror="y()"><a href="javascript:z()">bad</a><!-- note -->`);
  expect(cleanHtml(el, BASE)).toBe(
    '<p>Hi <a href="https://site.test/p/1">there</a></p>\n    \n    <img src="https://site.test/x.jpg" alt="x"><a>bad</a>',
  );
});

test('readField sources: text, html, attr and defaults per field', () => {
  const el = item(
    '<h2 data-x="7">Title <b>bold</b></h2><a class="t" href="/v.mp4">v</a><time datetime="2026-01-02">Jan 2</time>',
  );
  const css = (value: string) => ({ type: 'css' as const, value });
  expect(readField(el, 'title', { selector: css('h2') }, BASE)).toBe('Title bold');
  expect(readField(el, 'html', { selector: css('h2'), source: 'html' }, BASE)).toBe(
    'Title <b>bold</b>',
  );
  expect(readField(el, 'mediaUrl', { selector: css('a.t') }, BASE)).toBe('https://site.test/v.mp4');
  expect(
    readField(el, 'title', { selector: css('h2'), source: 'attr', attr: 'data-x' }, BASE),
  ).toBe('7');
  expect(readField(el, 'publishedAt', { selector: css('time') }, BASE)).toBe(
    '2026-01-02T00:00:00.000Z',
  );
  expect(readField(el, 'title', { selector: css('.missing') }, BASE)).toBeUndefined();
  expect(readField(el, 'title', { selector: css('[[bad') }, BASE)).toBeUndefined();
});

test('findMedia: element, provider iframe, pdf embed, links', () => {
  expect(
    findMedia(
      item('<video poster="/p.jpg" width="640"><source src="/v.webm" type="video/webm"></video>'),
      BASE,
    ),
  ).toEqual({
    via: 'element',
    media: {
      kind: 'video',
      url: 'https://site.test/v.webm',
      mime: 'video/webm',
      poster: 'https://site.test/p.jpg',
      width: 640,
    },
  });
  expect(
    findMedia(item('<iframe src="https://www.youtube.com/embed/abcDEF123"></iframe>'), BASE)?.media,
  ).toEqual({
    kind: 'video',
    provider: 'youtube',
    providerId: 'abcDEF123',
    embedUrl: 'https://www.youtube-nocookie.com/embed/abcDEF123',
  });
  expect(findMedia(item('<embed type="application/pdf" src="/doc">'), BASE)?.media).toEqual({
    kind: 'pdf',
    url: 'https://site.test/doc',
    mime: 'application/pdf',
  });
  expect(
    findMedia(
      item(
        '<a href="https://ads.test/x">ad</a><iframe src="https://googleads.g.doubleclick.net/x"></iframe>',
      ),
      BASE,
    ),
  ).toBeNull();
  expect(
    findMedia(
      item('<h3><a href="/post/1">Post</a></h3><a href="/files/a.pdf">attachment</a>'),
      BASE,
    ),
  ).toBeNull();
});

test('itemKind and feedType', () => {
  expect(itemKind({ media: null, images: 1, textLength: 20 })).toEqual({
    kind: 'image',
    confidence: 0.7,
  });
  expect(itemKind({ media: null, images: 1, textLength: 200 })).toEqual({
    kind: 'post',
    confidence: 0.6,
  });
  expect(feedType(['video', 'video', 'video', 'video', 'post']).type).toBe('video');
  expect(feedType(['video', 'post', 'image']).type).toBe('mixed');
  expect(feedType([]).type).toBe('post');
});

test('extractContent never mutates the element', () => {
  const doc = loadFixture('mixed-feed');
  const before = domSnapshot(doc);
  for (const el of doc.querySelectorAll('article')) extractContent(el, { baseUrl: doc.URL });
  expect(domSnapshot(doc)).toBe(before);
});

test.each([
  'social-feed',
  'search-results',
  'product-grid',
  'blog-list',
  'two-feeds',
  'nested-feeds',
  'css-modules',
  'infinite-base',
  'paginated-1',
])('v1 fixture %s is a post feed', async (name) => {
  const doc = loadFixture(name);
  const feed = openFeed(doc, createProfile({ url: doc.URL, feeds: await detectFeeds(doc) }), {
    live: false,
  });
  expect(feedType(feed.items().map((i) => i.content().kind)).type).toBe('post');
});
