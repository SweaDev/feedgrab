import { expect, test } from 'bun:test';
import { registerProvider, resolveProvider } from '../../../src/content/providers';
import { absoluteSrcset, absoluteUrl, urlExtension } from '../../../src/content/url';

test('absoluteUrl keeps only http(s)', () => {
  expect(absoluteUrl('/a?b=1', 'https://x.test/p/')).toBe('https://x.test/a?b=1');
  expect(absoluteUrl('javascript:alert(1)', 'https://x.test/')).toBeNull();
  expect(absoluteUrl('#top', 'https://x.test/')).toBeNull();
  expect(absoluteUrl('data:image/png;base64,AA', 'https://x.test/')).toBeNull();
  expect(absoluteUrl('', 'https://x.test/')).toBeNull();
});

test('absoluteSrcset and urlExtension', () => {
  expect(absoluteSrcset('a.jpg 1x, data:x 2x, /b.jpg 640w', 'https://x.test/i/')).toBe(
    'https://x.test/i/a.jpg 1x, https://x.test/b.jpg 640w',
  );
  expect(urlExtension('https://x.test/v/clip.MP4?x=1')).toBe('mp4');
  expect(urlExtension('https://x.test/v.d/clip')).toBe('');
});

test.each([
  [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&pp=abc',
    'youtube',
    'dQw4w9WgXcQ',
    'video',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  ],
  [
    'https://youtu.be/dQw4w9WgXcQ?t=3',
    'youtube',
    'dQw4w9WgXcQ',
    'video',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  ],
  [
    'https://m.youtube.com/shorts/abcDEF123',
    'youtube',
    'abcDEF123',
    'video',
    'https://www.youtube-nocookie.com/embed/abcDEF123',
  ],
  [
    'https://www.youtube.com/embed/abcDEF123',
    'youtube',
    'abcDEF123',
    'video',
    'https://www.youtube-nocookie.com/embed/abcDEF123',
  ],
  [
    'https://vimeo.com/76979871',
    'vimeo',
    '76979871',
    'video',
    'https://player.vimeo.com/video/76979871',
  ],
  [
    'https://player.vimeo.com/video/76979871?h=1',
    'vimeo',
    '76979871',
    'video',
    'https://player.vimeo.com/video/76979871',
  ],
  [
    'https://www.dailymotion.com/video/x8abcd',
    'dailymotion',
    'x8abcd',
    'video',
    'https://www.dailymotion.com/embed/video/x8abcd',
  ],
  [
    'https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk',
    'spotify',
    'episode/4rOoJ6Egrf8K2IrywzwOMk',
    'audio',
    'https://open.spotify.com/embed/episode/4rOoJ6Egrf8K2IrywzwOMk',
  ],
  [
    'https://open.spotify.com/intl-de/track/abcd1234',
    'spotify',
    'track/abcd1234',
    'audio',
    'https://open.spotify.com/embed/track/abcd1234',
  ],
  [
    'https://soundcloud.com/artist/song-name',
    'soundcloud',
    'artist/song-name',
    'audio',
    'https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fartist%2Fsong-name',
  ],
])('resolveProvider(%s)', (url, provider, id, kind, embedUrl) => {
  expect(resolveProvider(url)).toEqual({ provider, id, kind, embedUrl } as never);
});

test('direct files and unknown URLs', () => {
  expect(resolveProvider('https://cdn.test/ep1.mp3')).toEqual({
    provider: 'file',
    id: 'https://cdn.test/ep1.mp3',
    kind: 'audio',
    mime: 'audio/mpeg',
  });
  expect(resolveProvider('https://x.test/paper.pdf')?.kind).toBe('pdf');
  expect(resolveProvider('https://x.test/post/1')).toBeNull();
  expect(resolveProvider('https://www.youtube.com/@channel')).toBeNull();
  expect(resolveProvider('https://soundcloud.com/discover/sets')).toBeNull();
  expect(resolveProvider('ftp://x.test/a.mp4')).toBeNull();
  expect(resolveProvider('not a url')).toBeNull();
});

test('registerProvider is checked first and can be removed', () => {
  const off = registerProvider({
    name: 'tube',
    match: (u) => (u.hostname === 'tube.test' ? { id: u.pathname.slice(1), kind: 'video' } : null),
  });
  expect(resolveProvider('https://tube.test/abc')).toEqual({
    provider: 'tube',
    id: 'abc',
    kind: 'video',
  });
  off();
  expect(resolveProvider('https://tube.test/abc')).toBeNull();
});
