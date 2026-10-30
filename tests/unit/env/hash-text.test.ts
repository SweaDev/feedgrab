import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { fnv1a32, hashString } from '../../../src/env/hash';
import { normalizeText, textLength } from '../../../src/env/text';

test('hash is stable', () => {
  expect(fnv1a32('')).toBe(0x811c9dc5);
  expect(fnv1a32('abc')).toBe(0x1a47e90b);
  expect(hashString('abc')).toBe((0x1a47e90b).toString(36).padStart(7, '0'));
  expect(hashString('abc')).toHaveLength(7);
  expect(hashString('abc')).toBe(hashString('abc'));
  expect(hashString('abd')).not.toBe(hashString('abc'));
});

test('normalizeText skips scripts/styles, collapses and truncates', () => {
  const win = new Window();
  const d = win.document as unknown as Document;
  d.body.innerHTML =
    '<div id="x">  Hello\n  <b>world</b><script>var a=1</script><style>.a{}</style> again </div>';
  const el = d.getElementById('x')!;
  expect(normalizeText(el)).toBe('Hello world again');
  expect(normalizeText(el, 5)).toBe('Hello');
  expect(textLength(el)).toBe(17);
});
