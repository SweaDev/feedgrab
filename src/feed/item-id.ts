import { canonicalUrl, findPermalink } from '../detect/permalink';
import { hashString } from '../env/hash';
import { normalizeText, textLength } from '../env/text';
import type { Selector } from '../types';

export { canonicalUrl, findPermalink };

/** The id of an item whose canonical permalink is `url` (as `canonicalUrl` returns it). */
export const permalinkId = (url: string) => `i_${hashString(`L|${url}`)}`;

/** An item's id and the canonical permalink it is based on (unset for text-hash ids). */
export type ItemIdentity = { id: string; permalink?: string };

/**
 * Stable identity: a hash of the canonical permalink (from `permalink` when it finds a link,
 * else the heuristic; keeping only `params` when given, else dropping `ignore` too), else of the text (when it has at least `minItemTextLength`
 * characters), else null (a placeholder).
 */
export function itemIdentity(
  el: Element,
  baseUrl: string,
  minItemTextLength = 10,
  permalink?: Selector,
  params?: readonly string[],
  ignore?: readonly string[],
): ItemIdentity | null {
  const link = findPermalink(el, baseUrl, permalink);
  const url = link ? canonicalUrl(link.getAttribute('href') ?? '', baseUrl, params, ignore) : null;
  if (url) return { id: permalinkId(url), permalink: url };
  if (textLength(el) >= minItemTextLength)
    return { id: `i_${hashString(`T|${normalizeText(el, 500)}`)}` };
  return null;
}

/** Stable item id (see `itemIdentity`). */
export function itemId(
  el: Element,
  baseUrl: string,
  minItemTextLength = 10,
  permalink?: Selector,
  params?: readonly string[],
): string | null {
  return itemIdentity(el, baseUrl, minItemTextLength, permalink, params)?.id ?? null;
}
