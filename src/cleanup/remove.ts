import type { FeedItem } from '../types';

/** Removal mode: `hide` (attribute + `display:none !important`) or `detach` (remove the node). */
export type RemovalMode = 'hide' | 'detach';

/** Handle returned by the removal helpers. `restore()` is false when the node can't be put back. */
export type RemovalHandle = { restore(): boolean };

const MARKER = 'data-fd-removed';
const active = new WeakMap<Element, Map<RemovalMode, RemovalHandle>>();

function hide(el: Element, kind: 'item' | 'part'): () => boolean {
  const style = (el as HTMLElement).style;
  const hadStyle = el.hasAttribute('style');
  const prevValue = style.getPropertyValue('display');
  const prevPriority = style.getPropertyPriority('display');
  const prevMarker = el.getAttribute(MARKER);
  style.setProperty('display', 'none', 'important');
  el.setAttribute(MARKER, kind);
  return () => {
    if (prevValue) style.setProperty('display', prevValue, prevPriority);
    else style.removeProperty('display');
    if (!hadStyle && !el.getAttribute('style')) el.removeAttribute('style');
    if (prevMarker === null) el.removeAttribute(MARKER);
    else el.setAttribute(MARKER, prevMarker);
    return true;
  };
}

function detach(el: Element, kind: 'item' | 'part'): () => boolean {
  const parent = el.parentNode;
  const next = el.nextSibling;
  const prevMarker = el.getAttribute(MARKER);
  el.setAttribute(MARKER, kind);
  el.remove();
  return () => {
    if (!parent || !(parent as Node).isConnected) return false;
    if (prevMarker === null) el.removeAttribute(MARKER);
    else el.setAttribute(MARKER, prevMarker);
    parent.insertBefore(el, next && next.parentNode === parent ? next : null);
    return true;
  };
}

function removeElement(el: Element, kind: 'item' | 'part', mode: RemovalMode): RemovalHandle {
  let byMode = active.get(el);
  const existing = byMode?.get(mode);
  if (existing) return existing;
  const undo = mode === 'detach' ? detach(el, kind) : hide(el, kind);
  let restored = false;
  const handle: RemovalHandle = {
    restore() {
      if (restored) return true;
      const ok = undo();
      if (ok) {
        restored = true;
        active.get(el)?.delete(mode);
      }
      return ok;
    },
  };
  if (!byMode) {
    byMode = new Map();
    active.set(el, byMode);
  }
  byMode.set(mode, handle);
  return handle;
}

const recorded = new WeakMap<FeedItem, Map<string, RemovalHandle>>();

function record(item: FeedItem, key: string, handle: RemovalHandle): void {
  let map = recorded.get(item);
  if (!map) {
    map = new Map();
    recorded.set(item, map);
  }
  map.set(key, handle);
}

/** Restores every removal recorded on an item (used by `dispose({ restore: true })`). */
export function restoreRecorded(item: FeedItem): void {
  const map = recorded.get(item);
  if (!map) return;
  for (const h of map.values()) h.restore();
  recorded.delete(item);
}

/**
 * Removes a whole item from the page (only when the consumer calls it). Idempotent per mode.
 * @example if (item.status === 'excluded') removeItem(item); // hide
 */
export function removeItem(item: FeedItem, opts: { mode?: RemovalMode } = {}): RemovalHandle {
  const mode = opts.mode ?? 'hide';
  const handle = removeElement(item.element, 'item', mode);
  record(item, `item:${mode}`, handle);
  return handle;
}

/** Removes the item's matched parts. The handle restores every part. */
export function removeParts(item: FeedItem, opts: { mode?: RemovalMode } = {}): RemovalHandle {
  const mode = opts.mode ?? 'hide';
  const handles = item.parts.map((p) => removeElement(p.element, 'part', mode));
  const handle: RemovalHandle = {
    restore: () => handles.map((h) => h.restore()).every(Boolean),
  };
  record(item, `part:${mode}`, handle);
  return handle;
}
