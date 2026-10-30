import { expect, test } from 'bun:test';
import { BUILTIN_RULES } from '../../../src/exclude/builtin';
import { matchBuiltin, matchSelectorRule } from '../../../src/exclude/rules';
import {
  compareSpecificity,
  cssSpecificity,
  xpathSpecificity,
} from '../../../src/exclude/specificity';
import { loadFixture } from '../../helpers/dom';

test.each([
  ['#a', [1, 0, 0]],
  ['.a.b', [0, 2, 0]],
  ['.a', [0, 1, 0]],
  ['div', [0, 0, 1]],
  [':where(.a)', [0, 0, 0]],
  ['div.post[data-x="1"]:hover::before', [0, 3, 2]],
  [':is(#a, .b) span', [1, 0, 1]],
  [':not(.a.b)', [0, 2, 0]],
  ['article:has(> time)', [0, 0, 2]],
  ['.a, #b, div', [1, 0, 0]],
  [':scope > article', [0, 1, 1]],
  ['li:nth-child(2n+1)', [0, 1, 1]],
] as const)('cssSpecificity(%s)', (sel, expected) => {
  expect(cssSpecificity(sel)).toEqual([...expected]);
});

test('ordering #a > .a.b > .a > div', () => {
  const s = ['#a', '.a.b', '.a', 'div'].map(cssSpecificity);
  for (let i = 0; i < s.length - 1; i++)
    expect(compareSpecificity(s[i]!, s[i + 1]!)).toBeGreaterThan(0);
  expect(compareSpecificity(cssSpecificity('.a'), cssSpecificity('.b'))).toBe(0);
});

test('xpathSpecificity', () => {
  expect(xpathSpecificity('.//div[@class="ad"]/span')).toEqual([0, 2, 2]);
  expect(xpathSpecificity('//article')).toEqual([0, 0, 1]);
});

test('builtins on social-feed', () => {
  const doc = loadFixture('social-feed');
  const posts = Array.from(doc.querySelectorAll('article.post'));
  const byId = Object.fromEntries(BUILTIN_RULES.map((r) => [r.id, r]));
  expect(matchBuiltin(posts[3]!, byId.b_data_ad!).itemMatch).toBe(true);
  expect(matchBuiltin(posts[7]!, byId.b_ad_class!).itemMatch).toBe(true);
  const iframe = matchBuiltin(posts[5]!, byId.b_ad_iframe!);
  expect(iframe.itemMatch).toBe(false);
  expect(iframe.parts.map((p) => p.tagName)).toEqual(['IFRAME']);
  for (const [i, post] of posts.entries()) {
    if (i === 3 || i === 7) continue;
    for (const r of BUILTIN_RULES) expect(matchBuiltin(post, r).itemMatch).toBe(false);
  }
});

test('matchSelectorRule: item and part scopes, css and xpath', () => {
  const doc = loadFixture('social-feed');
  const post = doc.querySelectorAll('article.post')[9]!;
  expect(
    matchSelectorRule(post, {
      kind: 'selector',
      selector: { type: 'css', value: 'span.label' },
      scope: 'item',
    }).itemMatch,
  ).toBe(true);
  expect(
    matchSelectorRule(post, {
      kind: 'selector',
      selector: { type: 'xpath', value: './/span' },
      scope: 'item',
    }).itemMatch,
  ).toBe(true);
  const parts = matchSelectorRule(post, {
    kind: 'selector',
    selector: { type: 'css', value: 'img, article' },
    scope: 'part',
  }).parts;
  expect(parts.map((p) => p.tagName)).toEqual(['IMG']);
  expect(
    matchSelectorRule(post, {
      kind: 'selector',
      selector: { type: 'css', value: '[[' },
      scope: 'item',
    }).itemMatch,
  ).toBe(false);
});
