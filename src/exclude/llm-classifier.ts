import { hashString } from '../env/hash';
import { timers } from '../env/timers';
import { type FeedgrabError, toFeedgrabError } from '../errors';
import type { ResolvedBackend } from '../llm/backend';
import type { ClassifierOptions } from '../types';
import type { LlmVerdict } from './engine';

/** Classifier defaults. */
export const CLASSIFIER_DEFAULTS: ClassifierOptions = {
  batchSize: 10,
  batchDelayMs: 250,
  maxConcurrent: 2,
  maxItemChars: 600,
  minConfidence: 0.5,
};

const CACHE_SIZE = 5000;
const RETRY_DELAY_MS = 500;

type Entry = { key: string; text: string; criteria: string[] };

/** Cache key for an item text under a set of criteria. */
export function classifierKey(text: string, criteria: string[]): string {
  return `${hashString(text)}:${hashString(criteria.join('\n'))}`;
}

/**
 * Batches item texts to the LLM (`classify` task) with an LRU verdict cache, bounded
 * concurrency, one retry and abort on dispose.
 */
export class LlmClassifier {
  private readonly opts: ClassifierOptions;
  private readonly onError?: (e: FeedgrabError) => void;
  private readonly cache = new Map<string, LlmVerdict>();
  private readonly pending = new Set<string>();
  private queue: Entry[] = [];
  private inFlight = new Set<AbortController>();
  private timer: unknown = null;
  private listeners = new Set<(keys: string[]) => void>();
  private disposed = false;

  constructor(
    private readonly backend: ResolvedBackend,
    opts: Partial<ClassifierOptions> & { onError?: (e: FeedgrabError) => void } = {},
  ) {
    const { onError, ...rest } = opts;
    this.opts = { ...CLASSIFIER_DEFAULTS, ...rest };
    this.onError = onError;
  }

  /** Cached verdict, `'pending'` while queued/in flight, or undefined when unknown. */
  verdict(key: string): LlmVerdict | 'pending' | undefined {
    const v = this.cache.get(key);
    if (v) {
      this.cache.delete(key);
      this.cache.set(key, v);
      return v;
    }
    return this.pending.has(key) ? 'pending' : undefined;
  }

  /** Queues items (unknown keys only) for classification under `criteria`. */
  enqueue(items: { key: string; text: string }[], criteria: string[]): void {
    if (this.disposed || criteria.length === 0) return;
    for (const { key, text } of items) {
      if (this.cache.has(key) || this.pending.has(key)) continue;
      this.pending.add(key);
      this.queue.push({ key, text: text.slice(0, this.opts.maxItemChars), criteria });
    }
    this.pump();
  }

  /** Subscribes to verdicts; the callback receives the keys that got a verdict. */
  onResult(cb: (keys: string[]) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Aborts in-flight requests and clears the queue. */
  dispose(): void {
    this.disposed = true;
    for (const ac of this.inFlight) ac.abort();
    this.inFlight.clear();
    if (this.timer !== null) timers.clearTimeout(this.timer);
    this.timer = null;
    this.queue = [];
    this.pending.clear();
    this.listeners.clear();
  }

  private pump(): void {
    if (this.disposed) return;
    while (
      this.queue.length >= this.opts.batchSize &&
      this.inFlight.size < this.opts.maxConcurrent
    ) {
      this.startBatch();
    }
    if (this.queue.length > 0 && this.timer === null) {
      this.timer = timers.setTimeout(() => {
        this.timer = null;
        while (this.queue.length > 0 && this.inFlight.size < this.opts.maxConcurrent) {
          this.startBatch();
        }
        if (this.queue.length > 0) this.pump();
      }, this.opts.batchDelayMs);
    }
  }

  private startBatch(): void {
    const criteria = this.queue[0]?.criteria ?? [];
    const sig = criteria.join('\n');
    const batch: Entry[] = [];
    const rest: Entry[] = [];
    for (const e of this.queue) {
      if (batch.length < this.opts.batchSize && e.criteria.join('\n') === sig) batch.push(e);
      else rest.push(e);
    }
    this.queue = rest;
    const ac = new globalThis.AbortController();
    this.inFlight.add(ac);
    void this.run(batch, criteria, ac).finally(() => {
      this.inFlight.delete(ac);
      this.pump();
    });
  }

  private async run(batch: Entry[], criteria: string[], ac: AbortController): Promise<void> {
    const req = {
      task: 'classify' as const,
      criteria,
      items: batch.map((e) => ({ id: e.key, text: e.text })),
    };
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) {
        await new Promise<void>((resolve) => timers.setTimeout(resolve, RETRY_DELAY_MS));
      }
      if (this.disposed || ac.signal.aborted) return;
      try {
        const res = await this.backend(req, { signal: ac.signal });
        if (this.disposed || ac.signal.aborted) return;
        const byId = new Map(res.results.map((r) => [r.id, r]));
        this.settle(
          batch.map((e) => {
            const r = byId.get(e.key);
            const exclude = !!r && r.exclude && r.confidence >= this.opts.minConfidence;
            const verdict: LlmVerdict = { exclude, confidence: r?.confidence ?? 0 };
            if (r?.criteriaIndex !== undefined) verdict.criteriaIndex = r.criteriaIndex;
            return [e.key, verdict];
          }),
        );
        return;
      } catch (e) {
        lastError = e;
      }
    }
    if (this.disposed || ac.signal.aborted) return;
    this.settle(batch.map((e) => [e.key, { exclude: false, confidence: 0, error: true }]));
    this.onError?.(toFeedgrabError(lastError, 'LLM_UNAVAILABLE'));
  }

  private settle(results: [string, LlmVerdict][]): void {
    for (const [key, v] of results) {
      this.pending.delete(key);
      this.cache.set(key, v);
      if (this.cache.size > CACHE_SIZE) {
        const oldest = this.cache.keys().next().value;
        if (oldest !== undefined) this.cache.delete(oldest);
      }
    }
    const keys = results.map(([k]) => k);
    for (const cb of this.listeners) cb(keys);
  }
}
