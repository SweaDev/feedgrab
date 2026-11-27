import { expect, test } from 'bun:test';
import { generateSelector } from '../../../src/selector/generate';
import { parseHtml } from '../../../src/server';

const doc = parseHtml(
  `<main id="feed"><article class="post"><div><span>a</span><span class="when">b</span></div><p>x</p><p>y</p></article>
   <article class="post"><div><span>c</span><span class="when">d</span></div><p>z</p></article></main>`,
  'https://g.test/',
);
const [first, second] = Array.from(doc.querySelectorAll('article'));

test('document selector is unique', () => {
  expect(generateSelector(doc.getElementById('feed')!)).toEqual({ type: 'css', value: '#feed' });
  const span = second!.querySelector('.when')!;
  const sel = generateSelector(span).value;
  expect(Array.from(doc.querySelectorAll(sel))).toEqual([span]);
});

test('relative selector finds the element first inside its root, for every item alike', () => {
  for (const [item, target, expected] of [
    [first!, first!.querySelector('.when')!, ':scope .when'],
    [first!, first!.querySelectorAll('p')[1]!, ':scope > p:nth-child(3)'],
    [first!, first!.querySelector('span')!, ':scope span'],
  ] as const) {
    const sel = generateSelector(target, { root: item }).value;
    expect(sel).toBe(expected);
    expect(item.querySelector(sel)).toBe(target);
  }
  expect(generateSelector(first!, { root: first! }).value).toBe(':scope');
});
