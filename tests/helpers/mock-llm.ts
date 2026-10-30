import { MockLanguageModelV4 } from 'ai/test';
import type { LlmProxyFn, LlmRequest } from '../../src/llm/contract';

export type RecordingBackend = LlmProxyFn & {
  calls: { req: LlmRequest; signal?: AbortSignal }[];
};

/** Proxy backend with a scripted handler; records every call. */
export function fnBackend(
  handler: (req: LlmRequest, signal?: AbortSignal) => unknown | Promise<unknown>,
): RecordingBackend {
  const calls: RecordingBackend['calls'] = [];
  const fn = (async (req: LlmRequest, opts?: { signal?: AbortSignal }) => {
    calls.push({ req, signal: opts?.signal });
    return handler(req, opts?.signal);
  }) as RecordingBackend;
  fn.calls = calls;
  return fn;
}

/** AI SDK mock model answering each call with the next response (as JSON text). */
export function mockModel(responses: unknown[]): MockLanguageModelV4 {
  let i = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => {
      const r = responses[Math.min(i++, responses.length - 1)];
      return {
        content: [{ type: 'text', text: typeof r === 'string' ? r : JSON.stringify(r) }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
        warnings: [],
      };
    },
  });
}
