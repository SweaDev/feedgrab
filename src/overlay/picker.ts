import { hasLayout, isElement } from '../env/dom';
import { FeedDetectorError } from '../errors';
import { createHighlighter } from './highlighter';
import { isOverlayElement, mountHost } from './host';

/** Options for `pickElement`. */
export type PickOptions = {
  filter?: (el: Element) => boolean;
  signal?: AbortSignal;
  /** Hover feedback; default: a temporary overlay box (rendered pages only). */
  onHover?: (el: Element | null) => void;
};

function eventTarget(e: Event): Element | null {
  const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
  const first = path.find(isElement) ?? e.target;
  return isElement(first) ? first : null;
}

/**
 * Lets the user pick an element with the mouse (capture-phase listeners; the page never
 * receives the click). Escape or an aborted `signal` rejects with `OVERLAY_CANCELLED`.
 * @example const el = await pickElement(document); const d = inspectFromElement(el);
 */
export function pickElement(doc: Document, opts: PickOptions = {}): Promise<Element> {
  return new Promise<Element>((resolve, reject) => {
    let hover = opts.onHover;
    let cleanupHover = () => {};
    if (!hover && hasLayout(doc)) {
      const mounted = mountHost(doc);
      const hl = createHighlighter(doc, mounted.layer);
      hover = (el) => hl.set(el ? [{ el, kind: 'hover' }] : []);
      cleanupHover = () => {
        hl.destroy();
        mounted.unmount();
      };
    }
    const accept = (el: Element | null) =>
      !!el &&
      !isOverlayElement(el) &&
      el !== doc.documentElement &&
      (!opts.filter || opts.filter(el));

    const onMove = (e: Event) => {
      const el = eventTarget(e);
      hover?.(accept(el) ? el : null);
    };
    const onClick = (e: Event) => {
      const el = eventTarget(e);
      if (!accept(el)) return;
      e.preventDefault();
      e.stopPropagation();
      settle();
      resolve(el as Element);
    };
    const onKey = (e: Event) => {
      if ((e as KeyboardEvent).key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      cancel();
    };
    const cancel = () => {
      settle();
      reject(new FeedDetectorError('OVERLAY_CANCELLED', 'Element picking was cancelled'));
    };
    const settle = () => {
      doc.removeEventListener('mouseover', onMove, true);
      doc.removeEventListener('mousemove', onMove, true);
      doc.removeEventListener('click', onClick, true);
      doc.removeEventListener('keydown', onKey, true);
      opts.signal?.removeEventListener('abort', cancel);
      hover?.(null);
      cleanupHover();
    };

    if (opts.signal?.aborted) {
      cancel();
      return;
    }
    doc.addEventListener('mouseover', onMove, true);
    doc.addEventListener('mousemove', onMove, true);
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('keydown', onKey, true);
    opts.signal?.addEventListener('abort', cancel);
  });
}
