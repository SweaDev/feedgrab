import { normalizeText } from '../env/text';
import { evaluateSelector } from '../selector/evaluate';
import { cssEscape } from '../selector/generate';
import { stableClasses } from '../signature/classes';
import type {
  ItemStructure,
  Selector,
  StructureCandidate,
  StructureMatch,
  StructureOptions,
} from '../types';

/** Elements of an item that can be parts of its structure. */
const PARTS =
  'a[href], time, h1, h2, h3, h4, h5, h6, [role="heading"], img, picture, video, p, blockquote, button, [role="button"], [data-testid]';
const ATTRS = ['data-testid', 'data-test', 'itemprop', 'role'];
/** Tags too generic to be a part's selector on their own. */
const GENERIC = new Set(['div', 'span', 'section', 'li']);
/** A more specific selector wins over a broader one that covers at most this much more. */
const TOLERANCE = 0.2;
/** With fewer peers, coverage says too little to suggest required parts. */
const MIN_ITEMS_FOR_REQUIRED = 3;
/** Items with at least this share of the reference's parts are its peers (not ads or headings). */
const PEER_SHARE = 0.5;
const MAX_TEXT = 60;

const round = (n: number) => Math.round(n * 1e4) / 1e4;
const quoted = (v: string) => `"${v.replace(/["\\]/g, '\\$&')}"`;
const css = (value: string): Selector => ({ type: 'css', value });

function first(root: Element, sel: Selector): Element | null {
  try {
    return evaluateSelector(sel, root)[0] ?? null;
  } catch {
    return null;
  }
}

function label(el: Element): string {
  const tag = el.localName;
  const role = el.getAttribute('role');
  if (tag === 'a') return 'link';
  if (tag === 'time') return 'time';
  if (/^h[1-6]$/.test(tag) || role === 'heading') return 'heading';
  if (tag === 'img' || tag === 'picture') return 'image';
  if (tag === 'video') return 'video';
  if (tag === 'p' || tag === 'blockquote') return 'text';
  if (tag === 'button' || role === 'button') return 'button';
  return el.getAttribute('data-testid') ?? tag;
}

/** Ways to describe part `el` of `root`, most specific first; the last one is positional. */
function selectorCandidates(root: Element, el: Element): string[] {
  const tag = el.localName;
  const out: string[] = [];
  for (const attr of ATTRS) {
    const v = el.getAttribute(attr);
    if (v && v.length <= 40) out.push(`${tag}[${attr}=${quoted(v)}]`);
  }
  const classes = stableClasses(el).map((c) => `.${cssEscape(c)}`);
  for (let n = classes.length; n >= 1; n--) out.push(tag + classes.slice(0, n).join(''));
  if (tag === 'a' && el.querySelector('time')) out.push('a:has(time)');
  // Inside a meaningful ancestor: `h3.title a`, `div.actions button`.
  let anc = el.parentElement;
  for (let up = 0; up < 3 && anc && anc !== root; up++, anc = anc.parentElement) {
    const [cls] = stableClasses(anc);
    if (cls) out.push(`${anc.localName}.${cssEscape(cls)} ${tag}`);
    else if (/^h[1-6]$/.test(anc.localName)) out.push(`${anc.localName} ${tag}`);
  }
  if (!GENERIC.has(tag)) out.push(tag);
  const steps: string[] = [];
  for (let n: Element | null = el; n && n !== root; n = n.parentElement) {
    const parent: Element | null = n.parentElement;
    if (!parent) break;
    const same = Array.from(parent.children).filter((c) => c.localName === n?.localName);
    steps.unshift(`${n.localName}:nth-of-type(${same.indexOf(n) + 1})`);
  }
  if (steps.length) out.push(`:scope > ${steps.join(' > ')}`);
  return out;
}

const has = (item: Element, sel: Selector) => first(item, sel) !== null;

function coverage(items: Element[], sel: Selector): number {
  return items.length ? items.filter((it) => has(it, sel)).length / items.length : 0;
}

/**
 * Describes the structure of a well-formed item as parts (links, time, headings, images, text,
 * buttons, `data-testid` elements), each with a selector relative to the item, in document
 * order. The reference's peers are the items with at least half of its parts, which leaves out
 * ads and headings; parts nearly all peers have (`requiredCoverage`) are suggested as required,
 * the rest as optional (a thumbnail only some posts have), so the host can let the user adjust
 * them before saving `{ parts }` as `FeedDescriptor.structure`. Pass the feed's items (a few
 * dozen at most).
 */
export function suggestStructure(
  items: Element[],
  opts: StructureOptions = {},
): StructureCandidate[] {
  const root = opts.reference ?? items[0];
  if (!root) return [];
  const pool = items.length ? items : [root];
  const requiredCoverage = opts.requiredCoverage ?? 0.9;
  const maxParts = opts.maxParts ?? 16;
  const parts: (StructureCandidate & { order: number; positional: boolean })[] = [];
  const seen = new Set<string>();
  Array.from(root.querySelectorAll(PARTS)).forEach((el, order) => {
    const options = selectorCandidates(root, el)
      .filter((value) => first(root, css(value)) === el)
      .map((value) => ({ value, cov: coverage(pool, css(value)) }));
    const best = Math.max(...options.map((o) => o.cov));
    const pick = options.find((o) => o.cov >= best - TOLERANCE);
    if (!pick || seen.has(pick.value)) return;
    seen.add(pick.value);
    const text =
      normalizeText(el, 500) || el.getAttribute('alt') || el.getAttribute('aria-label') || '';
    parts.push({
      selector: css(pick.value),
      required: false,
      label: label(el),
      coverage: round(pick.cov),
      text: text.trim().slice(0, MAX_TEXT),
      order,
      positional: pick.value.startsWith(':scope >'),
    });
  });
  const rank = (p: (typeof parts)[number]) => p.coverage + (p.positional ? 0 : 0.5);
  const kept = parts
    .sort((a, b) => rank(b) - rank(a) || a.order - b.order)
    .slice(0, maxParts)
    .sort((a, b) => a.order - b.order);
  const hits = (it: Element) => kept.filter((p) => has(it, p.selector)).length;
  const peers = pool.filter((it) => it === root || hits(it) >= kept.length * PEER_SHARE);
  if (!peers.includes(root)) peers.push(root);
  return kept.map(({ order: _, positional: __, ...p }) => ({
    ...p,
    required:
      peers.length >= MIN_ITEMS_FOR_REQUIRED && coverage(peers, p.selector) >= requiredCoverage,
  }));
}

/** Checks an item against a structure: required parts it lacks and optional parts it has. */
export function matchStructure(item: Element, structure: ItemStructure): StructureMatch {
  const missing: ItemStructure['parts'] = [];
  let optional = 0;
  for (const part of structure.parts) {
    const hit = has(item, part.selector);
    if (part.required && !hit) missing.push(part);
    else if (!part.required && hit) optional++;
  }
  return { ok: missing.length === 0, missing, optional };
}

/**
 * Index of the item most like the one the structure was taken from: the first item with every
 * required part and the most optional parts, or -1 when no item has every required part.
 */
export function findReferenceItem(items: Element[], structure: ItemStructure): number {
  let best = -1;
  let bestOptional = -1;
  items.forEach((el, i) => {
    const m = matchStructure(el, structure);
    if (m.ok && m.optional > bestOptional) [best, bestOptional] = [i, m.optional];
  });
  return best;
}
