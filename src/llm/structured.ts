import {
  generateText,
  JSONParseError,
  type LanguageModel,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  TypeValidationError,
} from 'ai';
import type { z } from 'zod';
import { FeedDetectorError, toFeedDetectorError } from '../errors';

function isSchemaFailure(e: unknown): boolean {
  return (
    NoObjectGeneratedError.isInstance(e) ||
    NoOutputGeneratedError.isInstance(e) ||
    TypeValidationError.isInstance(e) ||
    JSONParseError.isInstance(e)
  );
}

function errorText(e: unknown): string {
  if (e && typeof e === 'object' && 'issues' in e)
    return JSON.stringify((e as { issues: unknown }).issues);
  return e instanceof Error ? e.message : String(e);
}

/**
 * Structured output through the AI SDK (`generateText` + `Output.object`, temperature 0),
 * with one repair retry. Throws `LLM_INVALID_RESPONSE` or `LLM_UNAVAILABLE`.
 */
export async function generateStructured<T>(args: {
  model: LanguageModel;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  signal?: AbortSignal;
}): Promise<T> {
  const { model, schema, system, prompt, signal } = args;
  let problem = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const text =
      attempt === 0
        ? prompt
        : `${prompt}\n\nYour previous answer was invalid: ${problem}. Return valid JSON only.`;
    try {
      const result = await generateText({
        model,
        instructions: system,
        prompt: text,
        output: Output.object({ schema }),
        temperature: 0,
        abortSignal: signal,
      });
      const parsed = schema.safeParse(result.output);
      if (parsed.success) return parsed.data;
      problem = JSON.stringify(parsed.error.issues);
    } catch (e) {
      if (!isSchemaFailure(e)) throw toFeedDetectorError(e, 'LLM_UNAVAILABLE');
      problem = errorText(e);
    }
  }
  throw new FeedDetectorError('LLM_INVALID_RESPONSE', 'Model output did not match the schema', {
    issues: problem,
  });
}
