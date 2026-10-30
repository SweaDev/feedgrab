import { hashString } from '../env/hash';
import { normalizeText, textLength } from '../env/text';

const TRACKING = /^(utm_.*|fbclid|gclid|mc_cid|mc_eid|ref|ref_src)$/i;

function hasTime(a: Element): boolean {
  return a.querySelector('time') !== null;
}

/** First permalink-like link of an item (the item itself may be the link). */
export function findPermalink(el: Element): Element | null {
  const links = [
    ...(el.matches('a[href]') ? [el] : []),
    ...Array.from(el.querySelectorAll('a[href]')),
  ];
  const usable = links.filter((a) => {
    const href = (a.getAttribute('href') ?? '').trim();
    return href !== '' && !href.startsWith('#') && !/^javascript:/i.test(href);
  });
  return (
    usable.find((a) => (a.getAttribute('rel') ?? '').split(/\s+/).includes('bookmark')) ??
    usable.find(hasTime) ??
    usable[0] ??
    null
  );
}

/** Canonical URL: hash dropped, tracking params removed, remaining params sorted. */
export function canonicalUrl(href: string, baseUrl: string): string | null {
  try {
    const url = new globalThis.URL(href, baseUrl);
    url.hash = '';
    const params = [...url.searchParams.entries()].filter(([k]) => !TRACKING.test(k));
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

/**
 * Stable item id: a hash of its canonical permalink, else of its text (when it has at least
 * `minItemTextLength` characters), else null (a placeholder).
 */
export function itemId(el: Element, baseUrl: string, minItemTextLength = 10): string | null {
  const link = findPermalink(el);
  const url = link ? canonicalUrl(link.getAttribute('href') ?? '', baseUrl) : null;
  if (url) return `i_${hashString(`L|${url}`)}`;
  if (textLength(el) >= minItemTextLength) return `i_${hashString(`T|${normalizeText(el, 500)}`)}`;
  return null;
}
