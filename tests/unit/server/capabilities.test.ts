import { expect, test } from 'bun:test';
import { getWindow } from '../../../src/env/dom';
import { getXPathEngine } from '../../../src/selector/xpath';
import { parseHtml } from '../../../src/server';

const HTML =
  '<body><div id="feed"><div class="a"><time>1</time></div><div class="a">2</div><span>3</span></div></body>';

function log(name: string, ok: boolean) {
  console.log(`[capability] ${name}: ${ok ? 'yes' : 'NO'}`);
}

test(':scope > child selector', () => {
  const doc = parseHtml(HTML);
  const n = doc.getElementById('feed')!.querySelectorAll(':scope > div').length;
  log(':scope >', n === 2);
  expect(n).toBe(2);
});

test(':has()', () => {
  const doc = parseHtml(HTML);
  let n = -1;
  try {
    n = doc.querySelectorAll('div.a:has(time)').length;
  } catch {}
  log(':has()', n === 1);
  expect(n).toBe(1);
});

test('createTreeWalker + compareDocumentPosition', () => {
  const doc = parseHtml(HTML);
  const walker = doc.createTreeWalker(doc.body, 1);
  let count = 0;
  while (walker.nextNode()) count++;
  const [a, b] = Array.from(doc.querySelectorAll('div.a'));
  const following = (a!.compareDocumentPosition(b!) & 4) !== 0;
  log('createTreeWalker', count === 5);
  log('compareDocumentPosition', following);
  expect(count).toBe(5);
  expect(following).toBe(true);
});

test('MutationObserver fires on getWindow(doc)', async () => {
  const doc = parseHtml(HTML);
  const MO = getWindow(doc)?.MutationObserver;
  expect(typeof MO).toBe('function');
  let fired = 0;
  const mo = new MO!((records) => {
    fired += records.length;
  });
  mo.observe(doc.getElementById('feed')!, { childList: true, subtree: true });
  doc.getElementById('feed')!.appendChild(doc.createElement('div'));
  await new Promise((r) => setTimeout(r, 0));
  mo.disconnect();
  log('MutationObserver', fired > 0);
  expect(fired).toBeGreaterThan(0);
});

test('implementation.createHTMLDocument + innerHTML', () => {
  const doc = parseHtml(HTML);
  const d = doc.implementation.createHTMLDocument('');
  d.documentElement.innerHTML = '<body><ul><li>x</li></ul></body>';
  const ok = d.querySelectorAll('li').length === 1;
  log('createHTMLDocument', ok);
  expect(ok).toBe(true);
});

test('XPath via native evaluate or registered engine', () => {
  const doc = parseHtml(HTML);
  const native = typeof doc.evaluate === 'function';
  let count = 0;
  if (native) {
    try {
      count = doc.evaluate('.//div[@class="a"]', doc.body, null, 7, null).snapshotLength;
    } catch {}
  }
  log('native document.evaluate', count === 2);
  if (count !== 2) {
    const engine = getXPathEngine();
    expect(engine).not.toBeNull();
    count = engine!('.//div[@class="a"]', doc.body).length;
    log('registered xpath engine', count === 2);
  }
  expect(count).toBe(2);
});
