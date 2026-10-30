import { expect, test } from 'bun:test';
import { matchProfile, pathMatches } from '../../../src/profile/match';
import type { SiteProfile } from '../../../src/types';

const p = (hostname: string, pathPattern: string): SiteProfile => ({
  version: 1,
  hostname,
  pathPattern,
  feeds: [],
});

test('glob segments', () => {
  expect(pathMatches('/search/*', '/search/foo')).toBe(true);
  expect(pathMatches('/search/*', '/search/foo/bar')).toBe(false);
  expect(pathMatches('/search/*', '/search')).toBe(false);
  expect(pathMatches('/**', '/')).toBe(true);
  expect(pathMatches('/a/**/c', '/a/c')).toBe(true);
  expect(pathMatches('/a/**/c', '/a/x/y/c')).toBe(true);
  expect(pathMatches('/blog/post-*', '/blog/post-12/')).toBe(true);
  expect(pathMatches('/blog/post-*', '/blog/page-12')).toBe(false);
  expect(pathMatches('/search/foo/', '/search/foo?q=1#x')).toBe(true);
});

test('the exact pattern wins over * and **', () => {
  const profiles = [
    p('example.com', '/**'),
    p('example.com', '/search/*'),
    p('example.com', '/search/foo'),
  ];
  expect(matchProfile('https://example.com/search/foo', profiles)?.pathPattern).toBe('/search/foo');
  expect(matchProfile('https://example.com/search/bar', profiles)?.pathPattern).toBe('/search/*');
  expect(matchProfile('https://example.com/', profiles)?.pathPattern).toBe('/**');
});

test('exact host beats *.domain; wildcard matches subdomains only', () => {
  const profiles = [p('*.example.com', '/search/foo'), p('www.example.com', '/**')];
  expect(matchProfile('https://www.example.com/search/foo', profiles)?.hostname).toBe(
    'www.example.com',
  );
  expect(matchProfile('https://m.example.com/search/foo', profiles)?.hostname).toBe(
    '*.example.com',
  );
  expect(matchProfile('https://example.com/search/foo', profiles)).toBeUndefined();
  expect(matchProfile('https://example.com:8080/', [p('example.com', '/**')])).toBeUndefined();
  expect(matchProfile('https://example.com:8080/', [p('example.com:8080', '/**')])).toBeDefined();
});

test('no match → undefined', () => {
  expect(matchProfile('https://other.com/', [p('example.com', '/**')])).toBeUndefined();
  expect(matchProfile(new URL('https://example.com/x'), [])).toBeUndefined();
});

test('ties are resolved lexically', () => {
  const profiles = [p('example.com', '/b-*'), p('example.com', '/a*')];
  expect(matchProfile('https://example.com/b-ab', profiles)?.pathPattern).toBe('/b-*');
  const tie = [p('example.com', '/x*'), p('example.com', '/*y')];
  expect(matchProfile('https://example.com/xy', tie)?.pathPattern).toBe('/*y');
});
