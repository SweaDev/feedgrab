import { expect, test } from 'bun:test';
import { FeedgrabError } from '../../../src/errors';
import { normalizeRule, stableJson } from '../../../src/profile/normalize';
import { createProfile, parseProfile, serializeProfile } from '../../../src/profile/profile';
import type { FeedDescriptor } from '../../../src/types';

const feed: FeedDescriptor = {
  id: 'fd_abc1234',
  container: { type: 'css', value: '.timeline' },
  item: { type: 'css', value: ':scope > article' },
  exclude: [
    { kind: 'selector', selector: { type: 'css', value: '.promoted' }, scope: 'item' },
    { kind: 'llm-text', criteria: 'sponsored posts' },
  ],
  include: [{ kind: 'selector', selector: { type: 'css', value: '.friend' }, scope: 'item' }],
  source: 'heuristic',
  confidence: 0.9,
  confirmed: true,
};

function codeOf(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(FeedgrabError);
    return e as FeedgrabError;
  }
  throw new Error('expected throw');
}

test('createProfile uses host and path, normalizes rules', () => {
  const p = createProfile({ url: 'https://WWW.Example.com:8080/search/foo?q=1', feeds: [feed] });
  expect(p.version).toBe(1);
  expect(p.hostname).toBe('www.example.com:8080');
  expect(p.pathPattern).toBe('/search/foo');
  const rule = p.feeds[0]!.exclude[0]!;
  expect(rule.id).toMatch(/^r_[0-9a-z]{7}$/);
  expect(rule.origin).toBe('user');
});

test('round trip and stable key order', () => {
  const p = createProfile({ url: 'https://example.com/', feeds: [feed] });
  const s = serializeProfile(p);
  expect(parseProfile(s)).toEqual(p);
  const obj = JSON.parse(s);
  const reversed = Object.fromEntries(
    Object.keys(obj)
      .reverse()
      .map((k) => [k, obj[k]]),
  );
  const shuffled = JSON.stringify(reversed);
  expect(shuffled).not.toBe(s);
  expect(serializeProfile(parseProfile(shuffled))).toBe(s);
  expect(s.startsWith('{"feeds":')).toBe(true);
});

test('rule ids are deterministic and origin-insensitive to default', () => {
  const a = normalizeRule({ kind: 'llm-text', criteria: 'ads' });
  const b = normalizeRule({ kind: 'llm-text', criteria: 'ads', origin: 'user' });
  const c = normalizeRule({ kind: 'llm-text', criteria: 'ads', origin: 'llm' });
  expect(a.id).toBe(b.id);
  expect(a.id).not.toBe(c.id);
  expect(normalizeRule({ ...a }).id).toBe(a.id);
  expect(stableJson({ b: 1, a: { d: 2, c: undefined } })).toBe('{"a":{"d":2},"b":1}');
});

test('invalid profile → INVALID_PROFILE with issues', () => {
  const e = codeOf(() => parseProfile(JSON.stringify({ version: 1, hostname: '', feeds: 'x' })));
  expect(e.code).toBe('INVALID_PROFILE');
  expect((e.details as { issues: unknown[] }).issues.length).toBeGreaterThan(0);
  expect(codeOf(() => parseProfile('{not json')).code).toBe('INVALID_PROFILE');
  const llmInclude = createProfile({ url: 'https://e.com/', feeds: [feed] });
  const bad = JSON.parse(serializeProfile(llmInclude));
  bad.feeds[0].include.push({ kind: 'llm-text', criteria: 'x' });
  expect(codeOf(() => parseProfile(JSON.stringify(bad))).code).toBe('INVALID_PROFILE');
});

test('version 99 → UNSUPPORTED_PROFILE_VERSION', () => {
  const e = codeOf(() =>
    parseProfile(JSON.stringify({ version: 99, hostname: 'e.com', pathPattern: '/', feeds: [] })),
  );
  expect(e.code).toBe('UNSUPPORTED_PROFILE_VERSION');
});
