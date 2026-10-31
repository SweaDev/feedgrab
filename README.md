# Feedgrab

A TypeScript library that **finds and describes content feeds** in web pages (post timelines,
search results, product grids, article lists) and turns them into one de-duplicated stream of
items with exclusion reports (ads, promoted posts, injected widgets).

- **Detect** feeds automatically (structural heuristics, optionally refined by an LLM), by
  inspecting an element, or from CSS/XPath selectors you type.
- **Confirm/edit** the proposals in a Shadow-DOM overlay, or programmatically with headless helpers.
- **Iterate** a unified feed that keeps up with infinite scroll (`MutationObserver`) or pagination
  (`ingest`), with a report per item: `kept`, `excluded` (and why), or `pending`.
- **Exclude** items by specificity-ranked selector rules, built-in ad rules, or plain-language LLM
  criteria. Nothing is removed unless you call a removal helper.

It runs in **browser extensions** (Chromium + Firefox, MV3), **headless browsers** (Playwright/Puppeteer,
injected bundle), and **server-side** (Bun/Node with a parsed DOM), using the same API everywhere.

## Install

```sh
bun add feedgrab        # or npm i feedgrab
```

Optional peer dependencies, install only what you use:

| Need | Package |
|---|---|
| Server-side parsing (`parseHtml`) | `happy-dom` |
| Ollama (local) | `@ai-sdk/openai-compatible` |
| OpenAI | `@ai-sdk/openai` |
| OpenRouter | `@openrouter/ai-sdk-provider` |
| Gemini | `@ai-sdk/google` |

### Entry points

| Import | Contents |
|---|---|
| `feedgrab` | Core: detection, profiles, unified feed, removal helpers, `createLlmProxy` |
| `feedgrab/overlay` | `openOverlay`, `pickElement`, `DEFAULT_THEME`, `themeToCss` |
| `feedgrab/server` | `parseHtml`, `disposeDocument` (happy-dom) |
| `feedgrab/llm` | `handleLlmRequest`, `createModel`, `createModelFromEnv`, `readEnvConfig` |
| `feedgrab/llm/providers` | `allProviders` (statically imports the four provider packages) |
| `feedgrab/browser` | Prebuilt IIFE exposing a `Feedgrab` global (core + overlay) |

## Quick start

### Browser extension (content script)

```ts
import { createLlmProxy, detectFeeds, matchProfile, openFeed, removeItem } from 'feedgrab';
import { openOverlay } from 'feedgrab/overlay';

// The page never holds API keys: LLM calls go to the background (see "LLM configuration").
const llm = createLlmProxy(async (req) => {
  const reply = await browser.runtime.sendMessage({ type: 'fd:llm', req });
  if (!reply.ok) throw new Error(reply.error.message);
  return reply.res;
});

// 1. First visit: detect, let the user confirm, store the profile yourself.
const proposals = await detectFeeds(document, { llm });
const profile = await openOverlay(document, proposals, { llm });
await saveProfile(profile); // your storage

// 2. Later visits: match a stored profile and act on each item.
const match = matchProfile(location.href, await loadProfiles());
if (match) {
  const feed = openFeed(document, match, { llm });
  for await (const item of feed) {
    if (item.status === 'excluded') removeItem(item); // hide (default) or { mode: 'detach' }
  }
}
```

In the background service worker:

```ts
import { createModel, handleLlmRequest, readEnvConfig } from 'feedgrab/llm';
import { allProviders } from 'feedgrab/llm/providers';

const model = createModel(readEnvConfig(import.meta.env)!, allProviders);
browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'fd:llm') return;
  handleLlmRequest(msg.req, model).then(
    (res) => sendResponse({ ok: true, res }),
    (e) => sendResponse({ ok: false, error: { code: e.code, message: e.message } }),
  );
  return true;
});
```

A complete WXT example (popup, options page, background proxy, content script) lives in
[`examples/extension`](examples/extension/README.md).

### Headless browser (Playwright)

