// Node smoke test: the built ESM entries import and run under Node (no Bun APIs).
import { readFileSync } from 'node:fs';
import { createProfile, detectFeeds, openFeed } from '../dist/index.js';
import { disposeDocument, parseHtml } from '../dist/server.js';

const url = 'https://fixture.test/social-feed';
const html = readFileSync(new URL('../tests/fixtures/social-feed.html', import.meta.url), 'utf8');
const doc = parseHtml(html, url);
const feeds = await detectFeeds(doc);
if (feeds.length === 0) {
  console.error('node-smoke: no feed detected');
  process.exit(1);
}
const feed = openFeed(doc, createProfile({ url, feeds }), { live: false });
const items = feed.items();
const count = (status) => items.filter((i) => i.status === status).length;
console.log(
  `node-smoke: ${feeds.length} feed(s), ${items.length} items (${count('kept')} kept, ${count('excluded')} excluded)`,
);
feed.dispose();
disposeDocument(doc);
