import { describe, expect, test } from 'bun:test';
import { detectFeeds } from '../../src/detect/detect';
import { openFeed } from '../../src/feed/unified-feed';
import { createModelFromEnv } from '../../src/llm/index';
import { allProviders } from '../../src/llm/providers';
import { createProfile } from '../../src/profile/profile';
import { fixtureTruth, loadFixture } from '../helpers/dom';

describe.skipIf(!process.env.FD_LLM_MODEL)('live LLM: classify', () => {
  test('the "Sponsored" post is excluded and at least 8 of the 9 normal posts are kept', async () => {
    const doc = loadFixture('social-feed');
    const [d] = await detectFeeds(doc);
    const profile = createProfile({
      url: doc.URL,
      feeds: [
        {
          ...d!,
          exclude: [{ kind: 'llm-text', criteria: 'sponsored, promoted or advertising posts' }],
        },
      ],
    });
    const feed = openFeed(doc, profile, { llm: createModelFromEnv(allProviders) });
    const deadline = Date.now() + 110_000;
    while (feed.items().some((i) => i.status === 'pending') && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 250));
    }
    const truth = fixtureTruth(doc);
    const sponsored = truth.excluded.get('llm')![0]!;
    const builtin = new Set(truth.excluded.get('builtin'));
    const items = feed.items();
    expect(items.find((i) => i.element === sponsored)?.status).toBe('excluded');
    const normal = items.filter((i) => i.element !== sponsored && !builtin.has(i.element));
    expect(normal.length).toBe(9);
    expect(normal.filter((i) => i.status === 'kept').length).toBeGreaterThanOrEqual(8);
    feed.dispose();
  }, 120_000);
});
