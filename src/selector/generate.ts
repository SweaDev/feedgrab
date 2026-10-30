import { isStableClass, isStableToken, stableClasses } from '../signature/classes';
import type { Selector } from '../types';

/** Attributes considered stable enough for selectors (never `data-fixture-*`). */
export const STABLE_ATTRS = [
  'role',
  'data-testid',
  'data-test',
  'aria-label',
  'itemtype',
  'itemprop',
];

/** `CSS.escape`, implemented locally (no global `CSS`). */
export function cssEscape(value: string): string {
  let out = '';
  const len = value.length;
  for (let i = 0; i < len; i++) {
    const ch = value.charAt(i);
    const code = value.charCodeAt(i);
    if (code === 0) out += '�';
    else if (
      (code >= 0x1 && code <= 0x1f) ||
      code === 0x7f ||
      (i === 0 && code >= 0x30 && code <= 0x39) ||
      (i === 1 && code >= 0x30 && code <= 0x39 && value.charCodeAt(0) === 0x2d)
    )
      out += `\\${code.toString(16)} `;
    else if (i === 0 && len === 1 && code === 0x2d) out += `\\${ch}`;
    else if (
      code >= 0x80 ||
      code === 0x2d ||
      code === 0x5f ||
      (code >= 0x30 && code <= 0x39) ||
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a)
    )
      out += ch;
    else out += `\\${ch}`;
  }
  return out;
}

function attrValue(v: string): string {
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Simple selectors for one element, most preferred first. */
function simpleCandidates(el: Element): string[] {
  const tag = el.tagName.toLowerCase();
  const out: string[] = [];
  const id = el.getAttribute('id');
  if (id && isStableToken(id)) out.push(`#${cssEscape(id)}`);
  const classes = stableClasses(el).map((c) => `.${cssEscape(c)}`);
  out.push(...classes);
  for (const name of STABLE_ATTRS) {
    const v = el.getAttribute(name);
    if (v && v.length <= 60) out.push(`[${name}=${attrValue(v)}]`);
  }
  if (classes.length) out.push(tag + classes.join(''));
  out.push(tag);
  return out;
}

function uniqueIn(doc: Document, sel: string, el: Element): boolean {
  try {
    const found = doc.querySelectorAll(sel);
    return found.length === 1 && found[0] === el;
  } catch {
    return false;
  }
}

function nthChild(el: Element): string {
  const parent = el.parentElement;
  const index = parent ? Array.from(parent.children).indexOf(el) + 1 : 1;
  return `${el.tagName.toLowerCase()}:nth-child(${index})`;
}

/** Best simple selector distinguishing `el` among its siblings. */
function levelSelector(el: Element): string {
  const parent = el.parentElement;
  if (!parent) return el.tagName.toLowerCase();
  const siblings = Array.from(parent.children);
  for (const cand of simpleCandidates(el)) {
    try {
      if (siblings.filter((s) => s.matches(cand)).length === 1) return cand;
    } catch {}
  }
  return nthChild(el);
}

/** `tag:nth-child(n)` chain from `root` (inclusive) down to `el`. */
export function buildPathSelector(el: Element, root: Element): string {
  const parts: string[] = [];
  for (let cur: Element | null = el; cur && cur !== root; cur = cur.parentElement) {
    parts.unshift(nthChild(cur));
  }
  parts.unshift(root.tagName.toLowerCase());
  return parts.join(' > ');
}

/** Shortest unique selector built from stable ids, classes, attributes and tags. */
function findUnique(el: Element): string {
  const doc = el.ownerDocument;
  for (const cand of simpleCandidates(el)) if (uniqueIn(doc, cand, el)) return cand;
  const body = doc.body;
  let path = levelSelector(el);
  for (let cur = el.parentElement; cur; cur = cur.parentElement) {
    if (uniqueIn(doc, path, el)) return path;
    if (cur === body || cur === doc.documentElement) break;
    const unique = simpleCandidates(cur).find((c) => uniqueIn(doc, `${c} ${path}`, el));
    if (unique) return `${unique} ${path}`;
    path = `${levelSelector(cur)} > ${path}`;
  }
  const rooted = `body > ${path}`;
  if (uniqueIn(doc, rooted, el)) return rooted;
  throw new Error('no unique selector');
}

/**
 * Robust CSS selector for a container: a stable unique `#id`, else the shortest unique
 * selector from stable classes/attributes/tags, else an `nth-child` path.
 */
export function containerSelector(el: Element): Selector {
  const doc = el.ownerDocument;
  const id = el.getAttribute('id');
  if (id && isStableToken(id) && uniqueIn(doc, `#${cssEscape(id)}`, el)) {
    return { type: 'css', value: `#${cssEscape(id)}` };
  }
  try {
    return { type: 'css', value: findUnique(el) };
  } catch {
    return { type: 'css', value: buildPathSelector(el, doc.body ?? doc.documentElement) };
  }
}

function dominantTag(items: Element[]): string {
  const counts = new Map<string, number>();
  for (const el of items) {
    const t = el.tagName.toLowerCase();
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? '*';
}

/**
 * Item selector relative to the container: `:scope > tag` when sibling extras are few
 * (so injected ads still show up as items), else `:scope > tag.shared.classes`.
 */
export function itemSelector(container: Element, items: Element[]): Selector {
  const tag = dominantTag(items);
  const shared = items
    .map((el) => stableClasses(el))
    .reduce<string[] | null>((acc, cls) => (acc ? acc.filter((c) => cls.includes(c)) : cls), null);
  const classes = (shared ?? [])
    .filter(isStableClass)
    .sort()
    .map((c) => `.${cssEscape(c)}`)
    .join('');
  const direct = items.every((el) => el.parentElement === container);
  if (!direct) return { type: 'css', value: `:scope ${tag}${classes}` };
  const s1 = `:scope > ${tag}`;
  const set = new Set(items);
  const extra = Array.from(container.children).filter(
    (c) => c.tagName.toLowerCase() === tag && !set.has(c),
  );
  if (extra.length <= 0.5 * items.length || !classes) return { type: 'css', value: s1 };
  return { type: 'css', value: s1 + classes };
}
