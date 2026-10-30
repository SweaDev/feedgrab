import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { ProviderFactories } from './models';

/** All four provider factories (statically imports the optional peer packages). */
export const allProviders: Required<ProviderFactories> = {
  ollama: createOpenAICompatible,
  openai: createOpenAI,
  openrouter: createOpenRouter,
  gemini: createGoogleGenerativeAI,
};
