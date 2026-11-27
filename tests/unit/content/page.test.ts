import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractArticle } from '../../../src/content/article';
import { describePage } from '../../../src/content/page';
import { parseHtml } from '../../../src/server';
import { FIXTURES } from '../../helpers/dom';
import { domSnapshot } from '../../helpers/snapshot';

const page = (name: string, url: string) =>
  parseHtml(readFileSync(join(FIXTURES, 'pages', `${name}.html`), 'utf8'), url);

test('describePage reads a video page: JSON-LD first, then Open Graph and the provider', () => {
  const doc = page('page-video', 'https://www.youtube.com/watch?v=aB3dE5fG7hI&pp=x');
  const before = domSnapshot(doc);
  expect(describePage(doc, doc.URL)).toEqual({
    kind: 'video',
    url: 'https://www.youtube.com/watch?v=aB3dE5fG7hI',
    siteName: 'Tube',
    oembedUrl:
      'https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DaB3dE5fG7hI&format=json',
    title: 'Harbor lights at dusk',
    author: 'Maker Channel',
    publishedAt: '2026-10-04T08:00:00.000Z',
    text: 'A slow walk along the harbor as the lights come on.',
    images: [
      { src: 'https://i.ytimg.test/vi/aB3dE5fG7hI/hqdefault.jpg' },
      { src: 'https://i.ytimg.test/vi/aB3dE5fG7hI/maxresdefault.jpg' },
    ],
    confidence: 0.95,
    media: {
      kind: 'video',
      embedUrl: 'https://www.youtube-nocookie.com/embed/aB3dE5fG7hI',
      provider: 'youtube',
      providerId: 'aB3dE5fG7hI',
      poster: 'https://i.ytimg.test/vi/aB3dE5fG7hI/hqdefault.jpg',
      duration: 754,
      width: 1280,
      height: 720,
    },
  });
  expect(domSnapshot(doc)).toBe(before);
});

test('describePage reads an article from meta tags', () => {
  const doc = page('page-article', 'https://blog.test/canoe');
  const d = describePage(doc, doc.URL);
  expect(d).toMatchObject({
    kind: 'post',
    url: 'https://blog.test/canoe',
    title: 'Building a cedar canoe | The Workshop Blog',
    author: 'Ana Ruiz',
    publishedAt: '2026-09-12T10:00:00.000Z',
    text: 'Three winters, forty strips of cedar and one very patient neighbor.',
    images: [{ src: 'https://blog.test/img/canoe.jpg' }],
    siteName: 'The Workshop Blog',
    confidence: 0.8,
  });
  expect(d.media).toBeUndefined();
});

test('describePage: audio element and PDF embed pages, bare pages', () => {
  const audio = parseHtml(
    '<html><head><title>Ep 1</title></head><body><audio src="/ep1.mp3"></audio></body></html>',
    'https://pod.test/ep/1',
  );
  expect(describePage(audio, audio.URL).media).toEqual({
    kind: 'audio',
    url: 'https://pod.test/ep1.mp3',
    mime: 'audio/mpeg',
  });
  const pdf = parseHtml(
    '<html><body><embed type="application/pdf" src="/paper.pdf"></body></html>',
    'https://pdf.test/p',
  );
  expect(describePage(pdf, pdf.URL)).toMatchObject({
    kind: 'pdf',
    media: { kind: 'pdf', url: 'https://pdf.test/paper.pdf' },
  });
  const bare = parseHtml(
    '<html><head><title>Hi</title></head><body><p>x</p></body></html>',
    'https://x.test/',
  );
  expect(describePage(bare, bare.URL)).toEqual({
    kind: 'post',
    url: 'https://x.test/',
    title: 'Hi',
    images: [],
    confidence: 0.5,
  });
});

test('extractArticle finds the article on a copy and leaves the page alone', () => {
  const doc = page('page-article', 'https://blog.test/canoe');
  const before = domSnapshot(doc);
  const a = extractArticle(doc);
  expect(a?.title).toContain('Building a cedar canoe');
  expect(a?.text).toContain('Station molds');
  expect(a?.html).toContain('<p>');
  expect(a?.html).not.toContain('Popular');
  expect(a?.byline).toBe('Ana Ruiz');
  expect(domSnapshot(doc)).toBe(before);
  expect(extractArticle(parseHtml('<html><body></body></html>', 'https://x.test/'))).toBeNull();
});
