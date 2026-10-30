# SPEC-01: Feed Detector — Core Spec

Status: Draft · Date: 2026-10-30

## 1. Goal
A TypeScript library (built and tested with Bun) that **finds and describes** feeds; it does not act on them. It works the same way in three kinds of consumer:
- **Browser extensions** (primary): Chromium and Firefox, MV3, running in a content script.
- **Headless browsers**: Playwright/Puppeteer, with the library injected into the page.
- **Server-side**: Bun/Node, working on HTML the consumer fetched and parsed.

It provides:
- selectors for feeds, feed items, and exclusions (auto-detected, picked, or entered by hand),
- a picker/overlay for confirming and editing those selectors,
- an iterator over a single **unified feed** that keeps up with infinite scroll or pagination and reports on each item,
- cleanup support: a report per item, a removal helper the consumer can call, and resource teardown.

The consuming project decides what to do with each item: hide it, remove it, restyle it, collect it, etc.

## 2. Principles
- **Read-only by default.** The library never changes the feed DOM on its own. The page is only changed when the consumer explicitly calls a removal helper (§9.4).
- **The overlay is isolated.** The picker/overlay renders into its own Shadow DOM host and never touches feed nodes.
- **No persistence.** The library produces serializable data, and the consumer stores it.
- **Environment-agnostic core.** Every API takes a `Document` (or `Element`). The core never reads `window`/`document` globals (it uses `doc.defaultView`) and uses no extension-only or Node-only APIs.
- **Portable profiles.** A SiteProfile confirmed in the extension works unchanged on the server or in a headless browser, and the other way round.
- **No fetching.** The library never fetches pages, launches browsers, or drives scrolling. The consumer does these and passes in the resulting `Document`/HTML.

## 3. Runtime modes
All three modes use the same API (§10). Only how the DOM arrives and how LLM calls are routed differ.

| Mode | Where the library runs | DOM | More items (infinite scroll / pagination) | LLM |
|---|---|---|---|---|
| Extension | Content script | Live page | `MutationObserver` | Proxy to the extension background (`createLlmProxy` / `handleLlmRequest`) |
| Headless browser | Injected into the page (`feed-detector/browser` bundle via `addScriptTag` / `addInitScript`) | Live page | `MutationObserver`. The consumer drives scrolling | Proxy to Node/Bun via `page.exposeFunction` → `handleLlmRequest` (same pattern as the extension) |
| Server-side | Bun/Node | Parsed from HTML (`parseHtml(html, url)`, happy-dom by default; any standards-compliant `Document` is accepted) | `feed.ingest(docOrHtml)`: the consumer fetches the next page or "load more" response, and its items join the same unified feed | Direct `LanguageModel` |

- **Without layout**, i.e. a parsed DOM: the heuristic scores without visible-area/bounding-box signals and relies on structure, text, links, and media. The confidence scores reflect this.
- **The overlay** needs a rendered page, so it works in extensions and headed browsers. Server-side consumers confirm or edit with the headless helpers (`inspectFromElement`, `validateSelector`, `matchSelector`), or reuse a profile confirmed elsewhere.
- **The removal helpers** also work on a parsed DOM, so a server-side consumer can serialize the cleaned HTML if it wants to.

## 4. Terms
- **Feed**: one container element with repeated, structurally similar **items**. Examples: a post list, search results, a product grid.
- **Unified feed**: the items of every confirmed feed on a page (and of any ingested follow-up pages), merged into one de-duplicated stream in document order.
- **Exclusion rule**: a rule that marks an item, or parts of an item, as unwanted. Examples: ads, sponsored posts, promos, injected widgets. Matching a rule only produces a **report**. Nothing is removed automatically.
- **FeedDescriptor**: the serializable result for one feed: selectors, exclusion rules, and where it came from.
- **SiteProfile**: every FeedDescriptor for one page type, keyed by **hostname + URL path pattern** (e.g. `example.com` + `/search/*`). This lets different page types on the same site, such as a home feed and search results, have separate profiles. When several patterns match a URL, the most specific one wins. The consumer stores profiles.

