import type { LanguageModel } from 'ai';
import { toFeedgrabError } from '../errors';
import type { LlmBackend } from '../types';
import type { LlmRequest, ResponseFor } from './contract';
import { validateResponse } from './proxy';

/** A backend that answers validated responses. */
export type ResolvedBackend = <R extends LlmRequest>(
  req: R,
  opts?: { signal?: AbortSignal },
) => Promise<ResponseFor<R['task']>>;

/**
 * Normalizes an `LlmBackend`: proxy functions get their responses validated; models are run
 * through the lazily imported `run-model` (keeps `ai` out of the core unless a model is used).
 */
export function resolveBackend(b: LlmBackend): ResolvedBackend {
  if (typeof b === 'function') {
    return async (req, opts) => {
      let res: unknown;
      try {
        res = await b(req, opts);
      } catch (e) {
        throw toFeedgrabError(e, 'LLM_UNAVAILABLE');
      }
      return validateResponse(req.task, res) as never;
    };
  }
  const model = b as LanguageModel;
  return async (req, opts) => {
    const { runModel } = await import('./run-model');
    return validateResponse(req.task, await runModel(req, model, opts)) as never;
  };
}
