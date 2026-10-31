import { expect, test } from 'bun:test';
import { detectFeeds } from '../../../src/detect/detect';
import type { FeedgrabError } from '../../../src/errors';
import { openFeed } from '../../../src/feed/unified-feed';
import type { ClassifyRequest } from '../../../src/llm/contract';
import { createProfile } from '../../../src/profile/profile';
import type { FeedItem, LlmBackend } from '../../../src/types';
import { fixtureTruth, loadFixture } from '../../helpers/dom';
import { fnBackend } from '../../helpers/mock-llm';

const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));

async function setup(llm: LlmBackend) {
  const doc = loadFixture('social-feed');
  const [d] = await detectFeeds(doc);
  const profile = createProfile({
    url: doc.URL,
    feeds: [{ ...d!, exclude: [{ kind: 'llm-text', criteria: 'sponsored posts' }] }],
  });
  const feed = openFeed(doc, profile, { llm, classifier: { batchDelayMs: 0, batchSize: 20 } });
  return { doc, feed, truth: fixtureTruth(doc) };
}

const sponsoredBackend = () =>
  fnBackend((req) => ({
    results: (req as ClassifyRequest).items.map((it) => ({
      id: it.id,
      exclude: it.text.includes('Sponsored'),
      criteriaIndex: 0,
      confidence: 0.95,
    })),
  }));

test('pending → excluded/kept; only non-builtin items are sent', async () => {
  const llm = sponsoredBackend();
  const { feed, truth } = await setup(llm);
  const items = feed.items();
  const status = () => feed.items().map((i) => i.status);
  expect(status().filter((s) => s === 'pending').length).toBe(10);
  expect(items[3]!.status).toBe('excluded');
  const it = feed.iterate({ status: 'excluded', includePending: false, live: true });
  const updated: [string, string][] = [];
  feed.on('item:updated', (item, prev) => updated.push([prev, item.status]));
  await wait(10);
  expect(llm.calls.length).toBe(1);
  const sent = (llm.calls[0]!.req as ClassifyRequest).items;
  expect(sent.length).toBe(10);
  expect(sent.some((s) => s.text.includes('SuperBlend'))).toBe(false);
  const post10 = feed.items()[9]!;
  expect(post10.element).toBe(truth.excluded.get('llm')![0]!);
  expect(post10.status).toBe('excluded');
  expect(post10.reasons[0]).toMatchObject({
    kind: 'llm-text',
    criteria: 'sponsored posts',
    confidence: 0.95,
  });
  expect(status().filter((s) => s === 'kept').length).toBe(9);
  expect(updated.length).toBe(10);
  const yielded: FeedItem[] = [];
  for (let i = 0; i < 3; i++) yielded.push((await it.next()).value);
  feed.dispose();
  expect((await it.next()).done).toBe(true);
  expect(yielded.map((i) => i.element.className)).toEqual(['post', 'post promoted', 'post']);
  expect(yielded.filter((i) => i.element === post10.element).length).toBe(1);
});

test('classifier errors → feed:error and items kept', async () => {
  const llm = fnBackend(() => {
    throw new Error('down');
  });
  const { feed } = await setup(llm);
  const errors: FeedgrabError[] = [];
  feed.on('feed:error', ({ error }) => errors.push(error));
  await wait(600);
  expect(llm.calls.length).toBe(2);
  expect(errors.length).toBe(1);
  expect(feed.items().filter((i) => i.status === 'kept').length).toBe(10);
  feed.dispose();
});

test('no backend: llm-text rules are ignored', async () => {
  const doc = loadFixture('social-feed');
  const [d] = await detectFeeds(doc);
  const profile = createProfile({
    url: doc.URL,
    feeds: [{ ...d!, exclude: [{ kind: 'llm-text', criteria: 'sponsored posts' }] }],
  });
  const feed = openFeed(doc, profile);
  expect(feed.items().filter((i) => i.status === 'pending').length).toBe(0);
});

test('dispose aborts the classifier', async () => {
  const llm = fnBackend(() => new Promise(() => {}));
  const { feed } = await setup(llm);
  await wait(5);
  expect(llm.calls[0]!.signal!.aborted).toBe(false);
  feed.dispose();
  expect(llm.calls[0]!.signal!.aborted).toBe(true);
});
