import { hasLayout } from '../env/dom';
import { FeedDetectorError } from '../errors';
import { evaluateSelector, resolveItems } from '../selector/evaluate';
import { containerSelector, itemSelector } from '../selector/generate';
import { isSameKind } from '../signature/signature';
import type { FeedDescriptor, SelectorInput } from '../types';
import { itemChildren, largestGroup } from './candidate';
import { descriptorFromCandidate, descriptorId } from './descriptor';
import { scoreContainer } from './heuristic';

/**
 * Walks up from any element inside a feed to the nearest group of repeating siblings and
 * returns its descriptor (`source: 'inspect'`). Throws `NO_REPEATING_ANCESTOR`.
 */
export function inspectFromElement(el: Element, opts: { minItems?: number } = {}): FeedDescriptor {
  const { minItems = 2 } = opts;
  const body = el.ownerDocument.body;
  for (let a: Element = el; a.parentElement && a !== body; a = a.parentElement) {
    const parent = a.parentElement;
    const items = Array.from(parent.children).filter((s) => s === a || isSameKind(s, a));
    if (items.length >= minItems) {
      const c = scoreContainer(parent, items, hasLayout(el.ownerDocument));
      return descriptorFromCandidate(c, 'inspect');
    }
  }
  throw new FeedDetectorError('NO_REPEATING_ANCESTOR', 'No repeating ancestor group found');
}

function lowestCommonAncestor(els: Element[]): Element {
  let lca = els[0]?.parentElement as Element;
  for (const el of els.slice(1)) {
    while (lca && !lca.contains(el)) lca = lca.parentElement as Element;
  }
  return lca;
}

/**
 * Builds a descriptor (`source: 'manual'`) from a container and/or item selector.
 * Throws `NO_MATCH` when a selector matches nothing, `INVALID_SELECTOR` on bad syntax.
 */
export function detectFromSelector(doc: Document, input: SelectorInput): FeedDescriptor {
  let container = input.container;
  let item = input.item;
  if (container) {
    const containers = evaluateSelector(container, doc);
    const first = containers[0];
    if (!first)
      throw new FeedDetectorError('NO_MATCH', 'Container selector matches nothing', { container });
    if (item) {
      if (resolveItems(first, { item }).length === 0) {
        throw new FeedDetectorError('NO_MATCH', 'Item selector matches nothing', { item });
      }
    } else {
      const group = largestGroup(itemChildren(first));
      if (group.length === 0)
        throw new FeedDetectorError('NO_MATCH', 'Container has no items', { container });
      item = itemSelector(first, group);
    }
  } else if (item) {
    const items = evaluateSelector(item, doc);
    if (items.length === 0)
      throw new FeedDetectorError('NO_MATCH', 'Item selector matches nothing', { item });
    const lca = lowestCommonAncestor(items);
    if (!lca) throw new FeedDetectorError('NO_MATCH', 'Items have no common container', { item });
    container = containerSelector(lca);
  } else {
    throw new FeedDetectorError('INVALID_SELECTOR', 'Provide a container and/or item selector');
  }
  return {
    id: descriptorId(container, item),
    container,
    item,
    exclude: [],
    include: [],
    source: 'manual',
    confidence: 1,
    confirmed: false,
  };
}
