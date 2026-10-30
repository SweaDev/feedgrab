import { getWindow, hasLayout } from '../env/dom';
import type { HighlightKind } from './theme';

/** One highlighted element. */
export type HighlightEntry = { el: Element; kind: HighlightKind | 'hover'; label?: string };

/** Draws positioned outline boxes over page elements without touching them. */
export type Highlighter = {
  set(entries: HighlightEntry[]): void;
  refresh(): void;
  destroy(): void;
};

/** Creates a highlighter that draws into the overlay layer (no-op without layout). */
export function createHighlighter(doc: Document, layer: HTMLElement): Highlighter {
  const win = getWindow(doc);
  const layout = hasLayout(doc);
  let entries: HighlightEntry[] = [];
  let frame: number | null = null;
  let destroyed = false;

  const draw = () => {
    frame = null;
    if (destroyed) return;
    layer.replaceChildren();
    if (!layout) return;
    for (const e of entries) {
      if (!e.el.isConnected) continue;
      const r = e.el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const box = doc.createElement('div');
      box.className = `fd-box fd-${e.kind}`;
      box.setAttribute('data-fd-kind', e.kind);
      box.setAttribute(
        'style',
        `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;`,
      );
      if (e.label) {
        const label = doc.createElement('span');
        label.className = 'fd-label';
        label.textContent = e.label;
        box.appendChild(label);
      }
      layer.appendChild(box);
    }
  };

  const schedule = () => {
    if (destroyed || frame !== null || !layout) return;
    if (win?.requestAnimationFrame) frame = win.requestAnimationFrame(draw);
    else draw();
  };

  const MO = win?.MutationObserver;
  const mo = layout && MO ? new MO(schedule) : null;
  if (mo && doc.body) mo.observe(doc.body, { childList: true, subtree: true, attributes: true });
  if (layout && win) {
    win.addEventListener('scroll', schedule, true);
    win.addEventListener('resize', schedule);
  }

  return {
    set(next) {
      entries = next;
      if (layout) draw();
    },
    refresh: schedule,
    destroy() {
      destroyed = true;
      mo?.disconnect();
      if (win) {
        win.removeEventListener('scroll', schedule, true);
        win.removeEventListener('resize', schedule);
        if (frame !== null) win.cancelAnimationFrame?.(frame);
      }
      layer.replaceChildren();
    },
  };
}
