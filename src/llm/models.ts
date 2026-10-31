import type { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { createOpenAI } from '@ai-sdk/openai';
import type { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { LanguageModel } from 'ai';
import { FeedgrabError } from '../errors';
import { DEFAULT_BASE_URLS, type LlmConfig, LlmConfigSchema, readEnvConfig } from './config';

/** Provider factories, injected so bundlers never resolve packages that aren't installed. */
export type ProviderFactories = {
  ollama?: typeof createOpenAICompatible;
  openai?: typeof createOpenAI;
  openrouter?: typeof createOpenRouter;
  gemini?: typeof createGoogleGenerativeAI;
};

const PACKAGES: Record<LlmConfig['provider'], string> = {
  ollama: '@ai-sdk/openai-compatible',
  openai: '@ai-sdk/openai',
  openrouter: '@openrouter/ai-sdk-provider',
  gemini: '@ai-sdk/google',
};

function missing(provider: LlmConfig['provider']): FeedgrabError {
  return new FeedgrabError(
    'LLM_PROVIDER_MISSING',
    `No factory for provider "${provider}": install ${PACKAGES[provider]} and pass it (e.g. allProviders from "feedgrab/llm/providers")`,
    { provider, package: PACKAGES[provider] },
  );
}

/**
 * Builds a `LanguageModel` from a config and injected provider factories (synchronous).
 * @example
 * import { allProviders } from 'feedgrab/llm/providers';
 * const model = createModel({ provider: 'ollama', model: 'llama3.2' }, allProviders);
 */
export function createModel(config: LlmConfig, providers: ProviderFactories): LanguageModel {
  const parsed = LlmConfigSchema.safeParse(config);
  if (!parsed.success) {
    throw new FeedgrabError('LLM_CONFIG', 'Invalid LLM configuration', {
      issues: parsed.error.issues,
    });
  }
  const { provider, model, apiKey } = parsed.data;
  const baseURL = parsed.data.baseURL ?? DEFAULT_BASE_URLS[provider];
  switch (provider) {
    case 'ollama': {
      if (!providers.ollama) throw missing(provider);
      return providers.ollama({ name: 'ollama', baseURL: baseURL as string, apiKey })(model);
    }
    case 'openai': {
      if (!providers.openai) throw missing(provider);
      return providers.openai({ apiKey, baseURL })(model);
    }
    case 'openrouter': {
      if (!providers.openrouter) throw missing(provider);
      return providers.openrouter({ apiKey, baseURL })(model);
    }
    case 'gemini': {
      if (!providers.gemini) throw missing(provider);
      return providers.gemini({ apiKey, baseURL })(model);
    }
  }
}

/** `createModel(readEnvConfig(env), providers)`; throws `LLM_CONFIG` when `FD_LLM_MODEL` is unset. */
export function createModelFromEnv(
  providers: ProviderFactories,
  env?: Record<string, string | undefined>,
): LanguageModel {
  const config = readEnvConfig(env);
  if (!config) throw new FeedgrabError('LLM_CONFIG', 'FD_LLM_MODEL is not set');
  return createModel(config, providers);
}