## 5. Workflow
1. **Auto-detect** (§6): propose one or more feeds, each with container and item selectors and a confidence score.
2. **Confirm / edit** (§7): the user confirms the proposals in the overlay (extension or headed browser), or the consumer confirms them programmatically with the headless helpers. The result is a SiteProfile.
3. **Persist** (consumer): the consumer stores the profile. On later visits, it calls `matchProfile(url, profiles)` and goes straight to step 4.
4. **Iterate** (§9): open the unified feed and iterate its items, including new ones from the observer (live DOM) or from `ingest()` (server-side). Act on each item's report.

If a profile stops matching (because the site's layout changed), the feed emits `feed:lost`. The consumer can then run detection again.

## 6. Auto-detection
### 6.1 Heuristic pass (always runs, local, no network)
- Give each element a structural signature (tag + normalized class list + child-shape hash).
- Find containers that have ≥ N siblings sharing a signature. Score them by:
  - repetition count,
  - text and link density,
  - media presence,
  - visible area, only when layout is available (§3).
- Keep **every** candidate that scores above the threshold, because a page can have several feeds. Drop candidates nested inside a better-scoring one.

### 6.2 LLM pass (optional)
- Input: a **compact DOM skeleton** of the candidates (tags, classes, short text samples, no full HTML). This keeps token use low and works with small local models.
- Output: zod-validated JSON with `feeds[]: { containerSelector, itemSelector, exclusions[], confidence }`.
- Every selector the LLM returns is re-run against the DOM and dropped if it matches nothing or gives an implausible item count. If the LLM is unavailable or its output is invalid, the heuristic result is used instead.

## 7. Picker / overlay
- A separate entry point (`feed-detector/overlay`), rendered in a Shadow DOM host. It needs a rendered page (§3).
  - It outlines feeds and items, marks excluded and pending items, and marks the stripped parts of items.
  - It does **not** hide or change those elements. It draws positioned outlines on top of them.
- **Inspect**: the user picks any element inside a feed. The library walks up to the nearest group of repeating siblings and generates the container and item selectors. The same picker is used to choose an exclusion target.
- **Manual selector**: the user types or edits CSS or XPath. The overlay shows the match count and highlights matches live.
- **Customizable style from settings**: `OverlayOptions.theme` sets colors per state (feed, item, excluded, pending, part), outline width/style, font, panel position, and z-index. The theme is applied as CSS custom properties inside the shadow root. `customCss` allows further overrides.
- The overlay's logic is also exported as headless helpers, which work in every mode, for consumers that build their own UI or confirm programmatically:
  - `pickElement` (rendered page only)
  - `inspectFromElement`
  - `validateSelector`
  - `matchSelector`: returns the matched elements, plus their bounding boxes when layout is available

## 8. Exclusions (reported, never applied automatically)
- **Selector rules**: CSS or XPath, matched relative to the item, with one of two scopes:
  - `item`: marks the whole item as excluded.
  - `part`: reports sub-elements to strip.

  Rules come from two places:
  - Built-in defaults (can be turned off): `data-ad*`, ad iframes, common ad containers, and items whose structural signature differs from the feed's main item signature.
  - User rules, added through the overlay or the API.
- **LLM text rules**: plain-language criteria, e.g. "sponsored or promoted posts" or "job ads". Item text is classified **in batches**. There is no regex.
  - Results are cached by item text hash, so items that show up again during scrolling or ingest are not re-classified.
  - Items waiting for a result are reported as `pending`, and are **shown** (the consumer is advised not to act on them yet). When the result arrives, the status changes to `kept` or `excluded` and an `item:updated` event fires.
- **Precedence**: more specific rules win (user selector > LLM text rule > built-in). A user `include` rule overrides an `exclude` rule that is equally or less specific, so users can rescue false positives.
- Every report says **why**: which rule matched, where it came from (`builtin` / `user` / `llm`), and, for LLM rules, the criteria and confidence.

## 9. Iteration, item reports & cleanup
### 9.1 Unified feed
- `openFeed(doc, profile, opts)` returns a `UnifiedFeed`.
- **Live DOM** (extension, headless): a `MutationObserver` watches each confirmed container, so items are picked up incrementally as infinite scroll adds them.
  - Containers that are re-mounted (SPA navigation, React re-render) are found again through their descriptor.
- **Parsed DOM** (server-side): `feed.ingest(docOrHtml, { url? })` runs the same descriptors against a follow-up document (next page, "load more" response) and appends its items.
- Each item gets a stable id: a hash of its link/permalink if it has one, otherwise a hash of its text. Ids are used for de-duplication in three cases: when virtualized lists re-render items, across feeds, and across ingests.
- Items from every feed are merged in document order, and ingested documents are appended in ingest order. Each item keeps its `feedId`.
- Loading more items (scrolling, clicking "load more", fetching the next page) is left to the page, the user, or the consumer. The library only observes or ingests.

### 9.2 Iteration
- `feed.items()`: a synchronous snapshot of the current items.
- `for await (const item of feed)`: yields the current items, then new ones as they arrive. How it ends depends on the `live` option:
  - `live: true` (default for a live DOM): the iterator waits for new items and ends on `dispose()`.
  - `live: false` (default for a parsed DOM): it yields what exists, plus anything ingested before it is drained, then ends.
- Events: `item:added`, `item:updated` (status changed, e.g. pending → excluded), `item:removed` (the item left the DOM), `feed:lost`.
- Options: `live`, `status` filter (e.g. only `excluded`), `includePending`.

### 9.3 Item report
```ts
type FeedItem = {
  id: string; feedId: string; element: Element;
  status: 'kept' | 'excluded' | 'pending';
  reasons: ExclusionMatch[];   // why it was excluded (empty if kept)
  parts: PartMatch[];          // sub-elements matched by `part` rules: { element, rule }
  text(): string;              // normalized text, as used for LLM classification
  sourceUrl?: string;          // set for ingested documents
}
```

### 9.4 Cleanup
- **Removal helpers** run only when the consumer calls them, work on live and parsed DOMs alike, and both return a `{ restore() }` handle:
  - `removeItem(item, { mode })`: removes the whole item.
  - `removeParts(item, { mode })`: removes the item's matched parts.

  There are two modes:
  - `'hide'` (default): adds an attribute plus `display:none`. This is safe on framework-managed DOM (React/Vue lists).
  - `'detach'`: removes the node from the DOM.
- **Teardown**: `feed.dispose()` disconnects observers, cancels pending LLM requests, and clears caches. It does not undo removals unless `dispose({ restore: true })` is passed.

## 10. Public API
```ts
// detection (feed-detector)
detectFeeds(doc: Document, opts?: DetectOptions): Promise<FeedDescriptor[]>
inspectFromElement(el: Element, opts?: { minItems?: number }): FeedDescriptor
detectFromSelector(doc: Document, sel: SelectorInput): FeedDescriptor
validateSelector(doc: Document, sel: Selector): { valid: boolean; count: number; error?: string }
matchSelector(doc: Document, sel: Selector, opts?: { root?: Element }): { elements: Element[]; boxes?: Box[] }
registerXPathEngine(engine: (expr: string, contextNode: Node) => Node[]): void   // for DOMs without document.evaluate

// overlay (feed-detector/overlay)
openOverlay(doc: Document, proposals: FeedDescriptor[], opts?: OverlayOptions): Promise<SiteProfile>
pickElement(doc: Document, opts?: { filter?; signal? }): Promise<Element>

// profiles (consumer persists)
createProfile(input: { url: string | URL; pathPattern?: string; feeds: FeedDescriptor[] }): SiteProfile
matchProfile(url: string | URL, profiles: SiteProfile[]): SiteProfile | undefined
serializeProfile(p: SiteProfile): string
parseProfile(s: string): SiteProfile          // validated + migrated via `version`

// iteration & cleanup
openFeed(doc: Document, profile: SiteProfile, opts?: FeedOptions): UnifiedFeed
feed.ingest(input: Document | string, opts?: { url?: string }): FeedItem[]   // returns newly added items
feed.dispose(opts?: { restore?: boolean }): void
removeItem(item: FeedItem, opts?: { mode?: 'hide' | 'detach' }): { restore(): boolean }
removeParts(item: FeedItem, opts?: { mode?: 'hide' | 'detach' }): { restore(): boolean }

// server-side (feed-detector/server)
parseHtml(html: string, url?: string): Document  // happy-dom; any other Document also works
disposeDocument(doc: Document): void             // closes the happy-dom window

// LLM (see §11)
createLlmProxy(send: (req: LlmRequest, opts?: { signal?: AbortSignal }) => Promise<unknown>): LlmProxyFn   // feed-detector
handleLlmRequest(req: unknown, model: LanguageModel, opts?: { signal?: AbortSignal }): Promise<LlmResponse> // feed-detector/llm
createModel(config: LlmConfig, providers: ProviderFactories): LanguageModel                          // feed-detector/llm
createModelFromEnv(providers: ProviderFactories, env?: Record<string, string | undefined>): LanguageModel
readEnvConfig(env?): LlmConfig | null
allProviders: ProviderFactories                                                                      // feed-detector/llm/providers

type FeedDescriptor = {
  id: string; container: Selector; item: Selector;   // item is evaluated relative to each container
  exclude: Rule[]; include: Rule[];                  // include: selector rules only
  source: 'heuristic' | 'llm' | 'inspect' | 'manual'; confidence: number; confirmed: boolean;
}
type SiteProfile = { version: number; hostname: string; pathPattern: string; feeds: FeedDescriptor[]; updatedAt?: string }
type Selector = { type: 'css' | 'xpath'; value: string }
type SelectorInput = { container?: Selector; item?: Selector }   // at least one
type Rule =
  | { kind: 'selector'; selector: Selector; scope: 'item' | 'part'; id?: string; origin?: 'user' | 'llm' }
  | { kind: 'llm-text'; criteria: string; id?: string; origin?: 'user' | 'llm' }   // id auto-filled as r_<hash>
type FeedItem = { /* §9.3 */ connected: boolean; rescuedBy?: { ruleId: string; origin: 'builtin' | 'user' | 'llm' } }
type FeedEvents = 'item:added' | 'item:updated' | 'item:removed' | 'feed:lost' | 'feed:error' /* { feedId?, error } */
type LlmBackend = LanguageModel | LlmProxyFn // fn form = proxy (extension background or headless host)
```
Entry points:
- `feed-detector`: the core, for every mode (includes `createLlmProxy`; a `LanguageModel` backend lazily loads the AI SDK).
- `feed-detector/overlay`: the picker/overlay.
- `feed-detector/server`: `parseHtml`, `disposeDocument`.
- `feed-detector/llm`: `handleLlmRequest`, `createModel`, `createModelFromEnv`, `readEnvConfig` (host side: extension background, Node/Bun).
- `feed-detector/llm/providers`: `allProviders`, the four provider factories (optional peer dependencies).
- `feed-detector/browser`: a prebuilt IIFE bundle that exposes a `FeedDetector` global, for page injection in headless browsers. It accepts only the proxy form of `LlmBackend`.

## 11. LLM providers & configuration
- Built on the **Vercel AI SDK** (`ai`, Apache-2.0, actively maintained). It gives one interface for every provider plus structured output (`generateObject` + zod). The core only depends on the `LanguageModel` type, and provider packages are optional peer dependencies.
  | Provider | Package |
  |---|---|
  | Ollama (local) | `@ai-sdk/openai-compatible` → `<base>/v1` |
  | OpenAI | `@ai-sdk/openai` |
  | OpenRouter | `@openrouter/ai-sdk-provider` |
  | Gemini | `@ai-sdk/google` |
- **Config from `.env`**. Names are placeholders to be finalized:
  ```
  FD_LLM_PROVIDER=ollama|openai|openrouter|gemini
  FD_LLM_MODEL=...            # set later; no hard-coded default
  FD_LLM_BASE_URL=...         # e.g. Ollama endpoint
  FD_LLM_API_KEY=...
  ```
  - Extensions: inlined at build time by Bun.
  - Server-side and headless consumers: read at runtime (`process.env` / `Bun.env`).

  `createModelFromEnv()` and `createModel(config)` turn the config into a `LanguageModel`. The consumer can also pass a runtime config, e.g. from an extension settings page.
- **Proxying (extension and headless)**: code running inside the page never holds API keys. The page side uses `createLlmProxy(send)`, and the host side answers with `handleLlmRequest(req, model)`. The consumer wires `send` to its transport:
  - extension messaging to the background (a service worker on Chromium, an event page on Firefox),
  - `page.exposeFunction` in Playwright/Puppeteer.

  Server-side consumers pass a `LanguageModel` directly.
- **Extension-only constraints**:
  - Ollama must allow extension origins (`OLLAMA_ORIGINS=chrome-extension://*,moz-extension://*`).
  - An API key inlined from `.env` ends up in the extension bundle. That is acceptable for dev builds only. Distributed builds should take the key from a settings page.
- Privacy: only skeletons and item text are sent, trimmed to configurable size limits.

## 12. Dependencies
| Need | Choice | Why |
|---|---|---|
| LLM abstraction + structured output | `ai` + provider packages (optional peers) | One API for all four providers |
| Schema validation | `zod` | Required by AI SDK structured output, also validates profiles |
| Unique CSS selector generation | `@medv/finder` | Tiny, maintained, robust short selectors |
| DOM for server-side + tests | `happy-dom` (optional peer, used by `parseHtml`) | Fast, maintained, supports `MutationObserver`. Bun's recommended test DOM |
| XPath fallback | `xpath` (optional), only when the DOM implementation lacks `document.evaluate` | Avoids the dependency on real browsers |
| Headless-browser tests | Playwright (dev) | Runs the injected `feed-detector/browser` bundle on Chromium and Firefox |
| Example/dev extension | WXT (dev only, not a library dependency) | Maintained MV3 framework with cross-browser builds and HMR. Its `browser` API covers storage/messaging in the example |

The core uses no extension-only or Node-only APIs. Storage, messaging, fetching, and browser control all belong to the consumer, so `webextension-polyfill` is not needed. Feed heuristics, the observer/ingest pipeline, and the exclusion engine are written in-house. No maintained library does "repeating list detection" (Readability targets articles).

## 13. Non-goals (v1)
- Deciding what to do with items, or changing the feed without an explicit consumer call.
- Persisting profiles or settings.
- Fetching pages, launching browsers, or driving scrolling/pagination. The consumer does these and passes in the resulting `Document`/HTML.
- Executing page JavaScript in server-side mode. Consumers that need JS-rendered content use a headless browser.
- Extracting item fields (title/date/author). Candidate for SPEC-02.
- Showing separate feeds as separate streams (v1 only produces the unified feed).

## 14. Non-functional
- Runtimes: Chromium + Firefox (MV3), Bun, Node ≥ 20.
- ESM, tree-shakable. The core has no LLM code unless an `LlmBackend` is passed, and the overlay, server, and browser bundle are separate entry points.
- Incremental processing should stay cheap enough that scrolling doesn't stutter (target < 5 ms per batch of added items, excluding LLM time).
- Heuristic output is deterministic for the same DOM.
- Fixture tests (`bun test`) run on saved HTML snapshots, including infinite-scroll and paginated pages, in three setups:
  - happy-dom (server-side),
  - Playwright with the injected bundle (headless),
  - a smoke test of the WXT example extension.

  For the same fixture, all three must give identical descriptors and item reports. Only confidence may differ, where layout signals are missing.
- Tests check that the feed DOM is unchanged after detection, overlay use, iteration, and ingest, i.e. whenever the removal helpers are not called.

## 15. Decisions
- Target browsers: Chromium + Firefox.
- Items waiting for LLM classification are shown (`pending`).
- SiteProfiles are keyed by hostname + URL path pattern, and the consumer stores them.
- The library is read-only. It reports and provides helpers, and the consumer decides and acts.
- The picker/overlay ships with the library, and its style can be customized from settings.
- Server-side and headless-browser consumers use the same API as extensions. The library never fetches pages or launches browsers itself.

## 16. Open questions
1. Check the chosen models' structured-output reliability once the `.env` models are set. If it is poor, fall back to JSON mode plus a repair/retry step.
