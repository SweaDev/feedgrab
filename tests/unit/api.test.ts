import { expect, test } from 'bun:test';
import pkg from '../../package.json';
import * as article from '../../src/article';
import * as core from '../../src/index';
import * as llm from '../../src/llm/index';
import * as providers from '../../src/llm/providers';
import * as overlay from '../../src/overlay/index';
import * as page from '../../src/page';
import * as server from '../../src/server';

const valueKeys = (m: object) => Object.keys(m).sort();

test('feedgrab (core) value exports', () => {
  expect(valueKeys(core)).toEqual(
    [
      'detectFeeds',
      'inspectFromElement',
      'detectFromSelector',
      'suggestPermalinkParams',
      'suggestPermalinks',
      'suggestStructure',
      'matchStructure',
      'findReferenceItem',
      'captureSample',
      'checkDescriptor',
      'contentField',
      'describeFeed',
      'FIELD_NAMES',
      'fieldRuleFor',
      'suggestFields',
      'structureCoverage',
      'partCoverage',
      'partText',
      'generateSelector',
      'registerProvider',
      'resolveProvider',
      'canonicalUrl',
      'permalinkId',
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
      'FeedgrabError',
      'BUILTIN_RULES',
      'VERSION',
    ].sort(),
  );
  expect(core.VERSION).toBe(pkg.version);
});

test('feedgrab/llm, /llm/providers, /server, /overlay, /page, /article', () => {
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
  expect(valueKeys(page)).toEqual(['describePage']);
  expect(valueKeys(article)).toEqual(['extractArticle']);
  expect(typeof overlay.openOverlay).toBe('function');
  expect(typeof overlay.pickElement).toBe('function');
  expect(typeof overlay.createHighlighter).toBe('function');
  expect(overlay.DARK_THEME.colorScheme).toBe('dark');
  expect(overlay.DEFAULT_THEME.colors.feed).toBe('#2563eb');
});
