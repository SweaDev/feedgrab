import { getWindow } from '../env/dom';
import { timers } from '../env/timers';
import type { FeedItemImpl } from './feed-item';
import type { FeedState, UnifiedFeedImpl } from './unified-feed';

type Watch = {
  state: FeedState;
  containers: Set<Element>;
  lostTimer: unknown;
  lostEmitted: boolean;
};

/** True when live observation is possible for a document. */
export function canObserve(doc: Document): boolean {
  return typeof getWindow(doc)?.MutationObserver === 'function';
}

/**
 * Watches a live document for new, removed, re-attached and changed items. One observer on
 * the document coalesces records per microtask into `processBatch()`; containers that are
 * re-mounted are re-resolved from their descriptor, and `feed:lost` fires after
 * `lostTimeoutMs` without any container.
 */
export class FeedObserver {
  /** `processBatch` durations in ms (performance tests). */
  readonly stats: number[] = [];
  private readonly watches = new Map<string, Watch>();
  private mo: MutationObserver | null = null;
  private records: MutationRecord[] = [];
  private scheduled = false;
  private stopped = false;

  constructor(private readonly feed: UnifiedFeedImpl) {}

  start(initiallyLost: Set<string>): this {
    const doc = this.feed.doc;
    const MO = getWindow(doc)?.MutationObserver;
    if (!MO) return this;
    for (const state of this.feed.states.values()) {
      const containers = new Set(this.feed.safeContainers(doc, state));
      this.watches.set(state.descriptor.id, {
        state,
        containers,
        lostTimer: null,
        lostEmitted: initiallyLost.has(state.descriptor.id),
      });
    }
    this.mo = new MO((records) => this.onRecords(records));
    this.mo.observe(doc.documentElement, { childList: true, subtree: true, characterData: true });
    return this;
  }

  stop(): void {
    this.stopped = true;
    this.mo?.disconnect();
    this.mo = null;
    this.records = [];
    for (const w of this.watches.values()) {
      if (w.lostTimer !== null) timers.clearTimeout(w.lostTimer);
    }
  }

  private onRecords(records: MutationRecord[]): void {
    if (this.stopped) return;
    this.records.push(...records);
    if (this.scheduled) return;
    this.scheduled = true;
    timers.queueMicrotask(() => this.processBatch());
  }

  private containerOf(el: Element | null): Watch | undefined {
    if (!el) return undefined;
    for (const w of this.watches.values()) {
      for (const c of w.containers) if (c === el || c.contains(el)) return w;
    }
    return undefined;
  }

  /** Processes the queued mutation records. */
  processBatch(): void {
    this.scheduled = false;
    if (this.stopped || this.feed.isDisposed) return;
    const t0 = timers.now();
    const records = this.records.splice(0);
    const feed = this.feed;
    const registry = feed.registry;

    const touched = new Set<Element>();
    let addedOutside = false;
    for (const r of records) {
      const target = r.target.nodeType === 1 ? (r.target as Element) : r.target.parentElement;
      if (target) touched.add(target);
      if (!addedOutside && r.addedNodes.length > 0 && !this.containerOf(target))
        addedOutside = true;
    }

    // 1. Containers: re-resolve when one disconnected, none exist, or nodes were added elsewhere.
    const dirty = new Set<Watch>();
    for (const w of this.watches.values()) {
      const allConnected = [...w.containers].every((c) => c.isConnected);
      if (allConnected && w.containers.size > 0 && !addedOutside) continue;
      const resolved = feed.safeContainers(feed.doc, w.state).filter((c) => c.isConnected);
      const changed =
        resolved.length !== w.containers.size || resolved.some((c) => !w.containers.has(c));
      w.containers = new Set(resolved);
      if (changed) dirty.add(w);
      if (resolved.length === 0) this.startLostTimer(w);
      else this.clearLostTimer(w);
    }
    for (const el of touched) {
      const w = this.containerOf(el);
      if (w) dirty.add(w);
    }

    // 2. Removed items (emitted after re-attach, so same-batch re-mounts only update).
    const gone: FeedItemImpl[] = [];
    for (const item of registry.order) {
      if (item.connected && !item.element.isConnected) {
        item.connected = false;
        gone.push(item);
      }
    }

    // 3. New, re-attached and placeholder elements in affected containers.
    const added: FeedItemImpl[] = [];
    const reattached = new Set<FeedItemImpl>();
    for (const w of dirty) {
      const elements = [...w.containers].flatMap((c) => feed.safeItems(c, w.state));
      for (const el of elements) {
        const knownId = registry.idOf(el);
        const known = knownId ? registry.get(knownId) : undefined;
        if (known?.connected) continue;
        const id = known ? known.id : feed.itemIdOf(el);
        if (id === null) {
          w.state.placeholders.add(el);
          continue;
        }
        w.state.placeholders.delete(el);
        const existing = registry.get(id);
        if (existing && !existing.connected) {
          registry.rebind(existing, el);
          existing.connected = true;
          existing.invalidateText();
          feed.evaluate(existing);
          reattached.add(existing);
        } else if (!existing) {
          added.push(...feed.addElements(w.state, [el], 0, feed.baseUrl));
        }
      }
    }

    // 4. Subtree changes of known items.
    const changedItems = new Set<FeedItemImpl>();
    for (const el of touched) {
      for (let cur: Element | null = el; cur; cur = cur.parentElement) {
        const id = registry.idOf(cur);
        const item = id ? registry.get(id) : undefined;
        if (item?.element === cur) {
          if (item.connected && !reattached.has(item) && !added.includes(item))
            changedItems.add(item);
          break;
        }
      }
    }

    for (const item of gone) if (!item.connected) feed.notifyRemoved(item);
    for (const item of reattached) feed.notifyUpdated(item, item.status);
    for (const item of changedItems) {
      const prev = item.status;
      item.invalidateText();
      if (feed.evaluate(item)) feed.notifyUpdated(item, prev);
    }
    for (const item of added) feed.notifyAdded(item);
    this.stats.push(timers.now() - t0);
  }

  private startLostTimer(w: Watch): void {
    if (w.lostTimer !== null || w.lostEmitted) return;
    w.lostTimer = timers.setTimeout(() => {
      w.lostTimer = null;
      if (this.stopped || w.containers.size > 0) return;
      w.lostEmitted = true;
      this.feed.notifyLost(w.state.descriptor.id);
    }, this.feed.lostTimeoutMs);
  }

  private clearLostTimer(w: Watch): void {
    if (w.lostTimer !== null) timers.clearTimeout(w.lostTimer);
    w.lostTimer = null;
    w.lostEmitted = false;
  }
}
