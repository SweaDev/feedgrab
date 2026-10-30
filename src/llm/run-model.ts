import type { LanguageModel } from 'ai';

/** Runs an LLM request against a `LanguageModel` (implemented in T15). */
export async function runModel(
  _req: unknown,
  _model: LanguageModel,
  _opts?: { signal?: AbortSignal },
): Promise<unknown> {
  throw new Error('not implemented');
}
