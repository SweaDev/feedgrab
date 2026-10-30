import { expect, test } from 'bun:test';
import { mountHost } from '../../../src/overlay/host';
import { DEFAULT_THEME, themeToCss } from '../../../src/overlay/theme';
import { loadFixture } from '../../helpers/dom';
import { domSnapshot } from '../../helpers/snapshot';

test('themeToCss merges partial themes', () => {
  const css = themeToCss({ colors: { item: '#ff00ff' }, zIndex: 5 });
  expect(css).toContain('--fd-color-item: #ff00ff;');
  expect(css).toContain(`--fd-color-feed: ${DEFAULT_THEME.colors.feed};`);
  expect(css).toContain('--fd-color-panel-bg: #ffffff;');
  expect(css).toContain('--fd-z: 5;');
  expect(css).toContain('--fd-outline-width: 2px;');
  expect(css.startsWith(':host {')).toBe(true);
});

test('mountHost adds exactly one node and unmount removes it', () => {
  const doc = loadFixture('social-feed');
  const before = domSnapshot(doc);
  const count = doc.documentElement.children.length;
  const m = mountHost(doc, { theme: { panelPosition: 'bottom-left' }, customCss: '.x{}' });
  expect(doc.documentElement.children.length).toBe(count + 1);
  expect(m.host.hasAttribute('data-feed-detector-overlay')).toBe(true);
  expect(m.root.mode).toBe('open');
  expect(m.panel.className).toContain('fd-pos-bottom-left');
  expect(m.root.querySelector('style')!.textContent).toContain('.x{}');
  expect(domSnapshot(doc)).toBe(before);
  m.unmount();
  expect(doc.documentElement.children.length).toBe(count);
  expect(doc.documentElement.outerHTML).toContain('timeline');
});
