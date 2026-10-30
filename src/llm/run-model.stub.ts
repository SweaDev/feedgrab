import type { LanguageModel } from 'ai';
import { FeedDetectorError } from '../errors';

/** Browser-bundle replacement for `run-model.ts`: only proxy backends are supported there. */
export async function runModel(
  _req: unknown,
  _model: LanguageModel,
  _opts?: { signal?: AbortSignal },
): Promise<unknown> {
  throw new FeedDetectorError(
    'LLM_MODEL_UNSUPPORTED_IN_BUNDLE',
    'The browser bundle only accepts a proxy LLM backend (createLlmProxy)',
  );
}
