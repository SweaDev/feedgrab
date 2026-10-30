# SPEC-01: Feed Detector — Core Spec

Status: Draft · Date: 2026-10-30

## 1. Goal
A TypeScript library (built and tested with Bun), **built mainly for browser extensions** on **Chromium and Firefox** (MV3). It **finds and describes** feeds; it does not act on them. It provides:
- selectors for feeds, feed items, and exclusions (auto-detected, picked, or entered by hand),
- a picker/overlay for confirming and editing those selectors,
- an iterator over a single **unified feed** that keeps up with infinite scroll and reports on each item,
- cleanup support: a report per item, a removal helper the consumer can call, and resource teardown.

The consuming project decides what to do with each item: hide it, remove it, restyle it, collect it, etc.

## 2. Principles
- **Read-only by default.** The library never changes the feed DOM on its own. The page is only changed when the consumer explicitly calls a removal helper (§8).
- **The overlay is isolated.** The picker/overlay renders into its own Shadow DOM host and never touches feed nodes.
- **No persistence.** The library produces serializable data, and the consumer stores it.

## 3. Terms
- **Feed**: one container element with repeated, structurally similar **items**. Examples: a post list, search results, a product grid.
- **Unified feed**: the items of every confirmed feed on a page, merged into one de-duplicated stream in DOM order.
- **Exclusion rule**: a rule that marks an item, or parts of an item, as unwanted. Examples: ads, sponsored posts, promos, injected widgets. Matching a rule only produces a **report**. Nothing is removed automatically.
- **FeedDescriptor**: the serializable result for one feed: selectors, exclusion rules, and where it came from.
- **SiteProfile**: every FeedDescriptor for one page type, keyed by **hostname + URL path pattern** (e.g. `example.com` + `/search/*`). This lets different page types on the same site, such as a home feed and search results, have separate profiles. When several patterns match a URL, the most specific one wins. The consumer stores profiles.

## 4. Workflow
1. **Auto-detect** (§5): propose one or more feeds, each with container and item selectors and a confidence score.
2. **Confirm / edit** (§6): the overlay shows the proposals. The user accepts, rejects, or adjusts them by picking elements or editing CSS/XPath. The result is a SiteProfile.
3. **Persist** (consumer): the consumer stores the profile. On later visits, it calls `matchProfile(url, profiles)` and goes straight to step 4.
4. **Iterate** (§8): open the unified feed, iterate its items (including ones loaded later by infinite scroll), and act on each item's report.

