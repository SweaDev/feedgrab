import { expect, test } from 'bun:test';
import { initState, type OverlayState, reduce, toProfile } from '../../../src/overlay/state';
import type { FeedDescriptor, SiteProfile } from '../../../src/types';

const d = (id: string, extra: Partial<FeedDescriptor> = {}): FeedDescriptor => ({
  id,
  container: { type: 'css', value: `.${id}` },
  item: { type: 'css', value: ':scope > div' },
  exclude: [],
  include: [],
  source: 'heuristic',
  confidence: 0.8,
  confirmed: false,
  ...extra,
});

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

const URL = 'https://example.com/search/foo?q=1';

test('initState pre-accepts existing feeds and derives the path pattern', () => {
  const existing: SiteProfile = {
    version: 1,
    hostname: 'example.com',
    pathPattern: '/search/*',
    feeds: [d('a', { confirmed: true })],
  };
  const s = initState([d('a'), d('b')], { url: URL, existing });
  expect(s.proposals.map((p) => [p.id, p.accepted])).toEqual([
    ['a', true],
    ['b', false],
  ]);
  expect(s.pathPattern).toBe('/search/*');
  expect(s.selectedId).toBe('a');
  expect(initState([d('b')], { url: URL }).pathPattern).toBe('/search/foo');
});

test('every action, immutably', () => {
  let s: OverlayState = deepFreeze(initState([d('a'), d('b')], { url: URL }));
  s = deepFreeze(reduce(s, { type: 'select', id: 'b' }));
  expect(s.selectedId).toBe('b');
  s = deepFreeze(reduce(s, { type: 'toggleAccept', id: 'b' }));
  expect(s.proposals[1]!.accepted).toBe(true);
  s = deepFreeze(
    reduce(s, { type: 'setContainer', id: 'b', selector: { type: 'css', value: '#b' } }),
  );
  expect(s.proposals[1]!.container.value).toBe('#b');
  expect(s.proposals[1]!.source).toBe('manual');
  s = deepFreeze(
    reduce(s, { type: 'setItem', id: 'b', selector: { type: 'xpath', value: './li' } }),
  );
  expect(s.proposals[1]!.item).toEqual({ type: 'xpath', value: './li' });
  const rule = {
    kind: 'selector',
    selector: { type: 'css', value: '.promoted' },
    scope: 'item',
  } as const;
  s = deepFreeze(reduce(s, { type: 'addRule', id: 'b', list: 'exclude', rule }));
  s = deepFreeze(reduce(s, { type: 'addRule', id: 'b', list: 'exclude', rule }));
  expect(s.proposals[1]!.exclude.length).toBe(1);
  const ruleId = s.proposals[1]!.exclude[0]!.id!;
  s = deepFreeze(
    reduce(s, {
      type: 'addRule',
      id: 'b',
      list: 'include',
      rule: { ...rule, selector: { type: 'css', value: '.friend' } },
    }),
  );
  expect(s.proposals[1]!.include.length).toBe(1);
  s = deepFreeze(reduce(s, { type: 'removeRule', id: 'b', list: 'exclude', ruleId }));
  expect(s.proposals[1]!.exclude.length).toBe(0);
  s = deepFreeze(reduce(s, { type: 'setPathPattern', pathPattern: '/search/*' }));
  expect(s.pathPattern).toBe('/search/*');
  s = deepFreeze(reduce(s, { type: 'setMode', mode: 'pick-item' }));
  expect(s.mode).toBe('pick-item');
  s = deepFreeze(
    reduce(s, { type: 'addFeedFromDescriptor', descriptor: d('c', { source: 'inspect' }) }),
  );
  expect(s.proposals.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  expect(s.selectedId).toBe('c');
  expect(s.mode).toBe('idle');
  s = deepFreeze(reduce(s, { type: 'removeFeed', id: 'c' }));
  expect(s.proposals.map((p) => p.id)).toEqual(['a', 'b']);
  expect(s.selectedId).toBe('a');
  s = deepFreeze(reduce(s, { type: 'select', id: undefined }));
  expect(s.selectedId).toBeUndefined();
});

test('toProfile keeps only accepted feeds, confirmed, with normalized rule ids', () => {
  let s = initState([d('a'), d('b')], { url: URL });
  s = reduce(s, { type: 'toggleAccept', id: 'b' });
  s = reduce(s, {
    type: 'addRule',
    id: 'b',
    list: 'exclude',
    rule: { kind: 'llm-text', criteria: 'ads' },
  });
  const p = toProfile(s, URL);
  expect(p.hostname).toBe('example.com');
  expect(p.pathPattern).toBe('/search/foo');
  expect(p.feeds.map((f) => f.id)).toEqual(['b']);
  expect(p.feeds[0]!.confirmed).toBe(true);
  expect('accepted' in p.feeds[0]!).toBe(false);
  expect(p.feeds[0]!.exclude[0]!.id).toMatch(/^r_/);
  expect(p.feeds[0]!.exclude[0]!.origin).toBe('user');
});
