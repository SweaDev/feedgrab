import { expect, test } from 'bun:test';
import { mountHost } from '../../../src/overlay/host';
import { DARK_THEME, DEFAULT_THEME, themeToCss } from '../../../src/overlay/theme';
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
  expect(m.host.hasAttribute('data-feedgrab-overlay')).toBe(true);
  expect(m.root.mode).toBe('open');
  expect(m.panel.className).toContain('fd-pos-bottom-left');
  expect(m.root.querySelector('style')!.textContent).toContain('.x{}');
  expect(domSnapshot(doc)).toBe(before);
  m.unmount();
  expect(doc.documentElement.children.length).toBe(count);
  expect(doc.documentElement.outerHTML).toContain('timeline');
});

test('color schemes: auto follows prefers-color-scheme, dark and light are fixed, own colors win', () => {
  const auto = themeToCss({ colors: { panelBg: '#123456' } });
  expect(auto).toContain('--fd-color-scheme: light;');
  const dark = auto.slice(auto.indexOf('@media (prefers-color-scheme: dark)'));
  expect(dark).toContain(`--fd-color-panel-fg: ${DARK_THEME.colors.panelFg};`);
  expect(dark).toContain('--fd-color-scheme: dark;');
  expect(dark).not.toContain('--fd-color-panel-bg');
  const fixed = themeToCss({ colorScheme: 'dark', colors: { accent: '#ff0000' } });
  expect(fixed).not.toContain('@media');
  expect(fixed).toContain(`--fd-color-panel-bg: ${DARK_THEME.colors.panelBg};`);
  expect(fixed).toContain('--fd-color-accent: #ff0000;');
  expect(themeToCss({ colorScheme: 'light' })).not.toContain('@media');
});
