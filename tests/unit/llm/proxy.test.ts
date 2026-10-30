import { expect, test } from 'bun:test';
import { FeedDetectorError } from '../../../src/errors';
import { resolveBackend } from '../../../src/llm/backend';
import type { ClassifyRequest, LlmRequest } from '../../../src/llm/contract';
import { createLlmProxy, isLanguageModel } from '../../../src/llm/proxy';

const req: ClassifyRequest = {
  task: 'classify',
  criteria: ['ads'],
  items: [{ id: 'a', text: 'Buy now' }],
};
async function errOf(p: Promise<unknown>): Promise<FeedDetectorError> {
  try {
    await p;
  } catch (e) {
    return e as FeedDetectorError;
  }
  throw new Error('expected rejection');
}

const good = { results: [{ id: 'a', exclude: true, criteriaIndex: 0, confidence: 0.9 }] };

test('valid round trip (request is cloned)', async () => {
  let seen: LlmRequest | undefined;
  const proxy = createLlmProxy(async (r) => {
    seen = r;
    return good;
  });
  expect(await proxy(req)).toEqual(good);
  expect(seen).toEqual(req);
  expect(seen).not.toBe(req);
});

test('invalid response → LLM_INVALID_RESPONSE', async () => {
  const proxy = createLlmProxy(async () => ({ results: [{ id: 'a', exclude: 'yes' }] }));
  const e = await errOf(proxy(req));
  expect(e).toBeInstanceOf(FeedDetectorError);
  expect(e.code).toBe('LLM_INVALID_RESPONSE');
});

test('transport failure → LLM_UNAVAILABLE', async () => {
  const proxy = createLlmProxy(async () => {
    throw new Error('offline');
  });
  expect((await errOf(proxy(req))).code).toBe('LLM_UNAVAILABLE');
});

test('abort signal is passed through', async () => {
  const ac = new AbortController();
  let signal: AbortSignal | undefined;
  const proxy = createLlmProxy(async (_r, opts) => {
    signal = opts?.signal;
    return good;
  });
  await proxy(req, { signal: ac.signal });
  expect(signal).toBe(ac.signal);
});

test('resolveBackend validates function backends', async () => {
  const ok = resolveBackend(async () => good);
  expect((await ok(req)).results[0]!.exclude).toBe(true);
  const bad = resolveBackend(async () => ({ feeds: 1 }));
  expect((await errOf(bad(req))).code).toBe('LLM_INVALID_RESPONSE');
});

test('isLanguageModel', () => {
  const fake = {
    specificationVersion: 'v4',
    provider: 'x',
    modelId: 'y',
    doGenerate: async () => ({}),
  };
  expect(isLanguageModel(fake)).toBe(true);
  expect(isLanguageModel(async () => ({}))).toBe(false);
  expect(isLanguageModel({ specificationVersion: 'v4' })).toBe(false);
  expect(isLanguageModel(null)).toBe(false);
});