```ts
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createModelFromEnv, handleLlmRequest } from 'feedgrab/llm';
import { allProviders } from 'feedgrab/llm/providers';

const model = createModelFromEnv(allProviders); // FD_LLM_* from the environment
const page = await (await chromium.launch()).newPage();
await page.exposeFunction('fdLlm', (req: unknown) => handleLlmRequest(req, model));
await page.goto('https://example.com/feed');
await page.addScriptTag({ path: fileURLToPath(import.meta.resolve('feedgrab/browser')) });

const items = await page.evaluate(async () => {
  const llm = Feedgrab.createLlmProxy((req) => window.fdLlm(req));
  const feeds = await Feedgrab.detectFeeds(document, { llm });
  const feed = Feedgrab.openFeed(document, Feedgrab.createProfile({ url: location.href, feeds }), { llm });
  // ...scroll the page from Playwright; the observer picks up new items...
  return feed.items().map((i) => ({ id: i.id, status: i.status }));
});
```

The IIFE bundle only accepts the proxy form of an LLM backend. Passing a `LanguageModel` inside the
page throws `LLM_MODEL_UNSUPPORTED_IN_BUNDLE`.

### Server (Bun/Node)

```ts
import { createProfile, detectFeeds, openFeed } from 'feedgrab';
import { createModelFromEnv } from 'feedgrab/llm';
import { allProviders } from 'feedgrab/llm/providers';
import { disposeDocument, parseHtml } from 'feedgrab/server';

const url = 'https://example.com/list?page=1';
const doc = parseHtml(await (await fetch(url)).text(), url); // scripts are never executed
const feeds = await detectFeeds(doc); // add { llm: createModelFromEnv(allProviders) } to refine
const feed = openFeed(doc, createProfile({ url, feeds })); // live: false for parsed documents

// Pagination / "load more": fetch the next page yourself and ingest it.
const next = 'https://example.com/list?page=2';
const added = feed.ingest(await (await fetch(next)).text(), { url: next }); // de-duplicated

for await (const item of feed) console.log(item.id, item.status, item.sourceUrl ?? url);
feed.dispose();
disposeDocument(doc);
```

## Core concepts

- **FeedDescriptor**: one feed as serializable data: a `container` selector (may match several
  containers), an `item` selector evaluated **relative to each container** (generated selectors look
  like `:scope > article`), `exclude`/`include` rules, `source`, `confidence`, `confirmed`.
- **SiteProfile**: every descriptor for one page type, keyed by `hostname` + `pathPattern`
  (`*` = one segment, `**` = any number, `post-*` = wildcard within a segment).
  `matchProfile(url, profiles)` picks the most specific match. Profiles are plain JSON
  (`serializeProfile` / `parseProfile`, which validates and migrates by `version`). **You** store them.
- **Unified feed**: items of every feed (and of ingested pages) in document order, de-duplicated by a
  stable id (canonical permalink, else text hash). Each `FeedItem` has `status`, `reasons`
  (rule id, origin `builtin`/`user`/`llm`, criteria and confidence for LLM rules), `parts` (sub-elements
  matched by `part` rules), `connected`, `rescuedBy`, and `sourceUrl` for ingested pages.
- **Statuses**: `kept`, `excluded`, or `pending` (waiting for an LLM verdict; shown, but don't act on
  it yet). Events: `item:added`, `item:updated` (status change), `item:removed`, `feed:lost`
  (layout changed, so detect again), `feed:error`.
- **Precedence**: user selector rules (rank 3) > LLM-proposed rules and LLM text verdicts (2) >
  built-ins (1); within a rank, more specific selectors win. An `include` rule rescues an item from an
  equally or less specific exclusion.

## API reference

