import { expect, test } from 'bun:test';
import { detectFeeds } from '../../../src/detect/detect';
import type { FeedgrabError } from '../../../src/errors';
import { loadFixture } from '../../helpers/dom';
import { fnBackend } from '../../helpers/mock-llm';

const feed = (over: Record<string, unknown> = {}) => ({
  candidateIndex: 0,
  containerSelector: '.timeline',
  itemSelector: ':scope > article.post',
  exclusions: [],
  confidence: 0.8,
  ...over,
});

test('LLM refines the item selector with blended confidence', async () => {
  const doc = loadFixture('social-feed');
  const [heuristic] = await detectFeeds(doc);
  const llm = fnBackend(() => ({ feeds: [feed()] }));
  const [d] = await detectFeeds(doc, { llm });
  expect(llm.calls.length).toBe(1);
  const req = llm.calls[0]!.req;
  expect(req.task).toBe('detect');
  expect(d!.source).toBe('llm');
  expect(d!.item.value).toBe(':scope > article.post');
  expect(d!.confidence).toBe(Math.round((0.4 + 0.5 * heuristic!.confidence) * 1e4) / 1e4);
});

test('an invalid container is dropped (heuristic kept)', async () => {
  const doc = loadFixture('social-feed');
  const heuristic = await detectFeeds(doc);
  const out = await detectFeeds(doc, {
    llm: fnBackend(() => ({
      feeds: [feed({ containerSelector: '.nope' }), feed({ containerSelector: '[[' })],
    })),
  });
  expect(out).toEqual(heuristic);
});

test('implausible item counts are dropped', async () => {
  const doc = loadFixture('social-feed');
  const out = await detectFeeds(doc, {
    llm: fnBackend(() => ({ feeds: [feed({ itemSelector: ':scope > nothing' })] })),
  });
  expect(out[0]!.source).toBe('heuristic');
});

test('an invalid exclusion is dropped while the feed is kept', async () => {
  const doc = loadFixture('social-feed');
  const [d] = await detectFeeds(doc, {
    llm: fnBackend(() => ({
      feeds: [
        feed({
          exclusions: [
            { selector: '[[', scope: 'item' },
            { selector: '.not-there', scope: 'item' },
            { selector: '.promoted', scope: 'item' },
          ],
        }),
      ],
    })),
  });
  expect(d!.source).toBe('llm');
  expect(d!.exclude.length).toBe(1);
  expect(d!.exclude[0]).toMatchObject({
    kind: 'selector',
    selector: { type: 'css', value: '.promoted' },
    scope: 'item',
    origin: 'llm',
  });
  expect(d!.exclude[0]!.id).toMatch(/^r_/);
});

test('backend throws → heuristic result and onLlmError', async () => {
  const doc = loadFixture('two-feeds');
  const heuristic = await detectFeeds(doc);
  const errors: FeedgrabError[] = [];
  const out = await detectFeeds(doc, {
    llm: fnBackend(() => {
      throw new Error('offline');
    }),
    onLlmError: (e) => errors.push(e),
  });
  expect(out).toEqual(heuristic);
  expect(errors.length).toBe(1);
  expect(errors[0]!.code).toBe('LLM_UNAVAILABLE');
});

test('invalid response shape → heuristic and LLM_INVALID_RESPONSE', async () => {
  const doc = loadFixture('two-feeds');
  const errors: FeedgrabError[] = [];
  const out = await detectFeeds(doc, {
    llm: fnBackend(() => ({ nope: 1 })),
    onLlmError: (e) => errors.push(e),
  });
  expect(out).toEqual(await detectFeeds(doc));
  expect(errors[0]!.code).toBe('LLM_INVALID_RESPONSE');
});
