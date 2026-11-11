import { compareDocumentOrder } from '../detect/candidate';
import { linkBySelector } from '../detect/permalink';
import { findReferenceItem, matchStructure } from '../detect/structure';
import { resolveContainers, resolveItems } from '../selector/evaluate';
import { isStableClass } from '../signature/classes';
import type { FeedDescriptor, SampleOptions } from '../types';

/** Tags kept as empty shells: their content is never needed by selectors. */
const EMPTY = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'iframe',
  'object',
  'embed',
  'canvas',
  'svg',
  'video',
  'audio',
  'picture',
  'link',
  'meta',
]);
const KEEP = new Set([
  'id',
  'class',
  'role',
  'href',
  'datetime',
  'rel',
  'itemprop',
  'itemtype',
  'itemscope',
  'name',
  'type',
  'lang',
  'aria-label',
]);
const MAX_ATTR = 200;

type Mode = { items: number; maxText: number; attrs: 'some' | 'all'; classes: 'all' | 'stable' };

function keepAttr(name: string, value: string, mode: Mode): boolean {
  if (/^on/i.test(name) || name === 'style' || name === 'src' || name === 'srcset') return false;
  if (name === 'href' && /^\s*javascript:/i.test(value)) return false;
  if (mode.attrs === 'all') return true;
  return KEEP.has(name) || (name.startsWith('data-') && value.length <= 60);
}

function shell(out: Document, el: Element, mode: Mode): Element {
  const copy = el.namespaceURI
    ? out.createElementNS(el.namespaceURI, el.localName)
    : out.createElement(el.localName);
  for (const { name, value } of Array.from(el.attributes)) {
    if (!keepAttr(name, value, mode)) continue;
    let v = value.length > MAX_ATTR ? value.slice(0, MAX_ATTR) : value;
    if (name === 'class') {
      const cls = v.split(/\s+/).filter((c) => c && (mode.classes === 'all' || isStableClass(c)));
      if (!cls.length) continue;
      v = cls.join(' ');
    }
    copy.setAttribute(name, v);
  }
  return copy;
}

function text(out: Document, value: string, max: number): Node | null {
  const t = value.replace(/\s+/g, ' ');
  if (!t.trim()) return null;
  return out.createTextNode(t.length > max ? `${t.slice(0, max)}…` : t);
}

/** Sanitized deep copy: content of `EMPTY` tags, comments and long text are dropped. */
function deep(out: Document, el: Element, mode: Mode): Element {
  const copy = shell(out, el, mode);
  if (EMPTY.has(el.localName)) return copy;
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === 1) copy.append(deep(out, n as Element, mode));
    else if (n.nodeType === 3) {
      const t = text(out, n.nodeValue ?? '', mode.maxText);
      if (t) copy.append(t);
    }
  }
  return copy;
}

/**
 * Copies `el` keeping only the paths to `targets` (deep-copied). Siblings before a path become
 * empty shells so positional selectors still count them; later siblings are dropped.
 */
function paths(out: Document, el: Element, targets: Element[], mode: Mode): Element {
  const copy = shell(out, el, mode);
  const children = Array.from(el.children);
  let last = -1;
  children.forEach((c, i) => {
    if (targets.some((t) => c === t || c.contains(t))) last = i;
  });
  children.slice(0, last + 1).forEach((c) => {
    if (targets.includes(c)) copy.append(deep(out, c, mode));
    else if (targets.some((t) => c.contains(t))) copy.append(paths(out, c, targets, mode));
    else copy.append(shell(out, c, mode));
  });
  return copy;
}

function build(doc: Document, items: Element[], mode: Mode): Document {
  const out = doc.implementation.createHTMLDocument('');
  const root = paths(out, doc.documentElement, items, mode);
  out.removeChild(out.documentElement);
  out.appendChild(root);
  return out;
}

/** Whether the sample still yields the items (and their permalinks) under `d`. */
function verify(sample: Document, d: FeedDescriptor, items: Element[]): boolean {
  try {
    // Items skipped between sampled ones are empty shells; only copied items count.
    const found = resolveContainers(sample, d)
      .flatMap((c) => resolveItems(c, d))
      .filter((el) => el.childNodes.length > 0);
    if (found.length < items.length) return false;
    const sel = d.permalink;
    const structure = d.structure;
    return items.every((el, i) => {
      const copy = found[i];
      if (!copy) return false;
      if (sel && linkBySelector(el, sel) && !linkBySelector(copy, sel)) return false;
      return !structure || !matchStructure(el, structure).ok || matchStructure(copy, structure).ok;
    });
  } catch {
    return false;
  }
}

const bytes = (s: string) => new globalThis.TextEncoder().encode(s).length;

/** The sampled items: the reference item plus the first others, in document order. */
function pick(all: Element[], n: number, ref: Element | undefined): Element[] {
  if (!ref) return all.slice(0, n);
  return [ref, ...all.filter((el) => el !== ref).slice(0, n - 1)].sort(compareDocumentOrder);
}

/**
 * A small, stripped-down HTML copy of one feed: the path from `<html>` to some of its items
 * (the reference item, see `SampleOptions.reference`, and the first others), with
 * scripts, styles, media, inline styles, event handlers and long text removed. Use it to check
 * edited selectors later without the live page (parse it with `DOMParser` or `parseHtml`).
 * Returns null when the feed has no items or no sample fits `maxBytes`. Never changes `doc`.
 */
export function captureSample(
  doc: Document,
  descriptor: FeedDescriptor,
  opts: SampleOptions = {},
): string | null {
  const want = Math.max(1, opts.items ?? 2);
  const maxBytes = opts.maxBytes ?? 20000;
  const maxText = opts.maxText ?? 80;
  let all: Element[];
  try {
    all = resolveContainers(doc, descriptor).flatMap((c) => resolveItems(c, descriptor));
  } catch {
    return null;
  }
  if (!all.length) return null;
  const structure = descriptor.structure;
  const at = structure ? findReferenceItem(all, structure) : -1;
  const ref =
    opts.reference && all.includes(opts.reference) ? opts.reference : at >= 0 ? all[at] : undefined;
  const tries: Mode[] = [];
  for (let n = Math.min(want, all.length); n >= 1; n--) {
    for (const attrs of ['some', 'all'] as const) {
      tries.push({ items: n, maxText, attrs, classes: 'all' });
      tries.push({ items: n, maxText: Math.min(maxText, 30), attrs, classes: 'stable' });
    }
  }
  for (const mode of tries) {
    const items = pick(all, mode.items, ref);
    const sample = build(doc, items, mode);
    if (!verify(sample, descriptor, items)) continue;
    const html = `<!doctype html>${sample.documentElement.outerHTML}`;
    if (bytes(html) <= maxBytes) return html;
  }
  return null;
}
