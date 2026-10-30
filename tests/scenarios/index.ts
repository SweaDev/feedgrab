import type * as Core from '../../src/index';
import type { FeedDescriptor, FeedItem, UnifiedFeed } from '../../src/types';

/** The core API (in the browser: `globalThis.FeedDetector`). */
export type Api = typeof Core;
export type ScenarioContext = { fetchFixture(name: string): Promise<string> };

export type JsonSummary = {
  descriptors: Omit<FeedDescriptor, 'confidence'>[];
  items: {
    id: string;
    feedId: string;
    status: string;
    reasonRuleIds: string[];
    partCount: number;
  }[];
};

export type Scenario = {
  name: string;
  fixture: string;
  run(api: Api, doc: Document, ctx: ScenarioContext): Promise<JsonSummary>;
};

const BASE = 'https://fixture.test/';

function summarize(descriptors: FeedDescriptor[], items: FeedItem[]): JsonSummary {
  return {
    // Order is confidence-based (layout-dependent), so compare descriptors by container.
    descriptors: descriptors
      .map(({ confidence: _, ...d }) => d)
      .sort((a, b) => (a.container.value < b.container.value ? -1 : 1)),
    items: items.map((i) => ({
      id: i.id,
      feedId: i.feedId,
      status: i.status,
      reasonRuleIds: i.reasons.map((r) => r.ruleId),
      partCount: i.parts.length,
    })),
  };
}

async function detectAndOpen(api: Api, doc: Document, fixture: string) {
  const descriptors = await api.detectFeeds(doc);
  const profile = api.createProfile({ url: BASE + fixture, feeds: descriptors });
  const feed: UnifiedFeed = api.openFeed(doc, profile, { live: false, baseUrl: BASE + fixture });
  return { descriptors, feed };
}

function feedScenario(name: string, fixture: string): Scenario {
  return {
    name,
    fixture,
    async run(api, doc) {
      const { descriptors, feed } = await detectAndOpen(api, doc, fixture);
      const summary = summarize(descriptors, feed.items());
      feed.dispose();
      return summary;
    },
  };
}

/** Scenarios shared by Bun (happy-dom) and the browsers (injected bundle). */
export const SCENARIOS: Scenario[] = [
  feedScenario('detect-social', 'social-feed'),
  feedScenario('feed-two-feeds', 'two-feeds'),
  feedScenario('feed-search', 'search-results'),
  feedScenario('detect-product', 'product-grid'),
  feedScenario('detect-css-modules', 'css-modules'),
  feedScenario('detect-nested', 'nested-feeds'),
  {
    name: 'ingest-paginated',
    fixture: 'paginated-1',
    async run(api, doc, ctx) {
      const { descriptors, feed } = await detectAndOpen(api, doc, 'paginated-1');
      feed.ingest(await ctx.fetchFixture('paginated-2'), { url: `${BASE}paginated-2` });
      const summary = summarize(descriptors, feed.items());
      feed.dispose();
      return summary;
    },
  },
];
