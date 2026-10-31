import { afterEach, expect, test } from 'bun:test';
import { __setTimers } from '../../../src/env/timers';
import type { FeedgrabError } from '../../../src/errors';
import { classifierKey, LlmClassifier } from '../../../src/exclude/llm-classifier';
import { resolveBackend } from '../../../src/llm/backend';
import type { ClassifyRequest } from '../../../src/llm/contract';
import { fnBackend } from '../../helpers/mock-llm';

// Fake clock: timers run only when advanced.
let now = 0;
let tasks: { at: number; fn: () => void; id: number }[] = [];
let nextId = 1;
function useFakeTimers() {
  now = 0;
  tasks = [];
  __setTimers({
    setTimeout: (fn, ms = 0) => {
      const id = nextId++;
      tasks.push({ at: now + ms, fn, id });
      return id;
    },
    clearTimeout: (id) => {
      tasks = tasks.filter((t) => t.id !== id);
    },
  });
}
const flush = () => new Promise((r) => setImmediate(r));
async function advance(ms: number) {
  now += ms;
  for (;;) {
    const due = tasks.filter((t) => t.at <= now).sort((a, b) => a.at - b.at);
    if (!due.length) break;
    tasks = tasks.filter((t) => !due.includes(t));
    for (const t of due) t.fn();
    await flush();
  }
  await flush();
}

afterEach(() => __setTimers());

const criteria = ['sponsored posts'];
const items = (n: number, prefix = 't') =>
  Array.from({ length: n }, (_, i) => {
    const text = `${prefix} item ${i}`;
    return { key: classifierKey(text, criteria), text };
  });
const answer = (req: ClassifyRequest, exclude = false, confidence = 0.9) => ({
  results: req.items.map((it) => ({ id: it.id, exclude, criteriaIndex: 0, confidence })),
});

test('25 items → batches of 10/10/5 with at most 2 concurrent', async () => {
  useFakeTimers();
  let active = 0;
  let maxActive = 0;
  const releases: (() => void)[] = [];
  const backend = fnBackend(async (req) => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise<void>((r) => releases.push(r));
    active--;
    return answer(req as ClassifyRequest);
  });
  const c = new LlmClassifier(resolveBackend(backend));
  c.enqueue(items(25), criteria);
  await flush();
  expect(backend.calls.length).toBe(2);
  releases.splice(0).forEach((r) => {
    r();
  });
  await flush();
  await advance(250);
  releases.splice(0).forEach((r) => {
    r();
  });
  await flush();
  expect(backend.calls.map((c) => (c.req as ClassifyRequest).items.length)).toEqual([10, 10, 5]);
  expect(maxActive).toBe(2);
  expect(c.verdict(items(25)[24]!.key)).toMatchObject({ exclude: false });
});

test('delay flush after 250 ms and result notification', async () => {
  useFakeTimers();
  const backend = fnBackend((req) => answer(req as ClassifyRequest, true));
  const c = new LlmClassifier(resolveBackend(backend));
  const got: string[][] = [];
  c.onResult((keys) => got.push(keys));
  const [one] = items(1);
  c.enqueue([one!], criteria);
  expect(c.verdict(one!.key)).toBe('pending');
  await advance(249);
  expect(backend.calls.length).toBe(0);
  await advance(1);
  expect(backend.calls.length).toBe(1);
  expect(c.verdict(one!.key)).toEqual({ exclude: true, criteriaIndex: 0, confidence: 0.9 });
  expect(got).toEqual([[one!.key]]);
});

test('cache hit makes no new request; texts are truncated', async () => {
  useFakeTimers();
  const backend = fnBackend((req) => answer(req as ClassifyRequest));
  const c = new LlmClassifier(resolveBackend(backend));
  const long = { key: 'k-long', text: 'x'.repeat(2000) };
  c.enqueue([long], criteria);
  await advance(250);
  c.enqueue([long], criteria);
  await advance(250);
  expect(backend.calls.length).toBe(1);
  expect((backend.calls[0]!.req as ClassifyRequest).items[0]!.text.length).toBe(600);
});

test('confidence threshold', async () => {
  useFakeTimers();
  const c = new LlmClassifier(
    resolveBackend(fnBackend((req) => answer(req as ClassifyRequest, true, 0.4))),
  );
  const [one] = items(1);
  c.enqueue([one!], criteria);
  await advance(250);
  expect(c.verdict(one!.key)).toMatchObject({ exclude: false, confidence: 0.4 });
});

test('failure → one retry → error verdict and onError', async () => {
  useFakeTimers();
  const backend = fnBackend(() => {
    throw new Error('down');
  });
  const errors: FeedgrabError[] = [];
  const c = new LlmClassifier(resolveBackend(backend), { onError: (e) => errors.push(e) });
  const [one] = items(1);
  c.enqueue([one!], criteria);
  await advance(250);
  expect(backend.calls.length).toBe(1);
  await advance(500);
  expect(backend.calls.length).toBe(2);
  expect(c.verdict(one!.key)).toEqual({ exclude: false, confidence: 0, error: true });
  expect(errors.length).toBe(1);
  expect(errors[0]!.code).toBe('LLM_UNAVAILABLE');
});

test('dispose aborts in-flight requests', async () => {
  useFakeTimers();
  const backend = fnBackend(() => new Promise(() => {}));
  const c = new LlmClassifier(resolveBackend(backend));
  c.enqueue(items(10), criteria);
  await flush();
  const signal = backend.calls[0]!.signal!;
  expect(signal.aborted).toBe(false);
  c.dispose();
  expect(signal.aborted).toBe(true);
  expect(c.verdict(items(10)[0]!.key)).toBeUndefined();
});
