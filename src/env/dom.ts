/** Window behind a document, or null (parsed/detached documents may have none). */
export function getWindow(doc: Document): (Window & typeof globalThis) | null {
  return (doc.defaultView as (Window & typeof globalThis) | null) ?? null;
}

/** Element check that works across realms. */
export function isElement(n: unknown): n is Element {
  return typeof n === 'object' && n !== null && (n as Node).nodeType === 1;
}

/** Element children as an array. */
export function elementChildren(el: Element): Element[] {
  return Array.from(el.children);
}

const layoutCache = new WeakMap<Document, boolean>();

/** True when the document is rendered (real layout boxes). Cached per document. */
export function hasLayout(doc: Document): boolean {
  const cached = layoutCache.get(doc);
  if (cached !== undefined) return cached;
  let result = false;
  try {
    const body = doc.body;
    if (body && typeof body.getBoundingClientRect === 'function') {
      const w1 = body.getBoundingClientRect().width;
      const w2 = doc.documentElement?.getBoundingClientRect().width ?? 0;
      result = w1 > 0 || w2 > 0;
    }
  } catch {
    result = false;
  }
  layoutCache.set(doc, result);
  return result;
}

/** Hidden by markup alone: `hidden`, `aria-hidden="true"`, or inline display/visibility. */
export function isHiddenStatic(el: Element): boolean {
  if (el.hasAttribute('hidden')) return true;
  if (el.getAttribute('aria-hidden') === 'true') return true;
  const style = (el as HTMLElement).style;
  if (!style) return false;
  return style.display === 'none' || style.visibility === 'hidden';
}

/** Hidden in the rendered page. Only meaningful when `hasLayout`. */
export function isHiddenRendered(el: Element): boolean {
  const win = el.ownerDocument ? getWindow(el.ownerDocument) : null;
  if (!win || typeof win.getComputedStyle !== 'function') return isHiddenStatic(el);
  const cs = win.getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden') return true;
  const r = el.getBoundingClientRect();
  return r.width === 0 && r.height === 0;
}

/** Tags never considered as feeds or items. */
export const IGNORED_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'HEAD',
  'META',
  'LINK',
  'svg',
  'SVG',
  'PATH',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'CANVAS',
]);

/** Tag set on documents created by `parseHtml`. */
export const PARSED_DOCUMENT = Symbol.for('feed-detector.parsed');

/** True for documents created by `parseHtml`. */
export function isParsedDocument(doc: Document): boolean {
  return (doc as unknown as Record<symbol, unknown>)[PARSED_DOCUMENT] === true;
}
