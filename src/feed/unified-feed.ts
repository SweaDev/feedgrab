import { isParsedDocument } from '../env/dom';
import { timers } from '../env/timers';
import { FeedDetectorError, toFeedDetectorError } from '../errors';
import { type EvaluationContext, evaluateItem } from '../exclude/engine';
import { normalizeDescriptor } from '../profile/normalize';
import { resolveContainers, resolveItems } from '../selector/evaluate';
import { dominantSignature } from '../signature/signature';
import type {
  FeedDescriptor,
  FeedEvents,
  FeedItem,
  FeedListener,
  FeedOptions,
  ItemStatus,
  ItemsOptions,
  IterateOptions,
  SiteProfile,
  UnifiedFeed,
} from '../types';
import { AsyncQueue } from './async-queue';
import { Emitter } from './emitter';
import { FeedItemImpl, INTERNAL } from './feed-item';
import { ingestDocument } from './ingest';
import { itemId } from './item-id';
import { canObserve, FeedObserver } from './observer';
import { ItemRegistry } from './registry';

/** Per-descriptor state. */
export type FeedState = {
  descriptor: FeedDescriptor;
  dominantSig: string;
  /** Placeholder elements (no id yet), re-checked on mutations. */
  placeholders: Set<Element>;
};

type Iterator = { queue: AsyncQueue<FeedItem>; opts: ItemsOptions; seen: Set<string> };

function matchesFilter(item: FeedItem, opts: ItemsOptions): boolean {
  if (opts.includePending === false && item.status === 'pending') return false;
  if (opts.status === undefined) return true;
  const allowed: ItemStatus[] = Array.isArray(opts.status) ? opts.status : [opts.status];
  return allowed.includes(item.status);
}

/** Implementation of `UnifiedFeed`. Internal methods are used by the observer and ingest. */
export class UnifiedFeedImpl implements UnifiedFeed {
  readonly profile: SiteProfile;
  readonly doc: Document;
  readonly live: boolean;
  readonly builtins: boolean;
  readonly minItemTextLength: number;
  readonly lostTimeoutMs: number;
  readonly baseUrl: string;
  readonly registry = new ItemRegistry();
  readonly states = new Map<string, FeedState>();
  protected readonly emitter = new Emitter();
  private readonly iterators = new Set<Iterator>();
  private disposed = false;
  private seq = 0;
  /** Live observer (when `live` and a `MutationObserver` exists). */
  observer: FeedObserver | null = null;

  constructor(doc: Document, profile: SiteProfile, opts: FeedOptions = {}) {
    this.doc = doc;
    this.profile = { ...profile, feeds: profile.feeds.map(normalizeDescriptor) };
    this.live = opts.live ?? !isParsedDocument(doc);
    this.builtins = opts.builtinExclusions ?? true;
    this.minItemTextLength = opts.minItemTextLength ?? 10;
    this.lostTimeoutMs = opts.lostTimeoutMs ?? 2000;
    this.baseUrl = opts.baseUrl ?? doc.baseURI ?? doc.URL;
    for (const descriptor of this.profile.feeds) {
      this.states.set(descriptor.id, { descriptor, dominantSig: '', placeholders: new Set() });
    }
  }

  /** Initial scan; events are emitted in a microtask so listeners can attach first. */
  start(): this {
    const added: FeedItemImpl[] = [];
    const lost: string[] = [];
    for (const state of this.states.values()) {
      const containers = this.safeContainers(this.doc, state);
      if (containers.length === 0) {
        lost.push(state.descriptor.id);
        continue;
      }
      const elements = containers.flatMap((c) => this.safeItems(c, state));
      state.dominantSig = dominantSignature(elements);
      added.push(...this.addElements(state, elements, 0, this.baseUrl));
    }
    timers.queueMicrotask(() => {
      if (this.disposed) return;
      for (const feedId of lost) this.emitter.emit('feed:lost', { feedId });
      for (const item of added) this.notifyAdded(item);
    });
    if (this.live && canObserve(this.doc))
      this.observer = new FeedObserver(this).start(new Set(lost));
    return this;
  }

  // ---- internals shared with observer / ingest -------------------------------------------

  safeContainers(doc: Document, state: FeedState): Element[] {
    try {
      return resolveContainers(doc, state.descriptor);
    } catch (e) {
      this.reportError(e, state.descriptor.id);
      return [];
    }
  }

  safeItems(container: Element, state: FeedState): Element[] {
    try {
      return resolveItems(container, state.descriptor);
    } catch (e) {
      this.reportError(e, state.descriptor.id);
      return [];
    }
  }

  reportError(e: unknown, feedId?: string): void {
    const error = toFeedDetectorError(e, 'INVALID_SELECTOR');
    this.emitter.emit('feed:error', feedId ? { feedId, error } : { error });
  }

  itemIdOf(el: Element, baseUrl = this.baseUrl): string | null {
    return itemId(el, baseUrl, this.minItemTextLength);
  }

