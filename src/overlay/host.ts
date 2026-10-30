import { BASE_CSS } from './styles';
import { type OverlayTheme, resolveTheme, themeToCss } from './theme';

/** The mounted overlay host. */
export type OverlayHost = {
  host: HTMLElement;
  root: ShadowRoot;
  layer: HTMLElement;
  panel: HTMLElement;
  unmount(): void;
};

/**
 * Mounts the overlay: one `<div data-feed-detector-overlay>` with an open shadow root,
 * appended to `documentElement`. This is the only node the overlay adds to the page.
 */
export function mountHost(
  doc: Document,
  opts: { theme?: OverlayTheme; customCss?: string } = {},
): OverlayHost {
  const theme = resolveTheme(opts.theme);
  const host = doc.createElement('div');
  host.setAttribute('data-feed-detector-overlay', '');
  host.setAttribute(
    'style',
    `position: fixed; inset: 0; pointer-events: none; z-index: var(--fd-z, ${theme.zIndex});`,
  );
  const root = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = `${themeToCss(opts.theme)}\n${BASE_CSS}\n${opts.customCss ?? ''}`;
  const layer = doc.createElement('div');
  layer.className = 'fd-layer';
  const panel = doc.createElement('div');
  panel.className = `fd-panel fd-pos-${theme.panelPosition}`;
  root.append(style, layer, panel);
  doc.documentElement.appendChild(host);
  return {
    host,
    root,
    layer,
    panel,
    unmount: () => host.remove(),
  };
}

/** True when `el` is (inside) an overlay host. */
export function isOverlayElement(el: Element | null): boolean {
  return !!el?.closest?.('[data-feed-detector-overlay]');
}
