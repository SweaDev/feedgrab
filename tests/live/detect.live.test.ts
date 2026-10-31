import { describe, expect, test } from 'bun:test';
import { detectFeeds } from '../../src/detect/detect';
import type { FeedgrabError } from '../../src/errors';
import { createModelFromEnv } from '../../src/llm/index';
import { allProviders } from '../../src/llm/providers';
import { resolveContainers } from '../../src/selector/evaluate';
import { loadFixture } from '../helpers/dom';

describe.skipIf(!process.env.FD_LLM_MODEL)('live LLM: detect', () => {
  test('social-feed with the LLM keeps the timeline first', async () => {
    const doc = loadFixture('social-feed');
    const errors: FeedgrabError[] = [];
    const feeds = await detectFeeds(doc, {
      llm: createModelFromEnv(allProviders),
      onLlmError: (e) => errors.push(e),
    });
    if (errors.length)
      console.warn(
        'LLM errors (heuristic fallback used):',
        errors.map((e) => e.message),
      );
    expect(feeds.length).toBeGreaterThan(0);
    expect(resolveContainers(doc, feeds[0]!)).toEqual([doc.querySelector('.timeline')!]);
  }, 120_000);
});
