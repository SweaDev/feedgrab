import { expect, test } from 'bun:test';
import pkg from '../../package.json';
import * as core from '../../src/index';
import * as llm from '../../src/llm/index';
import * as providers from '../../src/llm/providers';
import * as overlay from '../../src/overlay/index';
import * as server from '../../src/server';

const valueKeys = (m: object) => Object.keys(m).sort();

test('feed-detector (core) value exports', () => {
  expect(valueKeys(core)).toEqual(
    [
      'detectFeeds',
      'inspectFromElement',
      'detectFromSelector',
      'validateSelector',
      'matchSelector',
      'openFeed',
      'removeItem',
      'removeParts',
      'matchProfile',
      'createProfile',
      'serializeProfile',
      'parseProfile',
      'CURRENT_PROFILE_VERSION',
      'createLlmProxy',
      'registerXPathEngine',
      'FeedDetectorError',
      'BUILTIN_RULES',
      'VERSION',
    ].sort(),
  );
  expect(core.VERSION).toBe(pkg.version);
});

test('feed-detector/llm, /llm/providers, /server, /overlay', () => {
  for (const k of ['handleLlmRequest', 'createModel', 'createModelFromEnv', 'readEnvConfig']) {
    expect(typeof (llm as Record<string, unknown>)[k]).toBe('function');
  }
  expect(Object.keys(providers.allProviders).sort()).toEqual([
    'gemini',
    'ollama',
    'openai',
    'openrouter',
  ]);
  expect(valueKeys(server)).toEqual(['disposeDocument', 'parseHtml']);
  expect(typeof overlay.openOverlay).toBe('function');
  expect(typeof overlay.pickElement).toBe('function');
  expect(overlay.DEFAULT_THEME.colors.feed).toBe('#2563eb');
});
