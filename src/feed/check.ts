import { feedType } from '../content/kind';
import { linkBySelector } from '../detect/permalink';
import { matchStructure } from '../detect/structure';
import type { ContentKind, FeedContentType, FeedDescriptor, FeedItem, FeedOptions } from '../types';
import { openFeed } from './unified-feed';

/** What a descriptor finds in a document (`checkDescriptor`). */
export type DescriptorCheck = {
  /** Every item the descriptor finds (kept and excluded), in feed order. */
  items: FeedItem[];
  /** Items in which the descriptor's `permalink` selector finds a link (0 when it has none). */
  withLink: number;
  /** Items with every required part of the descriptor's `structure` (all items when it has none). */
  matchingStructure: number;
  /** Share of each content kind among the items. */
  kinds: Record<ContentKind, number>;
  /** The feed's content type from its items. */
  type: FeedContentType;
};

/**
 * Dry run of one descriptor on a document, the way a live feed would read it but without live
 * updates: for picker and settings UIs checking a page or a saved sample. Read-only; selectors
 * that fail to evaluate find nothing instead of throwing.
 */
export function checkDescriptor(
  doc: Document,
  descriptor: FeedDescriptor,
  opts: Pick<FeedOptions, 'baseUrl' | 'builtinExclusions'> = {},
): DescriptorCheck {
  let items: FeedItem[] = [];
  try {
    const baseUrl = opts.baseUrl ?? doc.URL;
    const hostname = new globalThis.URL(baseUrl).hostname || 'localhost';
    const feed = openFeed(
      doc,
      { version: 1, hostname, pathPattern: '/', feeds: [descriptor] },
      { live: false, builtinExclusions: opts.builtinExclusions ?? false, baseUrl },
    );
    items = feed.items();
    feed.dispose();
  } catch {}
  const sel = descriptor.permalink;
  const withLink = sel ? items.filter((i) => linkBySelector(i.element, sel)).length : 0;
  const structure = descriptor.structure;
  const matchingStructure = structure
    ? items.filter((i) => matchStructure(i.element, structure).ok).length
    : items.length;
  const { type, kinds } = feedType(items.map((i) => i.content().kind));
  return { items, withLink, matchingStructure, kinds, type };
}
