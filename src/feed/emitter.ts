import { type FeedDetectorError, toFeedDetectorError } from '../errors';
import type { FeedEvents, FeedListener } from '../types';

type AnyListener = (...args: unknown[]) => void;

/** Typed event emitter for feed events. Listener errors are re-emitted as `feed:error`. */
export class Emitter {
  private readonly listeners = new Map<keyof FeedEvents, Set<AnyListener>>();

  on<E extends keyof FeedEvents>(evt: E, fn: FeedListener<E>): () => void {
    let set = this.listeners.get(evt);
    if (!set) {
      set = new Set();
      this.listeners.set(evt, set);
    }
    set.add(fn as AnyListener);
    return () => this.off(evt, fn);
  }

  once<E extends keyof FeedEvents>(evt: E, fn: FeedListener<E>): () => void {
    const wrapper = ((...args: FeedEvents[E]) => {
      off();
      fn(...args);
    }) as FeedListener<E>;
    const off = this.on(evt, wrapper);
    return off;
  }

  off<E extends keyof FeedEvents>(evt: E, fn: FeedListener<E>): void {
    this.listeners.get(evt)?.delete(fn as AnyListener);
  }

  emit<E extends keyof FeedEvents>(evt: E, ...args: FeedEvents[E]): void {
    const set = this.listeners.get(evt);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(...args);
      } catch (e) {
        if (evt === 'feed:error') continue;
        const error: FeedDetectorError = toFeedDetectorError(e, 'LISTENER_ERROR');
        this.emit('feed:error', { error });
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
