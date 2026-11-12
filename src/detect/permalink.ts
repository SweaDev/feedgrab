import { evaluateSelector } from '../selector/evaluate';
import { cssEscape } from '../selector/generate';
import { stableClasses } from '../signature/classes';
import type { PermalinkCandidate, PermalinkOptions, PermalinkParam, Selector } from '../types';

const TRACKING = /^(utm_.*|fbclid|gclid|mc_cid|mc_eid|ref|ref_src)$/i;
const HEADING = 'h1, h2, h3, h4, h5, h6, [role="heading"]';
const WORD_SEGMENT = /^[a-z][a-z_-]{1,30}$/i;
const ATTRS = ['data-testid', 'data-test', 'itemprop', 'role'];
const MAX_CANDIDATES = 30;
const MAX_TEXT = 60;

/**
 * Canonical URL: hash dropped, params sorted. Only the params in `keep` stay when it is given,
 * else all but tracking params and those in `drop`.
 */
export function canonicalUrl(
  href: string,
  baseUrl: string,
  keep?: readonly string[],
  drop?: readonly string[],
): string | null {
  try {
    const url = new globalThis.URL(href, baseUrl);
    url.hash = '';
    const params = [...url.searchParams.entries()].filter(([k]) =>
      keep ? keep.includes(k) : !TRACKING.test(k) && !drop?.includes(k),
    );
    params.sort(([a, av], [b, bv]) =>
      a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : a < b ? -1 : 1,
    );
    url.search = '';
    for (const [k, v] of params) url.searchParams.append(k, v);
    return url.toString();
  } catch {
    return null;
  }
}

function usable(a: Element): boolean {
  const href = (a.getAttribute('href') ?? '').trim();
  return href !== '' && !href.startsWith('#') && !/^javascript:/i.test(href);
}

/** Usable links of an item in document order (the item itself may be the link). */
function linksOf(el: Element): Element[] {
  const all = [
    ...(el.matches('a[href]') ? [el] : []),
    ...Array.from(el.querySelectorAll('a[href]')),
  ];
  return all.filter(usable);
}

const hasTime = (a: Element) => a.querySelector('time') !== null;

function isExplicit(a: Element): boolean {
  const tokens = (name: string) => (a.getAttribute(name) ?? '').split(/\s+/);
  return (
    tokens('rel').includes('bookmark') ||
    tokens('class').includes('u-url') ||
    tokens('itemprop').includes('url')
  );
}

/** The link around or inside the item's first heading. */
function headingLink(el: Element): Element | null {
  const h = el.querySelector(HEADING);
  if (!h) return null;
  const around = h.closest('a[href]');
  const a = around && el.contains(around) ? around : h.querySelector('a[href]');
  return a && usable(a) ? a : null;
}

function depth(a: Element, baseUrl: string): number {
  const url = canonicalUrl(a.getAttribute('href') ?? '', baseUrl);
  if (!url) return -1;
  return new globalThis.URL(url).pathname.split('/').filter(Boolean).length;
}

/** The link `el` (matched inside `root`) stands for: itself, a link around it, or one inside it. */
function linkFor(el: Element, root: Element): Element | null {
  const around = el.closest('a[href]');
  const a = around && root.contains(around) ? around : el.querySelector('a[href]');
  return a && usable(a) ? a : null;
}

/** The link the selector points to inside `root`, or null (also for invalid selectors). */
export function linkBySelector(root: Element, sel: Selector): Element | null {
  if (!sel.value.trim()) return null;
  try {
    const m = evaluateSelector(sel, root)[0];
    return m ? linkFor(m, root) : null;
  } catch {
    return null;
  }
}

/**
 * The permalink of an item: the link `sel` points to when given, else the first explicit
 * permalink (`rel=bookmark`, `u-url`, `itemprop=url`), link with a `<time>`, heading link, or
 * the deepest link (first on ties).
 */
export function findPermalink(el: Element, baseUrl: string, sel?: Selector): Element | null {
  const chosen = sel && linkBySelector(el, sel);
  if (chosen) return chosen;
  const links = linksOf(el);
  const pick = links.find(isExplicit) ?? links.find(hasTime) ?? headingLink(el);
  if (pick) return pick;
  let best: Element | null = null;
  let bestDepth = -1;
  for (const a of links) {
    const d = depth(a, baseUrl);
    if (d > bestDepth) [best, bestDepth] = [a, d];
  }
  return best;
}

// ---- suggestions ---------------------------------------------------------------------------

const quoted = (v: string) => `"${v.replace(/["\\]/g, '\\$&')}"`;

function firstLink(root: Element, css: string): Element | null {
  return linkBySelector(root, { type: 'css', value: css });
}

