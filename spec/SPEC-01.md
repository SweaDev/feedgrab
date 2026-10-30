# SPEC-01: Feed Detector — Core Spec

Status: Draft · Date: 2026-10-30

## 1. Goal
A TypeScript library (built and tested with Bun), **built mainly for browser extensions** on **Chromium and Firefox** (MV3). It finds the feeds on a page and their repeating items, and lets the user confirm or edit what it found. It then keeps a single **unified feed** of clean items up to date as the page scrolls, with ads and other unwanted items removed.

## 2. Terms
- **Feed**: one container element with repeated, structurally similar **items**. Examples: a post list, search results, a product grid.
- **Unified feed**: the items of every confirmed feed on a page, merged into one de-duplicated stream in DOM order.
- **Exclusion**: a rule that drops an item, or removes part of one. Examples: ads, sponsored posts, promos, injected widgets.
- **FeedDescriptor**: the saved, serializable result for one feed: selectors, exclusions, and where it came from.
- **SiteProfile**: every FeedDescriptor for one page type, stored after the user confirms. It is keyed by **hostname + URL path pattern** (e.g. `example.com` + `/search/*`), so different page types on the same site, such as a home feed and search results, get separate profiles. When several patterns match a URL, the most specific one wins.

## 3. Workflow
1. **Auto-detect** (§4): propose one or more feeds, each with a container selector and an item selector, plus a confidence score.
2. **Confirm / edit** (§5): highlight what was proposed on the page. The user can accept, reject, or adjust each feed by picking an element or editing a CSS/XPath selector.
3. **Save**: store the SiteProfile so later visits skip detection and go straight to step 4.
4. **Track** (§7): watch the page for new items (infinite scroll), apply exclusions, and emit the unified feed.

