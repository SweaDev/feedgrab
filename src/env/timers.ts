type Timers = {
  setTimeout: (fn: () => void, ms?: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  queueMicrotask: (fn: () => void) => void;
  now: () => number;
};

const defaults: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof globalThis.setTimeout>),
  queueMicrotask: (fn) => globalThis.queueMicrotask(fn),
  now: () => globalThis.performance?.now() ?? Date.now(),
};

/** Timer functions used by the library; stub with `__setTimers` in tests. */
export const timers: Timers = { ...defaults };

/** Test-only: override timer functions. Call with no argument to reset. */
export function __setTimers(partial?: Partial<Timers>): void {
  Object.assign(timers, defaults, partial ?? {});
}