/** Ways to describe link `a` of `root`, most general first. */
function selectorCandidates(root: Element, a: Element): string[] {
  const out: string[] = [];
  if ((a.getAttribute('rel') ?? '').split(/\s+/).includes('bookmark'))
    out.push('a[rel~="bookmark"]');
  if (a.classList.contains('u-url')) out.push('a.u-url');
  for (const attr of ATTRS) {
    const v = a.getAttribute(attr);
    if (v && v.length <= 40) out.push(`a[${attr}=${quoted(v)}]`);
  }
  const classes = stableClasses(a).map((c) => `.${cssEscape(c)}`);
  for (let n = 1; n <= classes.length; n++) out.push(`a${classes.slice(0, n).join('')}`);
  if (hasTime(a)) out.push('a:has(time)');
  const h = headingLink(root) === a ? root.querySelector(HEADING) : null;
  if (h && /^h[1-6]$/.test(h.localName))
    out.push(h.contains(a) ? `${h.localName} a` : `a:has(${h.localName})`);
  const path = (() => {
    try {
      return new globalThis.URL(a.getAttribute('href') ?? '', 'https://x.invalid').pathname;
    } catch {
      return '';
    }
  })();
  for (const seg of path.split('/').filter((s) => WORD_SEGMENT.test(s)))
    out.push(`a[href*=${quoted(`/${seg}/`)}]`);
  const steps: string[] = [];
  for (let n: Element | null = a; n && n !== root; n = n.parentElement) {
    const parent: Element | null = n.parentElement;
    if (!parent) break;
    const tag = n.localName;
    const nth =
      Array.from(parent.children)
        .filter((c) => c.localName === tag)
        .indexOf(n) + 1;
    steps.unshift(`${tag}:nth-of-type(${nth})`);
  }
  if (steps.length) out.push(`:scope > ${steps.join(' > ')}`);
  return out;
}

/** The candidate whose first link in `root` is `a` and that finds a link in the most samples. */
function relativeSelector(root: Element, a: Element, samples: Element[]): string | null {
  let best: string | null = null;
  let hits = -1;
  for (const css of selectorCandidates(root, a)) {
    if (firstLink(root, css) !== a) continue;
    const h = samples.filter((s) => firstLink(s, css)).length;
    if (h > hits) [best, hits] = [css, h];
  }
  return best;
}

const round = (n: number) => Math.round(n * 1e4) / 1e4;

/** Per-param stats over canonical permalinks of `total` items, sorted by name. */
function paramStats(urls: string[], total: number): PermalinkParam[] {
  const values = new Map<string, string[]>();
  for (const u of urls) {
    const seen = new Set<string>();
    for (const [k, v] of new globalThis.URL(u).searchParams) {
      if (seen.has(k)) continue;
      seen.add(k);
      values.set(k, [...(values.get(k) ?? []), v]);
    }
  }
  return [...values.keys()].sort().map((name) => {
    const vs = values.get(name) ?? [];
    return {
      name,
      value: vs[0] ?? '',
      coverage: total ? round(vs.length / total) : 0,
      uniqueness: vs.length > 1 ? round(new Set(vs).size / vs.length) : 0,
    };
  });
}

/**
 * Query parameters of the items' permalinks (found as for ids: by `sel`, else the heuristic), to
 * choose `FeedDescriptor.permalinkParams` from. Tracking params are left out. A param that
 * identifies the item usually has coverage and uniqueness 1, but so may per-item analytics
 * params (like YouTube's `pp`), so let the user confirm.
 */
export function suggestPermalinkParams(
  items: Element[],
  baseUrl: string,
  sel?: Selector,
): PermalinkParam[] {
  const urls = items.flatMap((el) => {
    const a = findPermalink(el, baseUrl, sel);
    const u = a && canonicalUrl(a.getAttribute('href') ?? '', baseUrl);
    return u ? [u] : [];
  });
  return paramStats(urls, items.length);
}

const sameSite = (url: string, baseUrl: string) => {
  try {
    const host = (u: string) => new globalThis.URL(u).hostname.replace(/^www\./, '');
    return host(url) === host(baseUrl);
  } catch {
    return false;
  }
};

/**
 * Ranks the distinct links of the reference item (default `items[0]`) as permalink candidates,
 * each with a CSS selector relative to the item. The other items show which selectors carry over
 * (coverage) and point to a different URL per item (uniqueness), so pass a few items of the same
 * feed.
 */
export function suggestPermalinks(
  items: Element[],
  baseUrl: string,
  opts: PermalinkOptions = {},
): PermalinkCandidate[] {
  const root = opts.reference ?? items[0];
  if (!root) return [];
  const heading = headingLink(root);
  const seen = new Set<string>();
  const ranked: (PermalinkCandidate & { order: number })[] = [];
  for (const a of linksOf(root)) {
    const url = canonicalUrl(a.getAttribute('href') ?? '', baseUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const value = relativeSelector(root, a, items);
    if (!value) continue;
    const found = items.flatMap((s) => {
      const l = firstLink(s, value);
      const u = l && canonicalUrl(l.getAttribute('href') ?? '', baseUrl);
      return u ? [u] : [];
    });
    const coverage = found.length / items.length;
    const uniqueness = found.length > 1 ? new Set(found).size / found.length : 0;
    const score =
      (isExplicit(a) ? 4 : 0) +
      (hasTime(a) ? 3 : 0) +
      (a === heading ? 2 : 0) +
      2 * coverage +
      uniqueness +
      (sameSite(url, baseUrl) ? 0.5 : 0) +
      0.25 * (Math.min(depth(a, baseUrl), 8) / 8);
    const text =
      (a.textContent ?? '').replace(/\s+/g, ' ').trim() || a.getAttribute('aria-label') || '';
    ranked.push({
      selector: { type: 'css', value },
      url,
      text: text.trim().slice(0, MAX_TEXT),
      score: round(score),
      params: paramStats(found, items.length),
      order: ranked.length,
    });
    if (ranked.length >= MAX_CANDIDATES) break;
  }
  ranked.sort((x, y) => y.score - x.score || x.order - y.order);
  return ranked.map(({ order: _, ...c }) => c);
}