| Function | Entry | Description |
|---|---|---|
| `detectFeeds(doc, opts?)` | core | Propose feeds (heuristic, optional LLM refine). Never throws for LLM errors (`onLlmError`). |
| `inspectFromElement(el, { minItems? })` | core | Walk up from any element to the nearest repeating group. |
| `detectFromSelector(doc, { container?, item? })` | core | Build a descriptor from CSS/XPath selectors. |
| `validateSelector(doc, sel)` | core | `{ valid, count, error? }`; never throws. |
| `matchSelector(doc, sel, { root? })` | core | Matched elements, plus `boxes` when the page has layout. |
| `openFeed(doc, profile, opts?)` | core | Open the `UnifiedFeed`: `items()`, `iterate()`, `for await`, `on/off/once`, `ingest()`, `dispose({ restore? })`. |
| `removeItem(item, { mode? })` / `removeParts(item, { mode? })` | core | `'hide'` (default) or `'detach'`; returns `{ restore(): boolean }`. |
| `createProfile({ url, pathPattern?, feeds })` | core | Profile for a page type. |
| `matchProfile(url, profiles)` | core | Most specific profile, or `undefined`. |
| `serializeProfile(p)` / `parseProfile(s)` | core | Stable JSON / validated + migrated parse. |
| `createLlmProxy(send)` | core | Page-side LLM backend that forwards requests and validates responses. |
| `registerXPathEngine(engine)` | core | XPath fallback for DOMs without `document.evaluate`. |
| `BUILTIN_RULES`, `CURRENT_PROFILE_VERSION`, `FeedgrabError` | core | Constants and the error class (`code`, `details`). |
| `openOverlay(doc, proposals, opts?)` | overlay | Confirm/edit UI; resolves with a `SiteProfile`. |
| `pickElement(doc, { filter?, signal? })` | overlay | Let the user click an element. |
| `parseHtml(html, url?)` / `disposeDocument(doc)` | server | Parse HTML with happy-dom (no scripts, no resource loading). |
| `handleLlmRequest(req, model, opts?)` | llm | Host-side handler for proxied requests. |
| `createModel(config, providers)` / `createModelFromEnv(providers, env?)` | llm | Build a `LanguageModel` from config (providers injected). |
| `readEnvConfig(env?)` | llm | Read `FD_LLM_*`; `null` when no model is set. |
| `allProviders` | llm/providers | Factories for ollama, openai, openrouter, gemini. |

## LLM configuration

LLM features are optional and use the [Vercel AI SDK](https://ai-sdk.dev). Configuration comes from
`.env` (see `.env.example`) or from a runtime `LlmConfig`:

```sh
FD_LLM_PROVIDER=ollama   # ollama | openai | openrouter | gemini
FD_LLM_MODEL=            # required to enable LLM features; no default
FD_LLM_BASE_URL=         # optional (Ollama: http://localhost:11434/v1, OpenRouter: https://openrouter.ai/api/v1)
FD_LLM_API_KEY=          # not needed for Ollama
```

- **Server/headless**: `createModelFromEnv(allProviders)` reads `process.env`.
- **Extensions**: values are inlined at build time (dev builds only; an inlined API key ends up in
  the bundle, so distributed builds should take keys from a settings page). Ollama must allow
  extension origins: `OLLAMA_ORIGINS="chrome-extension://*,moz-extension://*" ollama serve`.
- Only compact DOM skeletons and item text (truncated) are sent. Text rules are classified in
  batches and cached by text hash.

## Overlay theming

```ts
openOverlay(document, proposals, {
  theme: {
    colors: { feed: '#2563eb', item: '#16a34a', excluded: '#dc2626', pending: '#d97706', part: '#9333ea' },
    outlineWidth: '2px',
    panelPosition: 'bottom-right',
    zIndex: 2147483646,
  },
  customCss: '.fd-panel { width: 400px; }',
});
```

The theme becomes `--fd-*` custom properties on the shadow root's `:host`. The overlay lives in a
single `<div data-feedgrab-overlay>` with an open shadow root, draws outlines over the page,
and never changes feed nodes.

## Read-only guarantee

Detection, the overlay, iteration, and `ingest` never change the page DOM. The test suite checks this
on every fixture by comparing DOM snapshots. The page changes only when **you** call
`removeItem`/`removeParts`, and `dispose({ restore: true })` undoes those removals.

## Development

| Script | Purpose |
|---|---|
| `bun run check` | Biome lint + `tsc` typecheck + unit tests (happy-dom) |
| `bun run build` | ESM entries, IIFE bundle, `.d.ts` (`scripts/check-size.ts` enforces ≤ 120 KB) |
| `bun run test:e2e` | Playwright: Bun/browser parity, live scroll, overlay, theme (Chromium + Firefox) and the extension smoke test (Chromium) |
| `bun run test:live` | Opt-in tests against a real model (skipped unless `FD_LLM_MODEL` is set) |
| `bun run smoke:node` | Build, then run the built package under Node |
| `bun run --filter feedgrab-example-extension build` / `build:firefox` | Example extension |

Specs and implementation notes are in [`spec/`](spec/).

## License

MIT © 2026 Fayaz Ahmed
