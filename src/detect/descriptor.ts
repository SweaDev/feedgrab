import { hashString } from '../env/hash';
import { containerSelector, itemSelector } from '../selector/generate';
import type { Candidate, FeedDescriptor, Selector } from '../types';

/** Deterministic descriptor id from its selectors. */
export function descriptorId(container: Selector, item: Selector): string {
  return `fd_${hashString(`${container.value}|${item.value}`)}`;
}

/** Builds an unconfirmed descriptor from a candidate. */
export function descriptorFromCandidate(
  c: Pick<Candidate, 'container' | 'items' | 'score'>,
  source: FeedDescriptor['source'],
): FeedDescriptor {
  const container = containerSelector(c.container);
  const item = itemSelector(c.container, c.items);
  return {
    id: descriptorId(container, item),
    container,
    item,
    exclude: [],
    include: [],
    source,
    confidence: c.score,
    confirmed: false,
  };
}
