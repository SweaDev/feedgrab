import { expect, test } from 'bun:test';
import type { FeedgrabError } from '../../../src/errors';
import { createModel, createModelFromEnv, readEnvConfig } from '../../../src/llm/index';
import { allProviders } from '../../../src/llm/providers';

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return (e as FeedgrabError).code;
  }
  return 'none';
}

test('env parsing', () => {
  expect(readEnvConfig({})).toBeNull();
  expect(readEnvConfig({ FD_LLM_PROVIDER: 'openai' })).toBeNull();
  expect(readEnvConfig({ FD_LLM_MODEL: 'llama3.2' })).toEqual({
    provider: 'ollama',
    model: 'llama3.2',
    baseURL: 'http://localhost:11434/v1',
  });
  expect(
    readEnvConfig({ FD_LLM_PROVIDER: 'openai', FD_LLM_MODEL: 'gpt-x', FD_LLM_API_KEY: 'k' }),
  ).toEqual({
    provider: 'openai',
    model: 'gpt-x',
    apiKey: 'k',
  });
  expect(codeOf(() => readEnvConfig({ FD_LLM_PROVIDER: 'nope', FD_LLM_MODEL: 'm' }))).toBe(
    'LLM_CONFIG',
  );
  expect(codeOf(() => readEnvConfig({ FD_LLM_MODEL: 'm', FD_LLM_BASE_URL: 'not a url' }))).toBe(
    'LLM_CONFIG',
  );
});

test('createModel calls the injected factory', () => {
  const calls: unknown[] = [];
  const fakeModel = { specificationVersion: 'v4' };
  const openrouter = ((settings: unknown) => {
    calls.push(settings);
    return (id: string) => {
      calls.push(id);
      return fakeModel;
    };
  }) as never;
  const m = createModel(
    { provider: 'openrouter', model: 'meta/llama', apiKey: 'k' },
    { openrouter },
  );
  expect(m).toBe(fakeModel as never);
  expect(calls).toEqual([{ apiKey: 'k', baseURL: 'https://openrouter.ai/api/v1' }, 'meta/llama']);
});

test('missing factory → LLM_PROVIDER_MISSING naming the package', () => {
  try {
    createModel({ provider: 'gemini', model: 'g' }, {});
    throw new Error('expected throw');
  } catch (e) {
    expect((e as FeedgrabError).code).toBe('LLM_PROVIDER_MISSING');
    expect((e as FeedgrabError).message).toContain('@ai-sdk/google');
  }
  expect(codeOf(() => createModelFromEnv(allProviders, {}))).toBe('LLM_CONFIG');
});

test('allProviders builds real models', () => {
  expect(Object.values(allProviders).every((f) => typeof f === 'function')).toBe(true);
  expect(Object.keys(allProviders).length).toBe(4);
  const m = createModelFromEnv(allProviders, { FD_LLM_MODEL: 'llama3.2' }) as { modelId: string };
  expect(m.modelId).toBe('llama3.2');
});
