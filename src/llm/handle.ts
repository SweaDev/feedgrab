import type { LanguageModel } from 'ai';
import { FeedDetectorError } from '../errors';
import {
  ClassifyResponseSchema,
  DetectResponseSchema,
  type LlmRequest,
  LlmRequestSchema,
  type LlmResponse,
} from './contract';
import { classifyPrompt, detectPrompt } from './prompts';
import { generateStructured } from './structured';

/**
 * Host-side handler for proxied LLM requests: validates the request, runs it against the
 * model and returns plain JSON. Throws `LLM_BAD_REQUEST`, `LLM_INVALID_RESPONSE`, `LLM_UNAVAILABLE`.
 * @example
 * browser.runtime.onMessage.addListener((msg) => handleLlmRequest(msg.req, model));
 */
export async function handleLlmRequest(
  req: unknown,
  model: LanguageModel,
  opts: { signal?: AbortSignal } = {},
): Promise<LlmResponse> {
  const parsed = LlmRequestSchema.safeParse(req);
  if (!parsed.success) {
    throw new FeedDetectorError('LLM_BAD_REQUEST', 'Malformed LLM request', {
      issues: parsed.error.issues,
    });
  }
  const r: LlmRequest = parsed.data;
  if (r.task === 'detect') {
    return generateStructured({
      model,
      schema: DetectResponseSchema,
      ...detectPrompt(r),
      signal: opts.signal,
    });
  }
  return generateStructured({
    model,
    schema: ClassifyResponseSchema,
    ...classifyPrompt(r),
    signal: opts.signal,
  });
}
