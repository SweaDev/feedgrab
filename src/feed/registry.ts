import { type FeedItemImpl, INTERNAL } from './feed-item';

function compare(a: FeedItemImpl, b: FeedItemImpl): number {
  const d = a[INTERNAL].docSeq - b[INTERNAL].docSeq;
  if (d !== 0) return d;
  if (a.element === b.element) return 0;
  const pos = a.element.compareDocumentPosition(b.element);
  if (pos & 1) return 0; // disconnected: keep insertion order
  return pos & 4 ? -1 : 1;
}

/** Items by id and element, kept in unified order: (docSeq, document position). */
export class ItemRegistry {
  readonly byId = new Map<string, FeedItemImpl>();
  byElement = new WeakMap<Element, string>();
  readonly order: FeedItemImpl[] = [];

  get(id: string): FeedItemImpl | undefined {
    return this.byId.get(id);
  }

  idOf(el: Element): string | undefined {
    return this.byElement.get(el);
  }

  /** Inserts with binary search on (docSeq, document position). */
  insert(item: FeedItemImpl): void {
    this.byId.set(item.id, item);
    this.byElement.set(item.element, item.id);
    let lo = 0;
    let hi = this.order.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (compare(this.order[mid] as FeedItemImpl, item) <= 0) lo = mid + 1;
      else hi = mid;
    }
    this.order.splice(lo, 0, item);
  }

  /** Swaps an item's element (re-attach) and restores its order. */
  rebind(item: FeedItemImpl, el: Element): void {
    this.byElement.delete(item.element);
    item.element = el;
    this.byElement.set(el, item.id);
    const i = this.order.indexOf(item);
    if (i >= 0) this.order.splice(i, 1);
    this.byId.delete(item.id);
    this.insert(item);
  }

  clear(): void {
    this.byId.clear();
    this.byElement = new WeakMap();
    this.order.length = 0;
  }
}
