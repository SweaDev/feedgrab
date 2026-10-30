import { FeedDetectorError, toFeedDetectorError } from '../errors';
import { type LlmProxyFn, type LlmTask, type ResponseFor, responseSchemaFor } from './contract';

/** Validates a raw response for a task; throws `LLM_INVALID_RESPONSE`. */
export function validateResponse<T extends LlmTask>(task: T, res: unknown): ResponseFor<T> {
  const parsed = responseSchemaFor(task).safeParse(res);
  if (!parsed.success) {
    throw new FeedDetectorError('LLM_INVALID_RESPONSE', `Invalid ${task} response`, {
      issues: parsed.error.issues,
    });
  }
  return parsed.data;
}

/**
 * Page-side LLM backend that forwards requests through `send` (extension messaging,
 * `page.exposeFunction`, …) and validates the answer. The page never holds API keys.
 * @example
 * const llm = createLlmProxy((req) => browser.runtime.sendMessage({ type: 'fd:llm', req }));
 */
export function createLlmProxy(send: LlmProxyFn): LlmProxyFn {
  return async (req, opts) => {
    let res: unknown;
    try {
      res = await send(JSON.parse(JSON.stringify(req)), opts);
    } catch (e) {
      throw toFeedDetectorError(e, 'LLM_UNAVAILABLE');
    }
    return validateResponse(req.task, res);
  };
}

/** True for an AI SDK `LanguageModel` object (has `specificationVersion` and `doGenerate`). */
export function isLanguageModel(x: unknown): boolean {
  return (
    typeof x === 'object' &&
    x !== null &&
    'specificationVersion' in x &&
    typeof (x as { doGenerate?: unknown }).doGenerate === 'function'
  );
}
