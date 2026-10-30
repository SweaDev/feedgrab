import { expect, test } from 'bun:test';
import { isParsedDocument } from '../../../src/env/dom';
import { getXPathEngine } from '../../../src/selector/xpath';
import { disposeDocument, parseHtml } from '../../../src/server';
import { domSnapshot } from '../../helpers/snapshot';

test('parseHtml keeps the url, tags the document and parses markup', () => {
  const doc = parseHtml(
    '<html><body><ul><li>a</li><li>b</li></ul></body></html>',
    'https://x.test/p',
  );
  expect(doc.URL).toBe('https://x.test/p');
  expect(isParsedDocument(doc)).toBe(true);
  expect(doc.querySelectorAll('li').length).toBe(2);
  disposeDocument(doc);
});

test('parseHtml does not run scripts', () => {
  const doc = parseHtml('<body><script>document.body.setAttribute("ran","1")</script></body>');
  expect(doc.body.hasAttribute('ran')).toBe(false);
});

test('an xpath engine is available after parseHtml when native evaluate is missing', () => {
  const doc = parseHtml('<body><p>x</p></body>');
  if (typeof doc.evaluate !== 'function') expect(getXPathEngine()).not.toBeNull();
});

test('domSnapshot drops the overlay host', () => {
  const doc = parseHtml('<body><p>x</p></body>');
  const before = domSnapshot(doc);
  const host = doc.createElement('div');
  host.setAttribute('data-feed-detector-overlay', '');
  doc.documentElement.appendChild(host);
  expect(domSnapshot(doc)).toBe(before);
});
