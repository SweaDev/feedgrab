import { expect, test } from 'bun:test';
import { framePanel, type PanelPosition } from '../../../src/overlay/frame';
import { scrollToTop, topInset } from '../../../src/overlay/scroll';
import { loadFixture } from '../../helpers/dom';

const rect = (top: number, height: number, left = 0, width = 300) =>
  ({
    top,
    height,
    bottom: top + height,
    left,
    width,
    right: left + width,
    x: left,
    y: top,
  }) as DOMRect;

test('framePanel adds a header, collapses, and moves with the arrow keys inside the viewport', () => {
  const doc = loadFixture('social-feed');
  const panel = doc.createElement('div');
  doc.body.append(panel);
  const moves: PanelPosition[] = [];
  const { body, destroy } = framePanel(panel, {
    title: 'Step 1 of 4 · Feeds',
    position: { left: 40, top: 30 },
    onMove: (p) => moves.push(p),
  });
  expect(panel.firstElementChild?.className).toBe('fd-bar');
  expect(panel.querySelector('.fd-title')?.textContent).toBe('Step 1 of 4 · Feeds');
  expect(panel.lastElementChild).toBe(body);
  expect([panel.style.left, panel.style.top, panel.style.right]).toEqual(['40px', '30px', 'auto']);

  const fold = panel.querySelector('[data-fd-action="collapse"]') as HTMLButtonElement;
  fold.click();
  expect(panel.classList.contains('fd-collapsed')).toBe(true);
  expect(fold.getAttribute('aria-expanded')).toBe('false');
  fold.click();
  expect(panel.classList.contains('fd-collapsed')).toBe(false);

  panel.getBoundingClientRect = () => rect(30, 200, 40);
  const bar = panel.firstElementChild as HTMLElement;
  const { KeyboardEvent } = doc.defaultView as unknown as {
    KeyboardEvent: typeof globalThis.KeyboardEvent;
  };
  bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
  bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  expect(moves).toEqual([
    { left: 40, top: 6 },
    { left: 16, top: 30 },
  ]);
  panel.getBoundingClientRect = () => rect(30, 200, 10);
  bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  expect(moves.at(-1)).toEqual({ left: 0, top: 30 });
  destroy();
});

test('scrollToTop leaves room for a fixed site header', () => {
  const doc = loadFixture('social-feed');
  const win = doc.defaultView!;
  const header = doc.createElement('header');
  header.style.position = 'fixed';
  doc.body.prepend(header);
  const item = doc.createElement('article');
  doc.body.append(item);
  header.getBoundingClientRect = () => rect(0, 56, 0, 1024);
  item.getBoundingClientRect = () => rect(0, 300);
  doc.elementsFromPoint = () => [header, doc.body, doc.documentElement];
  expect(topInset(doc)).toBe(56);
  expect(topInset(doc, header)).toBe(0);

  let scrolled = 0;
  item.scrollIntoView = () => {};
  win.scrollBy = ((_x: number, y: number) => {
    scrolled += y;
  }) as typeof win.scrollBy;
  scrollToTop(item);
  expect(scrolled).toBe(-64);
});
