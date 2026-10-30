type Waiter<T> = (r: IteratorResult<T>) => void;

/** Unbounded async queue. `close()` ends immediately; `drainThenClose()` ends once empty. */
export class AsyncQueue<T> implements AsyncIterableIterator<T> {
  private buffer: T[] = [];
  private waiters: Waiter<T>[] = [];
  private closed = false;
  private draining = false;
  private onClose?: () => void;

  constructor(onClose?: () => void) {
    this.onClose = onClose;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  push(value: T): void {
    if (this.closed) return;
    const w = this.waiters.shift();
    if (w) w({ value, done: false });
    else this.buffer.push(value);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.buffer = [];
    for (const w of this.waiters.splice(0)) w({ value: undefined, done: true });
    this.onClose?.();
  }

  drainThenClose(): void {
    this.draining = true;
    if (this.buffer.length === 0) this.close();
  }

  next(): Promise<IteratorResult<T>> {
    if (this.buffer.length > 0) {
      const value = this.buffer.shift() as T;
      return Promise.resolve({ value, done: false });
    }
    if (this.closed || this.draining) {
      this.close();
      return Promise.resolve({ value: undefined, done: true });
    }
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  return(): Promise<IteratorResult<T>> {
    this.close();
    return Promise.resolve({ value: undefined, done: true });
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<T> {
    return this;
  }
}
