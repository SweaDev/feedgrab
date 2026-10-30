import { expect, test } from 'bun:test';
import { isStableClass, isStableToken, stableClasses } from '../../../src/signature/classes';
import {
  dominantSignature,
  isSameKind,
  isSameKindSig,
  shape,
  sigL1,
  sigL2,
} from '../../../src/signature/signature';
import { loadFixture } from '../../helpers/dom';

test.each(['post', 'card', 'result', 'story-item', 'update-list', 'timeline'])(
  'stable: %s',
  (c) => {
    expect(isStableClass(c)).toBe(true);
  },
);

test.each([
  'css-1q2w3e',
  'sc-AxjAm',
  '_post_1x9ab_12',
  'md:flex',
  'is-active',
  'jsx-123456',
  'a1b2c3d',
  'card__x9f8e7',
  'selected',
  'w-[200px]',
])('unstable: %s', (c) => {
  expect(isStableClass(c)).toBe(false);
});

test('state classes are stable tokens but not stable classes', () => {
  expect(isStableToken('is-active')).toBe(true);
  expect(isStableClass('is-active')).toBe(false);
});

test('signatures on product-grid', () => {
  const doc = loadFixture('product-grid');
  const cards = Array.from(doc.querySelectorAll('.grid > div'));
  expect(stableClasses(cards[0]!)).toEqual(['card']);
  expect(sigL1(cards[0]!)).toBe('div.card');
  expect(sigL1(cards[4]!)).toBe('div.card.sponsored');
  expect(isSameKind(cards[0]!, cards[4]!)).toBe(true);
  expect(isSameKindSig('div.card', 'div.card.sponsored')).toBe(true);
  expect(isSameKindSig('div.card', 'section.card')).toBe(false);
  expect(shape(cards[0]!)).toBe('A,H3,P,SPAN');
  expect(sigL2(cards[0]!)).toBe(sigL2(cards[1]!));
  expect(dominantSignature(cards)).toBe('div.card');
});

test('css-modules items are same kind by shape', () => {
  const doc = loadFixture('css-modules');
  const items = Array.from(doc.querySelectorAll('article'));
  expect(stableClasses(items[0]!)).toEqual([]);
  expect(sigL1(items[0]!)).toBe('article');
  expect(isSameKind(items[0]!, items[1]!)).toBe(true);
  const header = doc.querySelector('header')!;
  expect(isSameKind(items[0]!, header)).toBe(false);
});

test('dominantSignature breaks ties lexically', () => {
  const doc = loadFixture('social-feed');
  const a = doc.querySelector('article.post')!;
  const b = doc.querySelector('article.promoted')!;
  expect(dominantSignature([b, a])).toBe('article.post');
});
