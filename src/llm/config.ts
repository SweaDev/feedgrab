import { z } from 'zod/mini';
import { FeedDetectorError } from '../errors';

/** zod schema for `LlmConfig`. */
export const LlmConfigSchema = z.object({
  provider: z.enum(['ollama', 'openai', 'openrouter', 'gemini']),
  model: z.string().check(z.minLength(1)),
  baseURL: z.optional(z.url()),
  apiKey: z.optional(z.string().check(z.minLength(1))),
});

/** Provider + model settings (from `.env`, a settings page, …). */
export type LlmConfig = z.infer<typeof LlmConfigSchema>;

/** Default base URLs; openai and gemini use their provider defaults. */
export const DEFAULT_BASE_URLS: Partial<Record<LlmConfig['provider'], string>> = {
  ollama: 'http://localhost:11434/v1',
  openrouter: 'https://openrouter.ai/api/v1',
};

type Env = Record<string, string | undefined>;

/**
 * Reads `FD_LLM_PROVIDER`, `FD_LLM_MODEL`, `FD_LLM_BASE_URL` and `FD_LLM_API_KEY`.
 * Returns null when `FD_LLM_MODEL` is unset; throws `LLM_CONFIG` on invalid values.
 * @example readEnvConfig(import.meta.env) // in an extension build
 */
export function readEnvConfig(
  env: Env = (globalThis as { process?: { env?: Env } }).process?.env ?? {},
): LlmConfig | null {
  const model = env.FD_LLM_MODEL?.trim();
  if (!model) return null;
  const provider = env.FD_LLM_PROVIDER?.trim() || 'ollama';
  const raw = {
    provider,
    model,
    baseURL:
      env.FD_LLM_BASE_URL?.trim() ||
      DEFAULT_BASE_URLS[provider as LlmConfig['provider']] ||
      undefined,
    apiKey: env.FD_LLM_API_KEY?.trim() || undefined,
  };
  const parsed = LlmConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new FeedDetectorError('LLM_CONFIG', 'Invalid LLM configuration', {
      issues: parsed.error.issues,
    });
  }
  return parsed.data;
}
