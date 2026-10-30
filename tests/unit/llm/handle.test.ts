import { expect, test } from 'bun:test';
import type { FeedDetectorError } from '../../../src/errors';
import { resolveBackend } from '../../../src/llm/backend';
import type { DetectRequest } from '../../../src/llm/contract';
import { handleLlmRequest } from '../../../src/llm/index';
import { mockModel } from '../../helpers/mock-llm';

async function errOf(p: Promise<unknown>): Promise<FeedDetectorError> {
  try {
    await p;
  } catch (e) {
    return e as FeedDetectorError;
  }
  throw new Error('expected rejection');
}

const classify = { task: 'classify', criteria: ['ads'], items: [{ id: 'k1', text: 'Buy now!' }] };
const classifyRes = { results: [{ id: 'k1', exclude: true, criteriaIndex: 0, confidence: 0.8 }] };
const detect: DetectRequest = {
  task: 'detect',
  skeleton: '#0 container=.timeline items=12',
  candidates: [{ index: 0, container: '.timeline', item: ':scope > article', count: 12 }],
};
const detectRes = {
  feeds: [
    {
      candidateIndex: 0,
      containerSelector: '.timeline',
      itemSelector: ':scope > article',
      exclusions: [],
      confidence: 0.9,
    },
  ],
};

test('classify through a mock model', async () => {
  const model = mockModel([classifyRes]);
  expect(await handleLlmRequest(classify, model)).toEqual(classifyRes);
  const call = model.doGenerateCalls[0]!;
  expect(call.temperature).toBe(0);
  expect(JSON.stringify(call.prompt)).toContain('<item id=\\"k1\\">Buy now!</item>');
});

test('detect through a mock model and via resolveBackend', async () => {
  expect(await handleLlmRequest(detect, mockModel([detectRes]))).toEqual(detectRes);
  const backend = resolveBackend(mockModel([detectRes]));
  expect(await backend(detect)).toEqual(detectRes);
});

test('invalid output → one retry, then LLM_INVALID_RESPONSE', async () => {
  const model = mockModel(['{"results": "nope"}', 'not json']);
  const e = await errOf(handleLlmRequest(classify, model));
  expect(e.code).toBe('LLM_INVALID_RESPONSE');
  expect(model.doGenerateCalls.length).toBe(2);
  expect(JSON.stringify(model.doGenerateCalls[1]!.prompt)).toContain(
    'Your previous answer was invalid',
  );
});

test('invalid then valid output succeeds on the retry', async () => {
  const model = mockModel(['{}', classifyRes]);
  expect(await handleLlmRequest(classify, model)).toEqual(classifyRes);
});

test('bad request → LLM_BAD_REQUEST', async () => {
  expect((await errOf(handleLlmRequest({ task: 'other' }, mockModel([])))).code).toBe(
    'LLM_BAD_REQUEST',
  );
  expect(
    (await errOf(handleLlmRequest({ task: 'classify', criteria: [], items: [] }, mockModel([]))))
      .code,
  ).toBe('LLM_BAD_REQUEST');
});
