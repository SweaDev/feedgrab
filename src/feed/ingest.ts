import type { FeedItemImpl } from './feed-item';
import type { UnifiedFeedImpl } from './unified-feed';

/** A `Document` as is, or HTML parsed into a script-less document of the main document's implementation. */
export function toDocument(mainDoc: Document, input: Document | string): Document {
  if (typeof input !== 'string') return input;
  const d = mainDoc.implementation.createHTMLDocument('');
  d.documentElement.innerHTML = input;
  return d;
}

/**
 * Runs every descriptor against a follow-up document and appends its new items (ids already
 * known are skipped). Ingested documents are never observed. Returns the new items in order.
 */
export function ingestDocument(
  feed: UnifiedFeedImpl,
  input: Document | string,
  opts: { url?: string } = {},
): FeedItemImpl[] {
  const doc = toDocument(feed.doc, input);
  const docSeq = feed.nextDocSeq();
  const baseUrl = opts.url ?? feed.doc.baseURI ?? feed.baseUrl;
  const added: FeedItemImpl[] = [];
  for (const state of feed.states.values()) {
    const elements = feed.safeContainers(doc, state).flatMap((c) => feed.safeItems(c, state));
    added.push(...feed.addElements(state, elements, docSeq, baseUrl, opts.url));
  }
  const order = new Map(feed.registry.order.map((item, i) => [item, i]));
  added.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  for (const item of added) feed.notifyAdded(item);
  return added;
}