  /** Creates, evaluates and registers new items; returns them (events not emitted). */
  addElements(
    state: FeedState,
    elements: Element[],
    docSeq: number,
    baseUrl: string,
    sourceUrl?: string,
  ): FeedItemImpl[] {
    const added: FeedItemImpl[] = [];
    for (const el of elements) {
      if (this.registry.idOf(el)) continue;
      const id = this.itemIdOf(el, baseUrl);
      if (id === null) {
        if (docSeq === 0) state.placeholders.add(el);
        continue;
      }
      state.placeholders.delete(el);
      if (this.registry.get(id)) continue;
      const item = new FeedItemImpl({
        id,
        feedId: state.descriptor.id,
        element: el,
        docSeq,
        sourceUrl,
      });
      this.evaluate(item);
      this.registry.insert(item);
      added.push(item);
    }
    return added;
  }

  /** Re-evaluates an item; returns true when its report changed. */
  evaluate(item: FeedItemImpl): boolean {
    const state = this.states.get(item.feedId);
    if (!state) return false;
    const ctx: EvaluationContext = {
      descriptor: state.descriptor,
      builtins: this.builtins,
      dominantSig: state.dominantSig,
    };
    const verdict = this.llmVerdictFor(item);
    if (verdict) ctx.llmVerdict = verdict;
    const ev = evaluateItem(item.element, ctx);
    const changed = item.apply(ev);
    if (ev.needsLlm) this.requestLlm(item);
    return changed;
  }

  /** Hook for LLM text rules (T25). */
  protected llmVerdictFor(_item: FeedItemImpl): EvaluationContext['llmVerdict'] {
    return undefined;
  }

  /** Hook for LLM text rules (T25). */
  protected requestLlm(_item: FeedItemImpl): void {}

  nextDocSeq(): number {
    this.seq += 1;
    return this.seq;
  }

  notifyAdded(item: FeedItemImpl): void {
    this.emitter.emit('item:added', item);
    for (const it of this.iterators) this.offer(it, item);
  }

  notifyUpdated(item: FeedItemImpl, prevStatus: ItemStatus): void {
    this.emitter.emit('item:updated', item, prevStatus);
    for (const it of this.iterators) this.offer(it, item);
  }

  notifyRemoved(item: FeedItemImpl): void {
    this.emitter.emit('item:removed', item);
  }

  notifyLost(feedId: string): void {
    this.emitter.emit('feed:lost', { feedId });
  }

  private offer(it: Iterator, item: FeedItem): void {
    if (it.seen.has(item.id) || !matchesFilter(item, it.opts)) return;
    it.seen.add(item.id);
    it.queue.push(item);
  }

  protected assertOpen(): void {
    if (this.disposed) throw new FeedDetectorError('DISPOSED', 'The feed has been disposed');
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  // ---- public API ------------------------------------------------------------------------

  items(opts: ItemsOptions = {}): FeedItem[] {
    this.assertOpen();
    return this.registry.order.filter((item) => matchesFilter(item, opts));
  }

  iterate(opts: IterateOptions = {}): AsyncIterableIterator<FeedItem> {
    this.assertOpen();
    const it: Iterator = {
      queue: new AsyncQueue<FeedItem>(() => this.iterators.delete(it)),
      opts,
      seen: new Set(),
    };
    this.iterators.add(it);
    for (const item of this.registry.order) this.offer(it, item);
    if (!(opts.live ?? this.live)) it.queue.drainThenClose();
    return it.queue;
  }

  [Symbol.asyncIterator](): AsyncIterator<FeedItem> {
    return this.iterate();
  }

  on<E extends keyof FeedEvents>(evt: E, fn: FeedListener<E>): () => void {
    this.assertOpen();
    return this.emitter.on(evt, fn);
  }

  off<E extends keyof FeedEvents>(evt: E, fn: FeedListener<E>): void {
    this.emitter.off(evt, fn);
  }

  once<E extends keyof FeedEvents>(evt: E, fn: FeedListener<E>): () => void {
    this.assertOpen();
    return this.emitter.once(evt, fn);
  }

  ingest(input: Document | string, opts: { url?: string } = {}): FeedItem[] {
    this.assertOpen();
    return ingestDocument(this, input, opts);
  }

  dispose(opts: { restore?: boolean } = {}): void {
    if (this.disposed) return;
    this.disposed = true;
    this.teardown();
    for (const it of [...this.iterators]) it.queue.close();
    this.iterators.clear();
    if (opts.restore) {
      for (const item of this.registry.order) {
        for (const h of item[INTERNAL].handles.values()) h.restore();
        item[INTERNAL].handles.clear();
      }
    }
    this.registry.clear();
    this.emitter.clear();
  }

  /** Stops observers and the classifier. */
  protected teardown(): void {
    this.observer?.stop();
  }
}

/**
 * Opens the unified feed of a profile on a document: items from every feed, de-duplicated,
 * in document order, with exclusion reports. Live documents are observed for new items.
 * @example
 * const feed = openFeed(document, profile);
 * for await (const item of feed) if (item.status === 'excluded') removeItem(item);
 */
export function openFeed(doc: Document, profile: SiteProfile, opts: FeedOptions = {}): UnifiedFeed {
  return new UnifiedFeedImpl(doc, profile, opts).start();
}