If a saved profile stops matching (because the site's layout changed), the library reports it and runs step 1 again.

## 4. Auto-detection
### 4.1 Heuristic pass (always runs, local, no network)
- Give each element a structural signature (tag + normalized class list + child-shape hash).
- Find containers that have ≥ N siblings sharing a signature. Score them by repetition count, visible area, text and link density, and media presence.
- Keep **every** candidate that scores above the threshold, not just the best one, because a page can have several feeds. Drop candidates nested inside a better-scoring one.

### 4.2 LLM pass (optional)
- Input: a **compact DOM skeleton** of the candidates (tags, classes, short text samples, no full HTML). This keeps token use low and works with small local models.
- Output: zod-validated JSON with `feeds[]: { containerSelector, itemSelector, confidence }`.
- Every selector the LLM returns is re-run against the DOM and dropped if it matches nothing or gives an implausible item count. If the LLM is unavailable or its output is invalid, the heuristic result is used instead.

## 5. Confirm / edit (manual modes)
- **Overlay**: a small UI injected into the page (Shadow DOM, so the page's CSS can't affect it). It outlines each feed and its items, and shows excluded items differently.
- **Inspect**: the user picks any element inside a feed. The library walks up to the nearest group of repeating siblings and generates the container and item selectors.
- **Manual selector**: the user types or edits CSS or XPath. The overlay shows the match count and highlights matches live.
- The overlay is a separate entry point (`feed-detector/overlay`), so extensions that bring their own UI can leave it out.

## 6. Exclusions (ads / unwanted items)
- **Selector rules**: CSS or XPath, matched relative to the item. A rule either drops the whole item or strips a sub-element from it.
  - Built-in defaults (can be turned off): `data-ad*`, ad iframes, common ad containers, and items whose structural signature differs from the feed's main item signature.
  - User rules, added in the overlay.
- **LLM text rules**: the user writes plain-language criteria, e.g. "sponsored or promoted posts" or "job ads". Item text is sent to the LLM **in batches**, and it returns which item ids to exclude. There is no regex.
  - Results are cached by item text hash, so items that show up again during scrolling are not re-classified.
  - Items not yet classified stay **visible** until the LLM answers. They are emitted as `pending` and change to `excluded` if the LLM flags them.
- **Precedence**: more specific rules win (user selector > LLM text rule > built-in). A user `include` rule overrides an `exclude` rule that is equally or less specific, so users can rescue false positives.

## 7. Infinite scroll & unified feed
- A `MutationObserver` watches each confirmed container. Items are processed incrementally as they are added, without rescanning the page.
- Each item gets a stable id: a hash of its link/permalink if it has one, otherwise a hash of its text. Ids are used for de-duplication, both when virtualized lists re-render items and across feeds.
- The unified feed merges every feed's items in DOM order, and each item keeps a reference to the feed it came from.
- Events: `item:added` (status `kept` | `pending`), `item:excluded`, `item:removed`, `feed:lost` (the descriptor no longer matches).
- Containers that are re-mounted (SPA navigation, React re-render) are found again through their descriptor.
- Loading more items (scrolling or clicking "load more") is left to the page or the user. The library only observes.

## 8. Public API (sketch)
```ts
detectFeeds(doc: Document, opts?: DetectOptions): Promise<FeedDescriptor[]>
detectFromElement(el: Element): FeedDescriptor
detectFromSelector(doc: Document, sel: SelectorInput): FeedDescriptor
watchFeeds(doc: Document, profile: SiteProfile, opts?: WatchOptions): UnifiedFeed // emitter + current items; .stop()
openOverlay(doc: Document, proposals: FeedDescriptor[]): Promise<SiteProfile>   // resolves when the user confirms

type FeedDescriptor = {
  id: string; container: Selector; item: Selector;
  exclude: Rule[]; include: Rule[];
  source: 'heuristic' | 'llm' | 'inspect' | 'manual'; confidence: number; confirmed: boolean;
}
type Selector = { type: 'css' | 'xpath'; value: string }
type Rule = { kind: 'selector'; selector: Selector; scope: 'item' | 'part' } | { kind: 'llm-text'; criteria: string }
type LlmBackend = LanguageModel | ((req: LlmRequest) => Promise<unknown>) // fn form = proxy to extension background
```

## 9. LLM providers & configuration
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
  `createModelFromEnv()` turns these into a `LanguageModel`. The extension's settings page can override them at runtime.
- **Extension constraints**:
  - LLM calls run in the **extension background context**: a service worker on Chromium, an event page on Firefox. Content scripts send requests through the `LlmBackend` function proxy, so the page never sees API keys.
  - Ollama must allow extension origins (`OLLAMA_ORIGINS=chrome-extension://*,moz-extension://*`).
  - An API key inlined from `.env` ends up in the extension bundle. That is acceptable for dev builds only. Distributed builds should take the key from the settings page.
- Privacy: only skeletons and item text are sent, trimmed to configurable size limits.

## 10. Dependencies
| Need | Choice | Why |
|---|---|---|
| LLM abstraction + structured output | `ai` + provider packages (optional peers) | One API for all four providers |
| Schema validation | `zod` | Required by AI SDK structured output |
| Unique CSS selector generation | `@medv/finder` | Tiny, maintained, robust short selectors |
| Cross-browser extension APIs (storage, messaging) | `webextension-polyfill` | Standard and small. Gives a single promise-based `browser.*` API on Chromium and Firefox |
| DOM for tests | `happy-dom` (dev) | Bun's recommended test DOM |
| Example/dev extension | WXT (dev only, not a library dependency) | Maintained MV3 framework with cross-browser builds and HMR |

Feed heuristics, the observer, and the exclusion engine are written in-house. No maintained library does "repeating list detection" (Readability targets articles).

## 11. Non-goals (v1)
- Fetching pages server-side or running headless browsers.
- Triggering infinite-scroll loads automatically.
- Extracting item fields (title/date/author). Candidate for SPEC-02.
- Showing separate feeds as separate streams (v1 only produces the unified feed).

## 12. Non-functional
- ESM, tree-shakable. The core has no LLM code unless an `LlmBackend` is passed.
- Incremental processing should stay cheap enough that scrolling doesn't stutter (target < 5 ms per batch of added items, excluding LLM time).
- Heuristic output is deterministic for the same DOM. Fixture tests with `bun test` run on saved HTML snapshots, including snapshots of infinite-scroll pages.

## 13. Decisions
- Target browsers: Chromium + Firefox.
- Items waiting for LLM classification are shown.
- SiteProfiles are keyed by hostname + URL path pattern.

## 14. Open questions
1. Check the chosen models' structured-output reliability once the `.env` models are set. If it is poor, fall back to JSON mode plus a repair/retry step.