If a profile stops matching (because the site's layout changed), the feed emits `feed:lost`. The consumer can then run detection again.

## 5. Auto-detection
### 5.1 Heuristic pass (always runs, local, no network)
- Give each element a structural signature (tag + normalized class list + child-shape hash).
- Find containers that have ≥ N siblings sharing a signature. Score them by repetition count, visible area, text and link density, and media presence.
- Keep **every** candidate that scores above the threshold, because a page can have several feeds. Drop candidates nested inside a better-scoring one.

### 5.2 LLM pass (optional)
- Input: a **compact DOM skeleton** of the candidates (tags, classes, short text samples, no full HTML). This keeps token use low and works with small local models.
- Output: zod-validated JSON with `feeds[]: { containerSelector, itemSelector, exclusions[], confidence }`.
- Every selector the LLM returns is re-run against the DOM and dropped if it matches nothing or gives an implausible item count. If the LLM is unavailable or its output is invalid, the heuristic result is used instead.

## 6. Picker / overlay
- A separate entry point (`feed-detector/overlay`), rendered in a Shadow DOM host.
  - It outlines feeds and items, marks excluded and pending items, and marks the stripped parts of items.
  - It does **not** hide or change those elements. It draws positioned outlines on top of them.
- **Inspect**: the user picks any element inside a feed. The library walks up to the nearest group of repeating siblings and generates the container and item selectors. The same picker is used to choose an exclusion target.
- **Manual selector**: the user types or edits CSS or XPath. The overlay shows the match count and highlights matches live.
- **Customizable style from settings**: `OverlayOptions.theme` sets colors per state (feed, item, excluded, pending, part), outline width/style, font, panel position, and z-index. The theme is applied as CSS custom properties inside the shadow root. `customCss` allows further overrides.
- The overlay's logic is also exported as headless helpers, for consumers that build their own UI:
  - `pickElement`
  - `inspectFromElement`
  - `validateSelector`
  - `matchSelector`: returns the matched elements and their bounding boxes

## 7. Exclusions (reported, never applied automatically)
- **Selector rules**: CSS or XPath, matched relative to the item, with one of two scopes:
  - `item`: marks the whole item as excluded.
  - `part`: reports sub-elements to strip.

  Rules come from two places:
  - Built-in defaults (can be turned off): `data-ad*`, ad iframes, common ad containers, and items whose structural signature differs from the feed's main item signature.
  - User rules, added through the overlay.
- **LLM text rules**: plain-language criteria, e.g. "sponsored or promoted posts" or "job ads". Item text is classified **in batches**. There is no regex.
  - Results are cached by item text hash, so items that show up again during scrolling are not re-classified.
  - Items waiting for a result are reported as `pending`, and are **shown** (the consumer is advised not to act on them yet). When the result arrives, the status changes to `kept` or `excluded` and an `item:updated` event fires.
- **Precedence**: more specific rules win (user selector > LLM text rule > built-in). A user `include` rule overrides an `exclude` rule that is equally or less specific, so users can rescue false positives.
- Every report says **why**: which rule matched, where it came from (`builtin` / `user` / `llm`), and, for LLM rules, the criteria and confidence.

## 8. Iteration, item reports & cleanup
### 8.1 Unified feed
- `openFeed(doc, profile, opts)` returns a `UnifiedFeed`.
- A `MutationObserver` watches each confirmed container, so items are picked up incrementally as infinite scroll adds them.
- Each item gets a stable id: a hash of its link/permalink if it has one, otherwise a hash of its text. Ids are used for de-duplication, both when virtualized lists re-render items and across feeds.
- Items from every feed are merged in DOM order. Each item keeps its `feedId`.
- Containers that are re-mounted (SPA navigation, React re-render) are found again through their descriptor.
- Loading more items is left to the page or the user. The library only observes.

### 8.2 Iteration
- `feed.items()`: a synchronous snapshot of the current items.
- `for await (const item of feed)`: a live stream. It yields the current items, then new ones as they appear, and ends on `dispose()`.
- Events: `item:added`, `item:updated` (status changed, e.g. pending → excluded), `item:removed` (the item left the DOM), `feed:lost`.
- Options: `status` filter (e.g. only `excluded`), `includePending`.

### 8.3 Item report
```ts
type FeedItem = {
  id: string; feedId: string; element: Element;
  status: 'kept' | 'excluded' | 'pending';
  reasons: ExclusionMatch[];   // why it was excluded (empty if kept)
  parts: PartMatch[];          // sub-elements matched by `part` rules: { element, rule }
  text(): string;              // normalized text, as used for LLM classification
}
```

### 8.4 Cleanup
- **Removal helpers** run only when the consumer calls them, and both return a `{ restore() }` handle:
  - `removeItem(item, { mode })`: removes the whole item.
  - `removeParts(item, { mode })`: removes the item's matched parts.

  There are two modes:
  - `'hide'` (default): adds an attribute plus `display:none`. This is safe on framework-managed DOM (React/Vue lists).
  - `'detach'`: removes the node from the DOM.
- **Teardown**: `feed.dispose()` disconnects observers, cancels pending LLM requests, and clears caches. It does not undo removals unless `dispose({ restore: true })` is passed.

## 9. Public API (sketch)
```ts
// detection
detectFeeds(doc: Document, opts?: DetectOptions): Promise<FeedDescriptor[]>
inspectFromElement(el: Element): FeedDescriptor
detectFromSelector(doc: Document, sel: SelectorInput): FeedDescriptor
validateSelector(doc: Document, sel: Selector): { valid: boolean; count: number; error?: string }

// overlay (feed-detector/overlay)
openOverlay(doc: Document, proposals: FeedDescriptor[], opts?: OverlayOptions): Promise<SiteProfile>

// profiles (consumer persists)
matchProfile(url: string | URL, profiles: SiteProfile[]): SiteProfile | undefined
serializeProfile(p: SiteProfile): string
parseProfile(s: string): SiteProfile          // validated + migrated via `version`

// iteration & cleanup
openFeed(doc: Document, profile: SiteProfile, opts?: FeedOptions): UnifiedFeed
removeItem(item: FeedItem, opts?: { mode?: 'hide' | 'detach' }): { restore(): void }
removeParts(item: FeedItem, opts?: { mode?: 'hide' | 'detach' }): { restore(): void }

type FeedDescriptor = {
  id: string; container: Selector; item: Selector;
  exclude: Rule[]; include: Rule[];
  source: 'heuristic' | 'llm' | 'inspect' | 'manual'; confidence: number; confirmed: boolean;
}
type SiteProfile = { version: number; hostname: string; pathPattern: string; feeds: FeedDescriptor[] }
type Selector = { type: 'css' | 'xpath'; value: string }
type Rule = { kind: 'selector'; selector: Selector; scope: 'item' | 'part' } | { kind: 'llm-text'; criteria: string }
type LlmBackend = LanguageModel | ((req: LlmRequest) => Promise<unknown>) // fn form = proxy to extension background
```

## 10. LLM providers & configuration
- Built on the **Vercel AI SDK** (`ai`, Apache-2.0, actively maintained). It gives one interface for every provider plus structured output (`generateObject` + zod). The core only depends on the `LanguageModel` type, and provider packages are optional peer dependencies.
  | Provider | Package |
  |---|---|
  | Ollama (local) | `@ai-sdk/openai-compatible` → `<base>/v1` |
  | OpenAI | `@ai-sdk/openai` |
  | OpenRouter | `@openrouter/ai-sdk-provider` |
  | Gemini | `@ai-sdk/google` |
- **Config from `.env`** (Bun reads it natively and inlines the values at build time). Names are placeholders to be finalized:
  ```
  FD_LLM_PROVIDER=ollama|openai|openrouter|gemini
  FD_LLM_MODEL=...            # set later; no hard-coded default
  FD_LLM_BASE_URL=...         # e.g. Ollama endpoint
  FD_LLM_API_KEY=...
  ```
  `createModelFromEnv()` and `createModel(config)` turn these into a `LanguageModel`. The consumer can pass a runtime config, e.g. from an extension settings page.
- **Extension constraints**:
  - LLM calls should run in the **extension background context**: a service worker on Chromium, an event page on Firefox. The library provides transport-agnostic helpers: `createLlmProxy(send)` for the content script and `handleLlmRequest(req, model)` for the background. The consumer wires them to its own messaging, so the page never sees API keys.
  - Ollama must allow extension origins (`OLLAMA_ORIGINS=chrome-extension://*,moz-extension://*`).
  - An API key inlined from `.env` ends up in the extension bundle. That is acceptable for dev builds only. Distributed builds should take the key from a settings page.
- Privacy: only skeletons and item text are sent, trimmed to configurable size limits.

## 11. Dependencies
| Need | Choice | Why |
|---|---|---|
| LLM abstraction + structured output | `ai` + provider packages (optional peers) | One API for all four providers |
| Schema validation | `zod` | Required by AI SDK structured output, also validates profiles |
| Unique CSS selector generation | `@medv/finder` | Tiny, maintained, robust short selectors |
| DOM for tests | `happy-dom` (dev) | Bun's recommended test DOM |
| Example/dev extension | WXT (dev only, not a library dependency) | Maintained MV3 framework with cross-browser builds and HMR. Its `browser` API covers storage/messaging in the example |

The library itself uses no extension APIs. Storage and messaging belong to the consumer, so `webextension-polyfill` is not needed in the core. Feed heuristics, the observer, and the exclusion engine are written in-house. No maintained library does "repeating list detection" (Readability targets articles).

## 12. Non-goals (v1)
- Deciding what to do with items, or changing the feed without an explicit consumer call.
- Persisting profiles or settings.
- Fetching pages server-side or running headless browsers.
- Triggering infinite-scroll loads automatically.
- Extracting item fields (title/date/author). Candidate for SPEC-02.
- Showing separate feeds as separate streams (v1 only produces the unified feed).

## 13. Non-functional
- ESM, tree-shakable. The core has no LLM code unless an `LlmBackend` is passed, and the overlay is a separate entry point.
- Incremental processing should stay cheap enough that scrolling doesn't stutter (target < 5 ms per batch of added items, excluding LLM time).
- Heuristic output is deterministic for the same DOM. Fixture tests with `bun test` run on saved HTML snapshots, including snapshots of infinite-scroll pages.
- Tests check that the feed DOM is unchanged after detection, overlay use, and iteration, i.e. whenever the removal helpers are not called.

## 14. Decisions
- Target browsers: Chromium + Firefox.
- Items waiting for LLM classification are shown (`pending`).
- SiteProfiles are keyed by hostname + URL path pattern, and the consumer stores them.
- The library is read-only. It reports and provides helpers, and the consumer decides and acts.
- The picker/overlay ships with the library, and its style can be customized from settings.

## 15. Open questions
1. Check the chosen models' structured-output reliability once the `.env` models are set. If it is poor, fall back to JSON mode plus a repair/retry step.
