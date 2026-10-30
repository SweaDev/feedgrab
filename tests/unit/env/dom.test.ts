import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import {
  elementChildren,
  getWindow,
  hasLayout,
  isElement,
  isHiddenStatic,
  isParsedDocument,
} from '../../../src/env/dom';

function doc(html: string): Document {
  const win = new Window({ url: 'https://t.test/' });
  win.document.body.innerHTML = html;
  return win.document as unknown as Document;
}

test('hasLayout is false in happy-dom', () => {
  expect(hasLayout(doc('<p>x</p>'))).toBe(false);
});

test('hidden detection', () => {
  const d = doc(
    '<p id="a" hidden></p><p id="b" aria-hidden="true"></p><p id="c" style="display:none"></p><p id="d" style="visibility:hidden"></p><p id="e"></p>',
  );
  for (const id of ['a', 'b', 'c', 'd']) expect(isHiddenStatic(d.getElementById(id)!)).toBe(true);
  expect(isHiddenStatic(d.getElementById('e')!)).toBe(false);
});

test('element helpers', () => {
  const d = doc('<ul><li>1</li>text<li>2</li></ul>');
  const ul = d.querySelector('ul')!;
  expect(isElement(ul)).toBe(true);
  expect(isElement(ul.firstChild?.nextSibling)).toBe(false);
  expect(elementChildren(ul).length).toBe(2);
  expect(getWindow(d)).not.toBeNull();
  expect(isParsedDocument(d)).toBe(false);
});
