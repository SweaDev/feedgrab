# PLAN-01: Feedgrab — Implementation Plan

Status: Approved · Date: 2026-10-30 · Implements: `spec/SPEC-01.md` · Tasks: `spec/TASKS-01.md`

This plan is the authoritative design for v1. Where SPEC-01 §10 is only a sketch, §2 of this plan decides.
Each section is self-contained, so tasks cite only the line ranges they need.

## 1. Decisions & conventions

### 1.1 Binding decisions (from the project owner)
- Package name `feedgrab`, license **MIT** (copyright "2026 Fayaz Ahmed").
- Runtime/tooling: **Bun** (1.4.x) for install, build, and unit tests. Node ≥ 20 must be able to import `dist/`.
- Lint and format: **Biome**. TypeScript is `strict`.
- Fixtures are **synthetic** HTML pages written for this repo. No real-site snapshots.
- LLM tests use deterministic mocks. There is also an opt-in live suite, `bun run test:live`, which is skipped when `FD_LLM_MODEL` is unset.
- Network access is allowed. Install the npm deps and the Playwright browsers **Chromium + Firefox**. The example-extension smoke test runs on **Chromium only**. Firefox support is checked with a WXT Firefox build.
- The example extension (WXT) has a popup, an options page (LLM settings + overlay theme), a background LLM proxy, and a content script.

### 1.2 Git rules
- Commit **once per task**, directly on `main`. Never push.
- Before committing, change the task's checkbox in `spec/TASKS-01.md` from `[ ]` to `[x]`, in the same commit.
- The commit message is **one line**: the `Commit:` line of the task, verbatim. **No** body, **no** `Co-Authored-By` or other trailers.
- Commit with `git add -A && git commit -m "<message>"`.

### 1.3 Auto-mode rules (so work never stops for questions)
- Read only the line ranges a task cites. Open other files only when needed to call existing code.
- If something is ambiguous, pick the option most consistent with this plan, then append a dated entry to `spec/NOTES-01.md` (create it if missing): `- T<nn>: <decision> — <reason>`.
- **Never edit `spec/SPEC-01.md` or `spec/PLAN-01.md`**, except in T39. Edits would shift the cited line numbers.
- If a task cannot be completed (e.g. a network failure after 2 retries), mark it `[~]` instead of `[x]`, log the reason in NOTES-01, commit with the task's commit line + ` (partial)`, and continue with the tasks that do not depend on it.
- If an installed library version differs from what this plan assumes (e.g. the AI SDK major), adapt inside the module boundary named here and log it in NOTES-01.
- Every task ends with `bun run check` green (see §4.3). Tasks before T02 run only the commands they list.

### 1.4 Code conventions
- ESM only, `.ts` sources. Relative imports have no extension (bundler resolution).
- One responsibility per module. Pure functions where possible. No default exports.
- **No DOM globals in `src/`**, apart from the browser-only paths that §3.3 allows. Get the window with `getWindow(doc)` (§5.1). Use JS globals (`URL`, `setTimeout`, `queueMicrotask`, `AbortController`, `structuredClone`) only through `globalThis`, which exists in all runtimes.
- Check node types numerically (`node.nodeType === 1`), never with `instanceof HTMLElement`, because elements may come from another realm or from happy-dom.
- Public functions have JSDoc. Internal helpers don't need it.
- Throw only `FeedgrabError` (§5.0) from public APIs.
- Tests sit next to their area under `tests/unit/<area>/*.test.ts`. They never register a global DOM; they build documents with `parseHtml` or `loadFixture` (§6.2).

## 2. Spec clarifications & deviations (authoritative)
1. **Selector semantics.**
   - A container `Selector` is evaluated against the document. It may match **several** elements (chunked or virtualized lists), and all matches are containers of that feed.
   - An item `Selector` is evaluated **with each container as the context**: CSS via `container.querySelectorAll(value)`, XPath with the container as the context node. Matches that are not descendants of the container are dropped.
   - Generated item selectors look like `:scope > tag.cls`.
2. **Types added to SPEC §10:**
   - `SelectorInput = { container?: Selector; item?: Selector }`. At least one is required.
   - `Rule` gets optional `id?: string` (auto-filled as `r_<hash>`) and `origin?: 'user' | 'llm'` (default `'user'`). Built-in rules are not stored in descriptors.
   - `include: Rule[]` uses the same type. Only `selector` rules are valid in `include`.
   - `FeedItem` gets `connected: boolean` (false after the element leaves the DOM) and `rescuedBy?: RuleRef` (set when an include rule kept the item).
   - New event: `feed:error` (payload `{ feedId?: string; error: FeedgrabError }`).
3. **LLM entry points.**
   - The core (`feedgrab`) exports `createLlmProxy(send)`. `LlmBackend = LanguageModel | LlmProxyFn`.
   - When the core is given a `LanguageModel`, it **lazily** imports `src/llm/run-model.ts`, which imports `ai`. `ai` is therefore a regular dependency.
   - A new entry, `feedgrab/llm`, exports:
     - `handleLlmRequest(req, model, opts?)`,
     - `createModel(config, providers)` and `createModelFromEnv(providers, env?)`. These are **synchronous** and take provider factories by **dependency injection**, so bundlers never need to resolve provider packages that aren't installed.
     - `readEnvConfig(env?)`.
   - A new entry, `feedgrab/llm/providers`, exports `allProviders`. It statically imports the four provider packages, which are optional peers.
4. **Server entry additions:**
   - `disposeDocument(doc)` closes the happy-dom window behind a parsed document.
   - `registerXPathEngine(engine)` lives in the core. The server entry registers the `xpath` package as the engine when `doc.evaluate` is missing.
5. **Default for `live`.**
   - `parseHtml` tags the document with `Symbol.for('feedgrab.parsed')`. `openFeed` sets `live` to false when that tag is present, and to true otherwise.
   - `observe` follows `live`.
6. **Built-in selector rules.**
   - A match on the **item element itself** excludes the item.
   - A match on a **descendant** is reported as a part (scope `part`).
   - Text labels such as "Sponsored" are left to LLM text rules (no regex, per SPEC §8).
7. **Placeholders.** An item with no permalink and fewer than `minItemTextLength` characters of text (default 10) is tracked but **not emitted**. It is re-checked on mutations inside it. This covers skeleton loaders.
8. **Overlay host.**
   - The host is a plain `<div data-feedgrab-overlay>` with an **open** shadow root, appended to `doc.documentElement`.
   - No custom elements, because `customElements` is null in Chrome content scripts.
   - The overlay never changes feed nodes. Its listeners use the capture phase and are removed on close.
9. **Removal marker.** Removal helpers set `data-fd-removed="item" | "part"`. `restore()` returns `boolean` (false if the node can no longer be restored).
10. **The browser IIFE bundle** (`feedgrab/browser`) contains the core and the overlay. It accepts only the proxy form of `LlmBackend`. Passing a `LanguageModel` throws `FeedgrabError('LLM_MODEL_UNSUPPORTED_IN_BUNDLE')`.
11. **Spec text left to T39:** T39 updates the SPEC §10 sketch to match the items above.

## 3. Architecture

### 3.1 Repository layout
```
feedgrab/
├─ package.json  tsconfig.json  tsconfig.build.json  biome.json  bunfig.toml
├─ .env.example  .gitignore  LICENSE  README.md
├─ scripts/        build.ts  node-smoke.mjs  check-size.ts
├─ src/
│  ├─ index.ts            # core public API ("feedgrab")
│  ├─ types.ts  errors.ts
│  ├─ env/        dom.ts  hash.ts  text.ts  timers.ts
│  ├─ selector/   evaluate.ts  xpath.ts  generate.ts  match.ts
│  ├─ signature/  classes.ts  signature.ts
│  ├─ detect/     heuristic.ts  score.ts  candidate.ts  descriptor.ts  detect.ts  inspect.ts  skeleton.ts  llm-refine.ts
│  ├─ exclude/    builtin.ts  specificity.ts  rules.ts  engine.ts  llm-classifier.ts
│  ├─ feed/       unified-feed.ts  registry.ts  observer.ts  item-id.ts  feed-item.ts  emitter.ts  async-queue.ts  ingest.ts
│  ├─ cleanup/    remove.ts
│  ├─ profile/    schema.ts  normalize.ts  profile.ts  match.ts  migrate.ts
│  ├─ llm/        contract.ts  proxy.ts  backend.ts  run-model.ts  run-model.stub.ts  structured.ts  prompts.ts  config.ts  models.ts
│  │              index.ts (entry "feedgrab/llm")  providers.ts (entry "feedgrab/llm/providers")
│  ├─ overlay/    index.ts (entry "feedgrab/overlay")  host.ts  theme.ts  styles.ts  highlighter.ts  picker.ts  state.ts  panel.ts  h.ts  open-overlay.ts
│  ├─ server.ts           # entry "feedgrab/server"
│  └─ browser.ts          # IIFE entry "feedgrab/browser" (global Feedgrab)
├─ tests/
│  ├─ fixtures/   *.html  *.expected.json  README.md
│  ├─ helpers/    dom.ts  mock-llm.ts  snapshot.ts
│  ├─ unit/<area>/*.test.ts      # bun test
│  ├─ scenarios/  index.ts  run.ts   # shared parity scenarios (bun + browser)
│  ├─ e2e/        *.spec.ts  global-setup.ts  serve.ts   # Playwright
│  └─ live/       *.live.test.ts     # opt-in
├─ examples/extension/   # WXT example (bun workspace)
└─ .github/workflows/ci.yml
```

### 3.2 Layering (imports point downward only; no cycles)
```
L0  types.ts, errors.ts, env/*
L1  selector/*, signature/*, profile/*, llm/contract.ts, llm/proxy.ts
L2  detect/* (except llm-refine), exclude/{builtin,specificity,rules,engine}.ts, llm/backend.ts
L3  detect/llm-refine.ts, exclude/llm-classifier.ts, cleanup/*
L4  feed/*
L5  overlay/*  (may import any of L0–L4)
E   index.ts, server.ts, browser.ts, llm/index.ts, llm/providers.ts (entry files: re-exports + wiring only)
```
- `llm/run-model.ts`, `llm/structured.ts`, `llm/prompts.ts`, `llm/models.ts`, and `llm/config.ts` are the only files that import `ai` or `@ai-sdk/*`.
- `llm/backend.ts` reaches `run-model.ts` only through `import('./run-model')`.
- `src/server.ts` is the only file that imports `happy-dom` or `xpath`.

### 3.3 Where browser-only globals are allowed
- `overlay/*`: `requestAnimationFrame`, `ResizeObserver`, and `getComputedStyle`, always read from `getWindow(doc)`, never from bare globals.
- `feed/observer.ts`: the `MutationObserver` constructor, from `getWindow(doc).MutationObserver`. If it is missing, observation is disabled and the feed behaves as `live:false`.

### 3.4 Entry points & `package.json` exports
| Subpath | Source | Output | Platform |
|---|---|---|---|
| `.` | `src/index.ts` | `dist/index.js` | browser + node |
| `./overlay` | `src/overlay/index.ts` | `dist/overlay/index.js` | browser |
| `./server` | `src/server.ts` | `dist/server.js` | node/bun |
| `./llm` | `src/llm/index.ts` | `dist/llm/index.js` | node/bun/extension background |
| `./llm/providers` | `src/llm/providers.ts` | `dist/llm/providers.js` | same |
| `./browser` | `src/browser.ts` | `dist/browser.global.js` (IIFE) | page injection |

Each subpath has `{ "types": "./dist/types/<path>.d.ts", "import": "./dist/<path>.js" }`, and `./browser` maps to the file directly. Set `"sideEffects": ["./dist/browser.global.js"]` and `"files": ["dist", "LICENSE", "README.md"]`.

## 4. Tooling & build

### 4.1 Dependencies
- **dependencies**: `zod` (v4; schemas use the tree-shakable `zod/mini` API so the IIFE bundle stays under 120 KB), `ai` (latest stable major), `xpath`.
- **peerDependencies** (all marked optional in `peerDependenciesMeta`): `happy-dom`, `@ai-sdk/openai-compatible`, `@ai-sdk/openai`, `@ai-sdk/google`, `@openrouter/ai-sdk-provider`.
- **devDependencies**: `typescript`, `@biomejs/biome`, `@types/bun`, `happy-dom`, the four provider packages, `@playwright/test`.
- The example extension has its own `package.json` with `wxt` and `"feedgrab": "workspace:*"`. The root `package.json` sets `"workspaces": ["examples/*"]`.

### 4.2 Config files
- `tsconfig.json`:
  - `target`/`lib`: `ES2022`, `DOM`, `DOM.Iterable`;
  - `module: "ESNext"`, `moduleResolution: "bundler"`;
  - `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes: false`, `verbatimModuleSyntax`, `noEmit`, `types: ["bun"]`;
  - `include: ["src", "tests", "scripts"]`.
- `tsconfig.build.json`: extends the base with `noEmit: false`, `declaration`, `emitDeclarationOnly`, `outDir: "dist/types"`, `rootDir: "src"`, and `include: ["src"]`.
- `biome.json`:
  - recommended rules, formatter with 2-space indent, line width 100, single quotes, trailing commas `all`;
  - ignores `dist`, `examples/extension/.output`, `examples/extension/.wxt`, and `tests/fixtures/*.html`.
- `bunfig.toml`: `[test]` with `root = "tests"`. Live tests are skipped by default: they live under `tests/live` and are excluded via the `test` script path list.
- `.env.example`: the variables from SPEC §11, with comments. `.gitignore`: `node_modules`, `dist`, `.env`, `.output`, `.wxt`, `test-results`, `playwright-report`.

### 4.3 Scripts (`package.json`)
| Script | Command |
|---|---|
| `build` | `bun run scripts/build.ts` |
| `typecheck` | `tsc -p tsconfig.json` |
| `lint` | `biome check .` |
| `format` | `biome format --write .` |
| `test` | `bun test tests/unit` |
| `test:e2e` | `bun run build && playwright test` |
| `test:live` | `bun test tests/live` |
| `check` | `bun run lint && bun run typecheck && bun run test` |
| `check:all` | `bun run check && bun run build && bun run test:e2e && bun run --filter feedgrab-example-extension build` |

### 4.4 `scripts/build.ts`
1. Delete `dist/`.
2. Run `Bun.build` with:
   - entrypoints `src/index.ts`, `src/overlay/index.ts`, `src/server.ts`, `src/llm/index.ts`, `src/llm/providers.ts`;
   - `outdir: "dist"`, `root: "src"`, `format: "esm"`, `target: "browser"`, `splitting: true`, `sourcemap: "linked"`;
   - `external` set to every dependency and peer.
   - Check that `dist/server.js` runs under Node: it only imports `happy-dom`/`xpath`, which are external.
3. Build `src/browser.ts` with `Bun.build` into `dist/browser.global.js`:
   - `format: "iife"`, `minify: true`, `target: "browser"`;
   - **no externals**;
   - a plugin with `onResolve` for `/run-model$/` that redirects to `src/llm/run-model.stub.ts`.
4. Run `tsc -p tsconfig.build.json`.
5. Print the output sizes. `scripts/check-size.ts` fails if `browser.global.js` exceeds **120 KB** minified.

## 5. Module designs

### 5.0 Types & errors (`src/types.ts`, `src/errors.ts`)
- `types.ts` holds **every public type**:
  - `Selector`, `SelectorInput`, `Rule`, `SelectorRule`, `LlmTextRule`, `RuleRef`, `FeedDescriptor`, `SiteProfile`;
  - `FeedItem`, `ItemStatus`, `ExclusionMatch`, `PartMatch`;
  - `DetectOptions`, `FeedOptions`, `IterateOptions`, `UnifiedFeed`, `FeedEvents`, `Candidate`, `MatchResult`, `Box`.

  Use the shapes from SPEC §10 plus §2 of this plan. Types only, no runtime code apart from `const` enums-as-unions.
- `ExclusionMatch = { ruleId: string; origin: 'builtin' | 'user' | 'llm'; kind: 'selector' | 'llm-text' | 'signature-outlier'; selector?: Selector; criteria?: string; confidence?: number; element?: Element }`.
- `PartMatch = { element: Element; rule: RuleRef }`, with `RuleRef = { ruleId: string; origin: 'builtin' | 'user' | 'llm' }`.
- `errors.ts`: `class FeedgrabError extends Error { code: ErrorCode; details?: unknown }`. The `ErrorCode` union:
  - `INVALID_SELECTOR`, `NO_MATCH`, `NO_REPEATING_ANCESTOR`, `INVALID_PROFILE`, `UNSUPPORTED_PROFILE_VERSION`;
  - `LLM_UNAVAILABLE`, `LLM_BAD_REQUEST`, `LLM_INVALID_RESPONSE`, `LLM_MODEL_UNSUPPORTED_IN_BUNDLE`, `LLM_CONFIG`, `LLM_PROVIDER_MISSING`;
  - `OVERLAY_CANCELLED`, `OVERLAY_NO_LAYOUT`, `DISPOSED`, `XPATH_UNSUPPORTED`;
  - `LISTENER_ERROR` (a consumer's event listener threw; surfaced as `feed:error`).

### 5.1 Environment utilities (`src/env/*`)
- `dom.ts`:
  - `getWindow(doc): (Window & typeof globalThis) | null` returns `doc.defaultView`.
  - `isElement(n): n is Element` checks `nodeType === 1`.
  - `elementChildren(el): Element[]`.
  - `hasLayout(doc): boolean` is true when `doc.body?.getBoundingClientRect` exists **and** the body or documentElement rect has width > 0. Cache the result per document in a WeakMap; it is false in happy-dom.
  - `isHiddenStatic(el)`: the `hidden` attribute, `aria-hidden="true"`, or inline `display:none`/`visibility:hidden`.
  - `isHiddenRendered(el)`: `getComputedStyle` + rect, used only when `hasLayout`.
  - `IGNORED_TAGS = new Set(['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','HEAD','META','LINK','svg','SVG','PATH','IFRAME','OBJECT','EMBED','CANVAS'])`.
- `hash.ts`: `fnv1a32(str): number` and `hashString(str): string`, which is fnv1a32 → base36, padded to 7 characters. The hash is deterministic and synchronous. Ids use `prefix + hashString(...)`.
- `text.ts`: `normalizeText(el, max = 2000)` takes `textContent` with `SCRIPT`/`STYLE` subtrees skipped (walk with `doc.createTreeWalker`, NodeFilter value 4 = text), collapses whitespace, trims, and truncates to `max`. Also `textLength(el)`.
- `timers.ts` wraps `globalThis.setTimeout`/`clearTimeout`/`queueMicrotask` so tests can stub them.

### 5.2 Selector evaluation (`src/selector/evaluate.ts`, `xpath.ts`, `match.ts`)
- `evaluateSelector(sel: Selector, context: Document | Element): Element[]`:
  - CSS: `context.querySelectorAll(value)` → array.
  - XPath: use `ownerDoc.evaluate(value, context, null, 7 /*ORDERED_NODE_SNAPSHOT*/, null)` when it is available, else the registered engine (`xpath.ts`), else throw `XPATH_UNSUPPORTED`.
  - Keep element nodes only. Throw `INVALID_SELECTOR` (with `details.cause`) on a syntax error.
- `resolveContainers(doc, descriptor): Element[]` and `resolveItems(container, descriptor): Element[]`. The latter keeps only descendants of the container (`container.contains(el) && el !== container`).
- `xpath.ts`: `type XPathEngine = (expr, contextNode) => Node[]`, `registerXPathEngine(engine)`, `getXPathEngine()`. Module-level state, set once by the server entry.
- `validateSelector(doc, sel)` returns `{ valid, count, error? }` and never throws.
- `matchSelector(doc, sel, { root? }): MatchResult = { elements: Element[]; boxes?: Box[] }`, where `Box = { x, y, width, height }`. `boxes` is present only when `hasLayout(doc)`.

### 5.3 Selector generation (`src/selector/generate.ts`)
- `containerSelector(el): Selector`:
  1. If `el.id` is stable (§5.4 `isStableToken`) and unique in the document → `#id`.
  2. Otherwise run a local, deterministic finder-style search: try the simple selectors of `el` (stable `#id`, each stable class, `STABLE_ATTRS` attributes with `STABLE_ATTRS = ['role','data-testid','data-test','aria-label','itemtype','itemprop']`, tag + classes, tag) for uniqueness in the document. Then extend upwards through ancestors (`ancestor descendant`, then `parent > child` levels distinguished among siblings).
  3. No globals are read (the external finder library was dropped: it needs `document`, `Node` and `CSS` globals, which parsed documents don't have).
  4. If no unique selector is found, fall back to an `nth-child` path (`buildPathSelector`).
- `itemSelector(container, items): Selector`, with `tag` = the shared lowercase tag (the dominant tag if mixed) and `C` = the stable classes shared by **all** items:
  - `S1 = ':scope > ' + tag`.
  - `S2 = S1 + C.map(c => '.' + cssEscape(c)).join('')`, the classes sorted.
  - Let `extra` = the children matched by S1 that are not in `items`. Use S1 if `extra.length <= 0.5 * items.length`, so that ads which are siblings show up as items, are reported, and get excluded. Otherwise use S2.
  - If `items` are not direct children (wrapper case), use the descendant form `':scope ' + tag + classes`.
- `cssEscape(s)`: escape using the CSS.escape algorithm, implemented locally with no global `CSS`.
- `buildPathSelector(el, root)`: `tag:nth-child(n)` chain.

### 5.4 Stable classes & signatures (`src/signature/*`)
- `classes.ts`:
  - `isStableToken(t)` is false when any of these hold:
    - length > 40 or < 2;
    - matches `/^(css|sc|jsx|emotion|styled|chakra|mui|tw)-[a-z0-9]+$/i`;
    - matches `/^[a-z]+-[a-f0-9]{5,}$/i`;
    - contains `__` followed by a ≥ 5-character hash (`/__[a-z0-9_-]{5,}$/i` with a digit in it);
    - matches `/[0-9]{3,}/`;
    - has a mixed-case random shape (`/^[a-zA-Z]{1,3}[0-9][a-zA-Z0-9]{3,}$/`);
    - contains any of `: [ ] / ( ) !` (Tailwind variants).
  - `isStableClass(c)` = `isStableToken(c)` and not a state class (`/^(is|has)-|^(active|selected|hover|focus|open|visible|hidden|show|collapsed|expanded)$/`).
  - `stableClasses(el): string[]` returns the sorted, unique stable classes.
- `signature.ts`:
  - `sigL1(el) = tag + '.' + stableClasses(el).join('.')`.
  - `shape(el)` = the sorted multiset of child tags, at most 12, as `'DIV*2,IMG,A'`.
  - `sigL2(el) = hashString(sigL1 + '|' + shape)`.
  - `classSimilarity(a, b)`: Jaccard of `stableClasses`. Two items are "same kind" when the tags are equal and Jaccard ≥ 0.5, or both have no stable classes and their `shape` Jaccard ≥ 0.5.
  - `dominantSignature(items)` returns the most common L1, with ties broken by lexical order.

### 5.5 Heuristic detection (`src/detect/heuristic.ts`, `score.ts`, `candidate.ts`)
- `findCandidates(doc, opts): Candidate[]` with `Candidate = { container: Element; items: Element[]; signature: string; score: number; features: Features }`.
- Algorithm:
  1. Walk `doc.body` with a TreeWalker (elements only). Skip `IGNORED_TAGS` and statically hidden subtrees.
  2. For each element `P` with at least `minItems` element children (default **3**):
     - group the children by `sigL1`, then merge groups that are "same kind";
     - take the largest group `G`, with ties broken by first document position;
     - if `|G| >= minItems`, emit a raw candidate.
  3. **Wrapper case**: if `P` has exactly one child and it is not in `IGNORED_TAGS`, skip `P`. The child will be evaluated itself, which avoids duplicate containers.
  4. Compute the features, each normalized to [0, 1]:
     - `count = min(1, log2(|G|) / log2(50))`
     - `coverage = |G| / P.children.length`
     - `text`: median `textLength` per item mapped by a trapezoid: 0 at < 15 characters, 1 between 40 and 1500, 0.5 at > 4000
     - `links` = the fraction of items with an `a[href]`
     - `media` = the fraction of items with `img, picture, video, [style*="background-image"]`
     - `shape` = the fraction of items whose `sigL2` equals the mode
     - `depth` = `min(1, medianDescendantCount / 8)`
     - `navPenalty` = 1 if `P` or an ancestor is `nav, header, footer, [role=navigation], [role=menu], [role=menubar], [role=tablist], select, datalist`; else 0.5 if the median item text is < 25 characters and each item holds a single link only; else 0
     - `area` (only if `hasLayout`) = the summed item rect area / viewport area, capped at 1
  5. Score in `score.ts`, with the weights kept as exported constants:
     - `score = 0.20*count + 0.10*coverage + 0.20*text + 0.15*links + 0.10*media + 0.10*shape + 0.15*depth`
     - with layout: `score = 0.85*score + 0.15*area`
     - then `score *= (1 - 0.6*navPenalty)`
     - round to 4 decimals for determinism.
  6. Keep candidates with `score >= threshold` (default **0.45**).
  7. **Nested suppression**: sort by score descending, then by document order. For each candidate, drop it if its container is inside, or equal to, an item or the container of an already kept candidate that scores ≥ its own. Also drop it if it contains an already kept container whose score is ≥ its own × 1.1 (an outer wrapper of a better feed).
  8. Return the result sorted by score descending, then document order, limited to `topK` (default **10**).

### 5.6 Descriptors, `detectFeeds`, inspect, `detectFromSelector` (`src/detect/descriptor.ts`, `detect.ts`, `inspect.ts`)
- `descriptorFromCandidate(c, source)` builds:
  - `container = containerSelector(c.container)`, `item = itemSelector(c.container, c.items)`;
  - `id = 'fd_' + hashString(container.value + '|' + item.value)`;
  - `exclude: []`, `include: []`, `confidence = c.score`, `confirmed: false`.
- `detectFeeds(doc, opts: DetectOptions = {})`:
  - `DetectOptions = { minItems?: number; threshold?: number; topK?: number; llm?: LlmBackend; llmTopK?: number /*5*/; maxSkeletonChars?: number /*12000*/; signal?: AbortSignal; onLlmError?: (e) => void }`.
  - It runs the heuristic, then the LLM refine if `llm` is set (§5.8), and returns `FeedDescriptor[]`.
  - It never throws because of the LLM: on an LLM error it calls `onLlmError` and keeps the heuristic result.
- `inspectFromElement(el, { minItems = 2 } = {})`:
  - Starting at `a = el`, while `a.parentElement` exists and `a` is not `body`: count the siblings of `a` that are "same kind" as `a`. If `count + 1 >= minItems`, then `container = parent`, `items` = those siblings plus `a`, and stop. Otherwise `a = parent`.
  - Throws `NO_REPEATING_ANCESTOR` if nothing is found.
  - Returns a descriptor with `source: 'inspect'`, its confidence scored by `score.ts`.
- `detectFromSelector(doc, input)`:
  - `container` + `item`: validate both. Throw `NO_MATCH` if either is empty.
  - `container` only: take the first container and run step 2 of §5.5 on it to choose the item group, then build `itemSelector`.
  - `item` only: resolve the items document-wide. `container` = the lowest common ancestor of all of them, and `containerSelector(lca)`. Keep the item selector **as given**, because evaluating it relative to the container still matches (§2.1).
  - Result: `source: 'manual'`, `confidence: 1`, `confirmed: false`.

### 5.7 Skeleton builder (`src/detect/skeleton.ts`)
- `buildSkeleton(candidates, { maxChars = 12000, samplesPerCandidate = 3, depth = 3, maxChildren = 8, textSample = 80 })` returns a string.
- For each candidate `i`, it emits:
  - the header `#<i> container=<css> items=<count> itemSelector=<css> score=<s>`;
  - the first `samplesPerCandidate` items, plus the first item that **differs** from the dominant signature (if any, so the LLM sees ad-like outliers).

  Each item is rendered as an indented tree:
  - `<tag .cls1.cls2 #id role=… aria-label=… data-testid=…> "text sample…"`
  - only stable classes, at most `depth` levels, at most `maxChildren` children (the rest as `…+N`);
  - text from direct text nodes only, truncated.
- Stop adding candidates and samples when `maxChars` is reached, and append `…truncated`.

### 5.8 LLM refine (`src/detect/llm-refine.ts`)
- Request: `{ task: 'detect', skeleton, candidates: [{ index, container, item, count }] }`.
- Response: `{ feeds: [{ candidateIndex?: number, containerSelector: string, itemSelector: string, exclusions: [{ selector: string, scope: 'item' | 'part' }], confidence: number }] }`, with the contracts in §5.15.
- **Validation** of each feed:
  - the container selector is valid CSS and matches ≥ 1 element;
  - the items resolved relative to the first container number ≥ `minItems` and ≤ max(200, 10 × the candidate count);
  - each exclusion selector is valid and matches ≥ 1 element inside the feed; invalid exclusions are dropped individually.
  - A feed that fails validation is dropped.
- **Merge**:
  - Each valid LLM feed becomes a descriptor with `source: 'llm'` and its exclusions as `Rule`s with `origin: 'llm'`. Its `confidence` is `round4(0.5 * llm.confidence + 0.5 * heuristicScore)`, where `heuristicScore` comes from the candidate whose container matches (or 0.5 if none matches).
  - Heuristic candidates that no LLM feed covers (same first container) stay unchanged.
  - Sort by confidence descending, then document order.
- If the LLM throws, or its response fails the zod parse after one repair retry (§5.15), return the heuristic result.

### 5.9 Exclusion rules & specificity (`src/exclude/builtin.ts`, `specificity.ts`, `rules.ts`)
- `builtin.ts` exports `BUILTIN_RULES: SelectorRule[]`. Each has an `id` (`b_<name>`), `origin: 'builtin'`, and a CSS selector:
  - `b_data_ad`: `[data-ad],[data-ad-slot],[data-ad-client],[data-adunit],[data-ad-unit],[data-ad-name],[data-google-query-id]`
  - `b_adsense`: `ins.adsbygoogle,[id^="google_ads"],[id^="div-gpt-ad"]`
  - `b_ad_iframe`: `iframe[src*="doubleclick."],iframe[src*="googlesyndication."],iframe[src*="adservice."],iframe[id^="google_ads"]`
  - `b_ad_class`: `.ad,.ads,.advert,.advertisement,.ad-slot,.ad-container,.sponsored,.promoted`
  - `b_outlier`: special, with no selector (see §5.10).
- `specificity.ts`:
  - `cssSpecificity(selector): [a, b, c]`, computed by a small tokenizer for ids, classes/attributes/pseudo-classes, and types/pseudo-elements. For a selector list (comma-separated), take the max. `:is()`/`:not()`/`:has()` count as their most specific argument, and `:where()` counts as 0.
  - `xpathSpecificity(expr): [0, predicates + attributeTests, steps]`.
  - `compareSpecificity(a, b)` compares lexicographically.
- `rules.ts`:
  - `normalizeRule(rule)` fills `id = 'r_' + hashString(JSON.stringify(rule without id))` and `origin` defaults to `'user'`. It lives in `src/profile/normalize.ts` (L1, so profiles can use it), and `rules.ts` imports it.
  - `matchSelectorRule(item, rule)` returns `{ itemMatch: boolean; parts: Element[] }`:
    - `scope: 'item'`: `itemMatch = item.matches(css)` or `item.querySelector(css) !== null`. For XPath, the context node is the item.
    - `scope: 'part'`: `parts = item.querySelectorAll(css)`, excluding the item itself.
  - `matchBuiltin(item, rule)`: `item.matches` → itemMatch. Descendant matches become parts (§2.6).

### 5.10 Exclusion engine (`src/exclude/engine.ts`)
- `evaluateItem(item, ctx): Evaluation`, where:
  - `ctx = { descriptor, builtins: boolean, dominantSig: string, llmVerdict?: (item) => LlmVerdict | 'pending' | undefined }`;
  - `Evaluation = { status, reasons: ExclusionMatch[], parts: PartMatch[], rescuedBy?: RuleRef, needsLlm: boolean }`.
- **Rank** by origin: a user selector rule = 3, an LLM-proposed selector rule (`origin: 'llm'`) = 2, an LLM text verdict = 2, a builtin = 1.
- Steps:
  1. Collect the item-level **exclude matches** from:
     - the descriptor's `exclude` selector rules;
     - the builtins, if enabled;
     - the **signature outlier**, if enabled: the item's `sigL1` is not "same kind" (§5.4) as `dominantSig`. Its reason has `kind: 'signature-outlier'`, `ruleId: 'b_outlier'`, `origin: 'builtin'`.
  2. Collect the **include matches** from `descriptor.include`. These are user rules, rank 3.
  3. Find the strongest exclude `E` and the strongest include `I`, comparing by (rank, specificity). The outlier and LLM verdicts count as specificity `[0,0,0]`.
  4. If `I` exists, and either `rank(I) > rank(E)` or ranks are equal and `spec(I) >= spec(E)` → `status: 'kept'` and `rescuedBy: I`.
  5. If no `I`, or `I` lost:
     - if `E` exists → `status: 'excluded'` and `reasons` = all exclude matches, sorted by (rank desc, spec desc);
     - else if the descriptor has `llm-text` rules and `I` is absent:
       - if `llmVerdict` is `'pending'` or `undefined` → `status: 'pending'` and `needsLlm = (verdict === undefined)`;
       - if the verdict is `exclude` → `excluded`, with an `llm-text` reason carrying the criteria and confidence;
       - otherwise → `kept`.
     - otherwise → `kept`.
  6. **Parts**: collect them from the `part` selector rules (user and LLM) and from builtin descendant matches. A part element is rescued when any include rule's selector `matches` it. Deduplicate by element, and keep document order.

### 5.11 LLM text classifier (`src/exclude/llm-classifier.ts`)
- `class LlmClassifier { constructor(backend: ResolvedBackend, opts) ; verdict(itemKey: string): LlmVerdict | 'pending' | undefined ; enqueue(items: {key, text}[], criteria: string[]) ; onResult(cb) ; dispose() }`.
- `key = hashString(text) + ':' + hashString(criteria.join('\n'))`. Results are cached in an LRU Map of **5000** entries.
- Batching:
  - flush when the queue reaches `batchSize` (default **10**) or `batchDelayMs` (default **250**) after the first enqueue;
  - at most `maxConcurrent` (default **2**) in-flight requests;
  - item text is truncated to `maxItemChars` (default **600**).
- Request: `{ task: 'classify', criteria: string[], items: [{ id: key, text }] }`.
- Response: `{ results: [{ id, exclude: boolean, criteriaIndex?: number, confidence: number }] }`. Exclude only if `confidence >= minConfidence` (default **0.5**).
- On a failure, retry once after 500 ms. If that also fails, the verdict is `{ exclude: false, error: true }` for those keys, the item becomes **kept**, and `onError` is called (it surfaces as `feed:error`).
- `dispose()` aborts in-flight requests through their `AbortController`s and clears the queues.

### 5.12 UnifiedFeed (`src/feed/*`)
- **`feed-item.ts`**: the class `FeedItemImpl implements FeedItem`. It has public readonly-ish fields, internal fields under a `#private` or a `Symbol('fd.internal')`: the removal handles and the last evaluation, and `text()` → `normalizeText(element)`, cached until the element changes.
- **`item-id.ts`**: `itemId(el, baseUrl): string | null`:
  - **Permalink**: take the first match among `a[rel=bookmark][href]`, `a[href]:has(time)`, `time` inside `a[href]`, and then the first `a[href]` whose href is not `#…` or `javascript:`.
    - Canonicalize with `new globalThis.URL(href, baseUrl)`:
      - drop the hash;
      - delete the params `utm_*`, `fbclid`, `gclid`, `mc_cid`, `mc_eid`, `ref`, `ref_src`;
      - sort the remaining params.
    - id = `'i_' + hashString('L|' + url)`.
  - Otherwise, if the text length ≥ `minItemTextLength` → `'i_' + hashString('T|' + normalizeText(el, 500))`.
  - Otherwise `null`: a placeholder (§2.7).
- **`emitter.ts`**: a typed `Emitter<FeedEvents>` with `on(evt, fn) → unsubscribe`, `once`, `off`, and `emit`. A listener that throws is caught and re-emitted as `feed:error`, without recursion.
- **`async-queue.ts`**: `AsyncQueue<T>` with `push`, `close`, and `[Symbol.asyncIterator]`. `pull` resolves with the next item, or `done` once the queue is closed and empty. It also has a `drainThenClose()` mode used for `live:false`.
- **`registry.ts`**: `ItemRegistry`:
  - `byId: Map<string, FeedItemImpl>`, `byElement: WeakMap<Element, string>`, and `order: FeedItemImpl[]`, kept sorted by `(docSeq, document position)`;
  - binary insertion uses `compareDocumentPosition` (bit `4` means "following") inside the same document. `docSeq` is 0 for the main document, and n for the n-th ingest.
- **`unified-feed.ts`**: `openFeed(doc, profile, opts: FeedOptions = {}): UnifiedFeed`.
  - `FeedOptions = { llm?: LlmBackend; builtinExclusions?: boolean /*true*/; live?: boolean /*§2.5*/; minItemTextLength?: number /*10*/; lostTimeoutMs?: number /*2000*/; classifier?: Partial<ClassifierOptions>; baseUrl?: string /*doc.baseURI*/ }`.
  - **Initial scan**, for each descriptor in `profile.feeds`:
    1. resolve the containers and items;
    2. compute `dominantSig` from the initial items;
    3. for each item element, compute the id (skip placeholders, but remember them for re-checks) and **dedupe**: if the id already exists, ignore the element;
    4. evaluate it (§5.10), insert it, and record it as `item:added`.
    - Events for the initial items are emitted in a microtask after `openFeed` returns, so that listeners can attach. `items()` already returns them synchronously.
    - A descriptor that matches **no container** emits `feed:lost` in that microtask.
  - **Status updates**: whenever re-evaluation changes `status`, `reasons`, or `parts` → `item:updated(item, prevStatus)`.
  - **`items(opts?)`**: a snapshot array in order, filtered by `status`. With `includePending: false`, pending items are dropped.
  - **`[Symbol.asyncIterator]`** / **`iterate(opts?: IterateOptions)`**:
    - `IterateOptions = { status?: ItemStatus | ItemStatus[]; includePending?: boolean /*true*/; live?: boolean /*feed default*/ }`.
    - It creates its own `AsyncQueue` and pushes the current snapshot (filtered).
    - It subscribes to `item:added`, and to `item:updated` for items that newly match the filter.
    - Each item is yielded **at most once per iterator** (a Set of ids).
    - Live: the queue closes on `dispose()`. Not live: `drainThenClose()`, i.e. it yields what is queued, including the results of any `ingest()` called before the queue drains, then ends.
  - **`ingest(input, { url } = {})`**: see §5.13.
  - **`dispose({ restore = false } = {})`**:
    - stop the observers, `classifier.dispose()`, and close every iterator queue;
    - if `restore`, call the restore handles of every removal recorded on items;
    - clear the registry and the listeners.
    - Afterwards, other methods throw `DISPOSED`; `dispose` itself is idempotent.
- **`observer.ts`**: `FeedObserver` (only when `live` and a `MutationObserver` exists):
  - One `MutationObserver` per container, with `{ childList: true, subtree: true, characterData: true }`. Records are coalesced with `queueMicrotask` into one `processBatch()`:
    1. re-resolve the items in the affected containers and diff them against `byElement`;
    2. for new elements, compute the id:
       - an existing id whose item is `connected:false` → **re-attach**: swap the `element`, set `connected = true`, re-evaluate (the LLM cache keeps the verdict), and emit `item:updated` only, never `item:added` again;
       - an existing id that is connected → ignore (duplicate);
       - otherwise → add it (`item:added`).
    3. for known items whose `element.isConnected` is false → `connected = false`, `item:removed`;
    4. placeholders whose content changed are re-checked;
    5. for items whose subtree changed, re-evaluate and emit `item:updated` if anything changed.
  - **Re-mount**: when a container disconnects, attach one document-level observer on `doc.body` (`childList`, `subtree`). On each batch, re-resolve the descriptor's containers and attach to the new ones, then rescan. If no container has reappeared within `lostTimeoutMs` → `feed:lost({ feedId })`, emitted once per loss.
  - Measure `processBatch` time with `globalThis.performance?.now()` for the performance test (§6.6).
- **LLM integration**:
  - When an evaluation returns `needsLlm`, the item's text is enqueued in the classifier.
  - When a result arrives, re-evaluate every item with that key and emit `item:updated`.
  - Items for which `rescuedBy` is set are never enqueued.

### 5.13 Ingest (`src/feed/ingest.ts`)
- `toDocument(mainDoc, input: Document | string): Document`:
  - a string becomes `const d = mainDoc.implementation.createHTMLDocument('')`, then `d.documentElement.innerHTML = html`. Scripts in it are not executed, and there are no globals.
  - Return a `Document` input as it is.
- `ingest` then:
  - resolves every descriptor in the new document;
  - computes the ids with `baseUrl = url ?? mainDoc.baseURI`;
  - adds the new ids with `docSeq = ++seq` and `sourceUrl = url`, skipping ids that already exist;
  - evaluates them and enqueues them for the LLM;
  - emits `item:added`.
- It returns the newly added items in order. Ingested documents are never observed.

### 5.14 Cleanup (`src/cleanup/remove.ts`)
- `removeItem(item, { mode = 'hide' } = {})` and `removeParts(item, opts)` return `{ restore(): boolean }`. For `removeParts`, the handle wraps one handle per part.
- `hide` saves `style.getPropertyValue('display')` and its priority, then calls `style.setProperty('display', 'none', 'important')` and sets `data-fd-removed`. Restore puts both back.
- `detach` saves `parentNode` and `nextSibling`, then calls `el.remove()`. Restore:
  - if the parent is still connected, insert before the saved sibling when it is still a child, otherwise append;
  - otherwise return false.
- **Idempotent**: a second call on the same element with the same mode returns the existing handle. Handles are recorded on the item's internal state, so that `dispose({ restore: true })` can use them.

### 5.15 LLM layer (`src/llm/*`)
- **`contract.ts`** holds zod schemas, exported both as schemas and as their inferred types:
  - `LlmRequest = DetectRequest | ClassifyRequest`, discriminated on `task`.
  - `LlmResponse = DetectResponse | ClassifyResponse`.
  - The response schemas match §5.8 and §5.11, with `confidence` in `[0, 1]`.
  - `LlmProxyFn = (req: LlmRequest, opts?: { signal?: AbortSignal }) => Promise<unknown>`.
- **`proxy.ts`** (core):
  - `createLlmProxy(send): LlmProxyFn` sends `structuredClone`-safe JSON. It validates the response against the response schema for `req.task`, and throws `LLM_INVALID_RESPONSE` on a mismatch.
  - `isLanguageModel(x)` is true for an object that has `specificationVersion` and `doGenerate`.
- **`backend.ts`**: `resolveBackend(b: LlmBackend): ResolvedBackend = (req, opts) => Promise<LlmResponse>`:
  - a function → validate its response the same way as the proxy;
  - a model → `const { runModel } = await import('./run-model'); return runModel(req, model, opts)`.
- **`run-model.ts`**: `runModel(req, model, opts)` = `handleLlmRequest` (re-export). **`run-model.stub.ts`** throws `LLM_MODEL_UNSUPPORTED_IN_BUNDLE`.
- **`prompts.ts`**: `detectPrompt(req)` and `classifyPrompt(req)` return `{ system, prompt }`:
  - **Detect system**: "You identify repeating content feeds in web pages. Given candidate containers and DOM skeletons, return only real content feeds (posts, results, products, articles). Prefer the given selectors; you may refine them. Item selectors are evaluated relative to the container and should start with `:scope`. Suggest exclusion selectors only for ads/promotions/injected widgets you can see in the skeleton. Respond with JSON matching the schema."
  - **Classify system**: "Decide for each item whether it matches ANY of the exclusion criteria. Judge by meaning, not keywords. Return one result per item id with exclude, the index of the matched criterion, and confidence 0..1."
  - Prompts embed the skeleton or the item texts verbatim, with each item delimited by `<item id="…">…</item>`.
- **`structured.ts`** is the **only** place that calls the AI SDK's structured-output API:
  - `generateStructured({ model, schema, system, prompt, signal })`. Use the API the installed `ai` major recommends: `generateObject` in v5, or `generateText` with `output: Output.object({ schema })` where that is preferred.
  - `temperature: 0`.
  - On a schema failure, retry **once**, appending "Your previous answer was invalid: <zod issues>. Return valid JSON only." If that fails too → `LLM_INVALID_RESPONSE`.
- **`index.ts`** (entry `feedgrab/llm`):
  - `handleLlmRequest(req: unknown, model, opts?)` parses `req` with `LlmRequest` (throws `LLM_BAD_REQUEST` when it is malformed), dispatches on `task`, and returns a plain JSON response.
  - It also re-exports `createModel`, `createModelFromEnv`, `readEnvConfig`, and the types.
- **`config.ts`**:
  - `LlmConfig = { provider: 'ollama' | 'openai' | 'openrouter' | 'gemini'; model: string; baseURL?: string; apiKey?: string }`, as a zod schema.
  - `readEnvConfig(env = globalThis.process?.env ?? {})` reads `FD_LLM_PROVIDER`, `FD_LLM_MODEL`, `FD_LLM_BASE_URL`, and `FD_LLM_API_KEY`. It returns `LlmConfig | null`: null when `FD_LLM_MODEL` is unset. It throws `LLM_CONFIG` when a value is invalid.
  - Default base URLs: ollama `http://localhost:11434/v1`, openrouter `https://openrouter.ai/api/v1`. openai and gemini use the provider defaults.
- **`models.ts`**:
  - `type ProviderFactories = { ollama?: typeof createOpenAICompatible; openai?: typeof createOpenAI; openrouter?: typeof createOpenRouter; gemini?: typeof createGoogleGenerativeAI }`. Use **type-only** imports.
  - `createModel(config, providers)`: if the factory is missing → `LLM_PROVIDER_MISSING`, with a message naming the package to install.
    - ollama → `providers.ollama({ name: 'ollama', baseURL, apiKey })(model)`
    - openai → `providers.openai({ apiKey, baseURL })(model)`
    - openrouter → `providers.openrouter({ apiKey, baseURL })(model)`
    - gemini → `providers.gemini({ apiKey, baseURL })(model)`
  - `createModelFromEnv(providers, env?)` throws `LLM_CONFIG` when the config is null.
- **`providers.ts`** (entry): `export const allProviders: Required<ProviderFactories>`, with static imports of the four packages.

### 5.16 Profiles (`src/profile/*`)
- **`schema.ts`**: zod schemas for `Selector`, `SelectorRule`, `LlmTextRule`, `Rule`, `FeedDescriptor`, and `SiteProfileV1 = { version: 1, hostname, pathPattern, feeds, updatedAt?: string }`. Export `CURRENT_PROFILE_VERSION = 1`.
- **`migrate.ts`**: `migrations: Record<number, (p) => unknown>`, which is empty for v1. `migrate(raw)`:
  - applies the migrations up to the current version;
  - throws `UNSUPPORTED_PROFILE_VERSION` when the version is newer than supported.
- **`profile.ts`**:
  - `createProfile({ url, pathPattern?, feeds })`:
    - `hostname` = `new URL(url).host`, lowercased;
    - `pathPattern` defaults to the URL's pathname;
    - normalizes the rules (ids) and sets `confirmed` as passed.
  - `serializeProfile(p)`: a stable-key JSON string. Keys are sorted recursively, and elements are never included.
  - `parseProfile(s)`: `JSON.parse` → `migrate` → zod parse. Throws `INVALID_PROFILE` with the zod issues in `details`.
- **`match.ts`**: `matchProfile(url, profiles)`:
  - **Hostname**: an exact match (including the port) has specificity 2. `*.example.com` matches subdomains only and has specificity 1.
  - **Path pattern**: split on `/`, ignore the query and hash, and ignore a trailing slash.
    - `*` = exactly one segment;
    - `**` = zero or more segments;
    - a segment may contain `*` as a wildcard within the segment, e.g. `post-*`.
  - Order the candidates by:
    1. host specificity;
    2. the number of literal segments;
    3. fewer `**`;
    4. fewer `*`;
    5. a longer pattern;
    6. the pattern string, lexically.
  - Return the first one, or `undefined`.

### 5.17 Overlay (`src/overlay/*`)
- **`h.ts`**: a tiny hyperscript `h(doc, tag, props, ...children)` that creates elements with `doc.createElement`, inside the shadow root.
- **`theme.ts`**:
  - `OverlayTheme = { colors?: { feed, item, excluded, pending, part, panelBg, panelFg, accent }; outlineWidth?: string; outlineStyle?: string; fontFamily?: string; fontSize?: string; panelPosition?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'; zIndex?: number }`.
  - `DEFAULT_THEME`: feed `#2563eb`, item `#16a34a`, excluded `#dc2626`, pending `#d97706`, part `#9333ea`, panelBg `#ffffff`, panelFg `#111827`, accent `#2563eb`, outline `2px solid`, font `system-ui, sans-serif` at `13px`, position `top-right`, zIndex `2147483646`.
  - `themeToCss(theme)` produces a `:host { --fd-color-feed: …; … }` block.
- **`styles.ts`** holds the base CSS. It uses **only** the `--fd-*` variables, is scoped to the shadow root, and is followed by `customCss`.
- **`host.ts`**: `mountHost(doc, { theme, customCss })` returns `{ host, root, layer, panel, unmount }`:
  - `host` is a `<div data-feedgrab-overlay>` with `position: fixed; inset: 0; pointer-events: none; z-index: var(--fd-z)` set inline. This is the only node added to the page.
  - The shadow root contains `<style>`, a highlight `layer`, and the `panel` (`pointer-events: auto`).
- **`highlighter.ts`**: `createHighlighter(doc, layer)` with `.set(entries: { el, kind: 'feed' | 'item' | 'excluded' | 'pending' | 'part', label? }[])`, `.refresh()`, and `.destroy()`:
  - it draws a fixed-position box per element from `getBoundingClientRect()`;
  - it refreshes on `scroll` (capture) and `resize`, throttled with the window's `requestAnimationFrame`, and on a `MutationObserver` of the observed containers;
  - it does nothing visible when there is no layout.
- **`picker.ts`**: `pickElement(doc, { filter?, signal? }): Promise<Element>`:
  - `mousemove`/`mouseover` in the capture phase highlight the hovered element (ignoring the overlay host);
  - `click` in the capture phase calls `preventDefault` + `stopPropagation` and resolves;
  - `Escape` or an aborted `signal` rejects with `OVERLAY_CANCELLED`;
  - all listeners are removed on settle.
- **`state.ts`** is a pure reducer: `OverlayState = { proposals: DraftFeed[]; selectedId?: string; pathPattern: string; mode: 'idle' | 'pick-container' | 'pick-item' | 'pick-exclude' | 'pick-include' }`, with `DraftFeed = FeedDescriptor & { accepted: boolean }`. The actions are:
  - `select`, `toggleAccept`, `setContainer`, `setItem`, `addRule`, `removeRule`, `setPathPattern`, `setMode`, `addFeedFromDescriptor`, `removeFeed`.
  - `reduce(state, action)` is immutable. `toProfile(state, url)` = `createProfile` with only the accepted feeds, marked `confirmed: true`.
- **`panel.ts`** renders from the state:
  - a feed list with checkboxes and confidence;
  - a selected-feed editor with container/item inputs and a CSS/XPath toggle, showing the live `validateSelector` count or error (debounced 150 ms);
  - "Pick container", "Pick item", and "Inspect" (`pickElement` → `inspectFromElement`) buttons;
  - a rules editor: add an exclude selector (item/part), add an LLM criteria text, add an include selector, and a list with delete buttons;
  - a path-pattern input;
  - Save and Cancel.
  - The panel re-renders fully on each state change, which is acceptable at this scale.
- **`open-overlay.ts`**: `openOverlay(doc, proposals, opts: OverlayOptions = {}): Promise<SiteProfile>`:
  - `OverlayOptions = { url?: string; existing?: SiteProfile; theme?: OverlayTheme; customCss?: string; llm?: LlmBackend; builtinExclusions?: boolean; signal?: AbortSignal }`.
  - Throws `OVERLAY_NO_LAYOUT` if `!hasLayout(doc)`.
  - **Preview**: for the selected feed, open a transient `openFeed(doc, tempProfile, { live: true, llm, builtinExclusions })` and map item statuses into the highlighter. It is disposed and re-created on every edit, debounced 200 ms.
  - Save resolves with `toProfile`. Cancel, Escape on the panel, or `signal` rejects with `OVERLAY_CANCELLED`.
  - It always unmounts the host and disposes the preview.
- **`index.ts`** (entry) exports `openOverlay`, `pickElement`, `DEFAULT_THEME`, and the types.

### 5.18 Server entry (`src/server.ts`)
- `parseHtml(html, url = 'about:blank')`:
  - `new Window({ url, settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true, disableIframePageLoading: true, disableComputedStyleRendering: true, navigator: { userAgent: 'feedgrab' } } })`. Adapt the setting names to the installed happy-dom version and log the change in NOTES-01.
  - `doc = window.document`, then `doc.write(html)` or `new window.DOMParser().parseFromString(html, 'text/html')`; pick whichever keeps `doc.URL === url`.
  - Tag the document with the parsed symbol (§2.5).
  - If `typeof doc.evaluate !== 'function'` or a probe fails, register the `xpath` engine (`xpath.select(expr, node)`) once.
  - Return the document.
- `disposeDocument(doc)` calls `window.happyDOM.close()` (or the equivalent) and swallows errors.
- It re-exports nothing else. Consumers import the core separately.

### 5.19 Browser bundle (`src/browser.ts`)
- `import * as core from './index'; import * as overlay from './overlay/index'; (globalThis as any).Feedgrab = { ...core, ...overlay, version };`
- `version` comes from `package.json` (JSON import).
- The build replaces `run-model` with the stub (§4.4).

### 5.20 Core public API (`src/index.ts`)
- **Values**:
  - `detectFeeds`, `inspectFromElement`, `detectFromSelector`, `validateSelector`, `matchSelector`;
  - `openFeed`, `removeItem`, `removeParts`;
  - `matchProfile`, `createProfile`, `serializeProfile`, `parseProfile`, `CURRENT_PROFILE_VERSION`;
  - `createLlmProxy`, `registerXPathEngine`, `FeedgrabError`, `BUILTIN_RULES`.
- **Types**: every type from `types.ts` and `llm/contract.ts`.

## 6. Testing strategy

### 6.1 Fixture catalog (`tests/fixtures/`, synthetic, no scripts)
Ground truth is written as attributes that the library ignores. The selector generator never uses `data-fixture-*`, because `STABLE_ATTRS` excludes them. The attributes are:
- `data-fixture-feed="<name>"` on each feed container;
- `data-fixture-item` on each true item;
- `data-fixture-excluded="builtin|user|llm"` on items that should be excluded;
- `data-fixture-part` on parts that should be stripped.

| File | Content | Expectation |
|---|---|---|
| `social-feed.html` | header nav (6 links), sidebar "Trending" list of 5 short links, main `div.timeline` with 12 `article.post` (avatar, author, text, `time` link). Post 4 is `article.post[data-ad-slot]` (builtin). Post 8 is `article.post.promoted` (builtin). Post 10 has a "Sponsored" label only (LLM). Post 6 has an `iframe[src*="doubleclick.net"]` inside (part) | 1 feed (timeline). Nav and trending are not feeds |
| `search-results.html` | `div.ads-top` with 2 ad results, `ol#results > li.result` × 10, pagination | 1 feed (`#results`). The ad block is not a feed, or scores below the main feed |
| `product-grid.html` | filter sidebar of checkboxes, `div.grid > div.css-1q2w3e.card` × 16 with images and prices; card 5 is `div.card.sponsored` | 1 feed. The generated selector avoids hashed classes |
| `blog-list.html` | `main > section.posts > article` × 6 with excerpts; footer with 3 link lists | 1 feed |
| `two-feeds.html` | `section.news > div.story` × 8 and `aside.updates > ul > li.update` × 6 (substantial text) | 2 feeds, unified in document order |
| `nested-feeds.html` | `div.thread > div.comment` × 5, each with nested `div.replies > div.comment` × 3 | The outer feed only (nested suppression) |
| `css-modules.html` | every class hashed (`_post_1x9ab_12` style), with structure only | 1 feed. The selector uses tag/structure or a stable attribute |
| `infinite-base.html` + `infinite-chunk-2.html`, `infinite-chunk-3.html` (fragments of 5 items each) | base `div#stream > div.entry` × 5. Tests append the chunks programmatically | Items are added incrementally |
| `paginated-1.html`, `paginated-2.html` | `ul.list > li.row` × 8 per page. Page 2 repeats one item from page 1 (same permalink) | `ingest` dedupes it: 15 unique |
| `placeholder.html` | `div.feed > div.item` × 4 real + 3 skeleton (`div.item.skeleton` with no text or link) | 4 emitted. Skeletons are emitted once tests fill them |

- Every page has a `<name>.expected.json` file: `{ "feeds": [{ "fixtureFeed": "<name>", "itemCount": n, "excluded": { "builtin": n, "llm": n }, "parts": n }] }`.
- `tests/fixtures/README.md` documents the conventions.

### 6.2 Helpers (`tests/helpers/*`)
- `dom.ts`:
  - `loadFixture(name, url = 'https://fixture.test/' + name)` → `parseHtml(readFileSync(...), url)`;
  - `fixtureTruth(doc)` reads the `data-fixture-*` attributes;
  - `appendFragment(container, html)` uses `createHTMLDocument` and `importNode`.
- `mock-llm.ts`:
  - `fnBackend(handler)` returns an `LlmProxyFn` with scripted responses and records the calls;
  - `mockModel(responses)` wraps the AI SDK `MockLanguageModelV*` from `ai/test`, choosing the version that matches the installed `ai`.
- `snapshot.ts`: `domSnapshot(doc)` = `doc.documentElement.outerHTML`, with the overlay host removed if present. It is used for the read-only invariant.

### 6.3 Unit & integration tests (`bun test tests/unit`)
- One folder per area: `env`, `selector`, `signature`, `detect`, `profile`, `llm`, `exclude`, `feed`, `cleanup`, `overlay` (state reducer and theme only), and `server`.
- **Detection** tests iterate over the fixture catalog and compare against `.expected.json`:
  - the detected container must equal the `[data-fixture-feed]` element;
  - the items must include every `[data-fixture-item]`.
- **Read-only invariant** (`tests/unit/feed/readonly.test.ts`): on every fixture, take `domSnapshot` before and after `detectFeeds` + `openFeed` + iterating + `ingest` + `dispose`, and require them to be identical.

### 6.4 Parity scenarios (`tests/scenarios/*`)
- `scenarios/index.ts` exports `SCENARIOS: { name; fixture; run(api, doc) → Promise<JsonSummary> }[]`. The summary is:
  - the descriptors without `confidence`;
  - the items as `{ id, status, reasonRuleIds, partCount }`.
- `scenarios/run.ts` runs them in Bun against `loadFixture`.
- E2E builds `tests/scenarios/index.ts` into an IIFE (`globalThis.__FD_SCENARIOS__`), injects it after `dist/browser.global.js`, runs the scenario in the page, and `expect`s deep equality with the Bun summary.

### 6.5 E2E (`tests/e2e`, Playwright)
- `playwright.config.ts`:
  - projects `chromium` and `firefox`;
  - `testDir: tests/e2e`;
  - `globalSetup` starts `Bun.serve` on port 4599 (serving `tests/fixtures`) through `serve.ts`. Use a `webServer` command instead if `globalSetup` cannot hold the server open.
- Specs:
  - `parity.spec.ts` (§6.4);
  - `live-scroll.spec.ts`: append the chunks in the page and assert the `item:added` order;
  - `overlay.spec.ts`:
    1. open the overlay;
    2. assert the host and highlights exist;
    3. accept a feed;
    4. add an exclude rule;
    5. save → profile JSON;
    6. the feed DOM is unchanged;
  - `theme.spec.ts`: custom colors show up in the computed style of a highlight box.
- `extension.spec.ts` (Chromium only), see §7.4.

### 6.6 Performance & determinism (`tests/unit/perf/*`)
- **Performance**: in happy-dom, append 50 items in 10 batches of 5 to a live feed, then assert the median `processBatch` time is < 5 ms and the p95 is < 15 ms. Log the timings. Do not fail on CI if `process.env.CI_SLOW` is set.
- **Determinism**: run `detectFeeds` 3 times on each fixture, plus a freshly parsed copy, and require identical `serializeProfile` output.

### 6.7 Live LLM tests (`tests/live/*.live.test.ts`)
- They are skipped unless `FD_LLM_MODEL` is set. They build the model with `createModelFromEnv(allProviders)`.
- `detect.live.test.ts`: `social-feed` with LLM → the timeline feed is still first.
- `classify.live.test.ts`: the "Sponsored" post is excluded, and at least 8 of the 9 normal posts are kept.

### 6.8 Node smoke (`scripts/node-smoke.mjs`)
- `node scripts/node-smoke.mjs` imports `dist/index.js` and `dist/server.js`, then runs `parseHtml` → `detectFeeds` → `openFeed` (`live:false`) on `social-feed.html`. It prints the counts and exits non-zero if no feed is found.

## 7. Example extension (`examples/extension`, WXT)

### 7.1 Setup
- `package.json`: `name: "feedgrab-example-extension"`, `private: true`, deps `wxt` and `feedgrab: workspace:*` (plus the four provider packages for `allProviders`). Scripts: `dev`, `build` (`wxt build`), `build:firefox` (`wxt build -b firefox`), `zip`.
- `wxt.config.ts`:
  - `manifestVersion: 3`;
  - `manifest`: `name: "Feedgrab Example"`, `permissions: ['storage', 'activeTab', 'tabs']`, `host_permissions: ['<all_urls>']`, and `optional_host_permissions: ['http://localhost:11434/*']`;
  - `vite: () => ({ envPrefix: ['WXT_', 'FD_'] })`.
- The library resolves through the workspace's built `dist`, so run the root `bun run build` before building the extension.

### 7.2 Modules
- **`lib/messages.ts`**: a typed message union.
  - `{ type: 'fd:llm', req }` → response `{ ok: true, res } | { ok: false, error }`.
  - `{ type: 'fd:start-detect' }` (popup → content).
  - `{ type: 'fd:profiles-changed' }`.
  - Helpers `sendToBackground` and `sendToTab`.
- **`lib/storage.ts`**: wraps `browser.storage.local`.
  - The key `profiles` holds `string[]` (serialized profiles). The functions are `getProfiles`, `saveProfile` (which replaces a profile with the same hostname + pathPattern), and `deleteProfile`.
  - The key `settings` holds `{ llm?: LlmConfig; theme?: OverlayTheme; enableLlm: boolean }`.
- **`entrypoints/background.ts`**:
  - On `fd:llm`, it builds the model from settings, falling back to `readEnvConfig(import.meta.env)` with `createModel(config, allProviders)`, then answers with `handleLlmRequest`.
  - It caches the model per config hash.
- **`entrypoints/content.ts`** (`matches: ['<all_urls>']`, `runAt: 'document_idle'`):
  1. **On load**: load the profiles, then `matchProfile(location.href)`. If a profile matches, call `openFeed(document, profile, { llm: settings.enableLlm ? createLlmProxy(req => sendToBackground({ type: 'fd:llm', req })) : undefined })`.
  2. **Handle items**: for each item, and on `item:updated`, apply `removeItem(item)` (hide) when the status is `excluded`, and restore when the status returns to `kept`.
  3. **On `fd:start-detect`**:
     - dispose the current feed;
     - run `detectFeeds(document, { llm })`;
     - `openOverlay(document, proposals, { theme: settings.theme, llm, existing })`;
     - `saveProfile`;
     - restart step 1.
  4. **Dev-only E2E hook**: when `import.meta.env.FD_E2E === '1'`, a `window` `message` event with `{ source: 'fd-e2e', type: 'start-detect' }` triggers step 3.
- **`entrypoints/popup/`** (`index.html` + `main.ts`, vanilla):
  - a "Detect feeds on this page" button, which sends `fd:start-detect` to the active tab and closes the popup;
  - the list of profiles for the current host, with Delete;
  - a link to the options page.
- **`entrypoints/options/`** (`index.html` + `main.ts`): a form with:
  - provider (select), model, base URL, API key (password);
  - an enable-LLM checkbox;
  - theme colors (`<input type=color>` for each theme color) plus the panel position;
  - Save writes `settings`.

### 7.3 Build checks
- `bun run --filter feedgrab-example-extension build` produces `examples/extension/.output/chrome-mv3`.
- `build:firefox` produces `.output/firefox-mv3`.

### 7.4 Smoke test (`tests/e2e/extension.spec.ts`, Chromium only)
1. Build with `FD_E2E=1`.
2. Run `chromium.launchPersistentContext('', { channel: 'chromium', headless: true, args: ['--disable-extensions-except=<path>', '--load-extension=<path>'] })`.
3. Open `http://localhost:4599/social-feed.html` and post the E2E message.
4. In the overlay, click Save.
5. Reload, then assert that the builtin-excluded posts get `data-fd-removed="item"` and the other posts don't.
- If headless extension loading is unsupported in the installed Playwright version, use `headless: false` with `xvfb-run` when it is available. Otherwise mark the test `test.skip` with a reason, and log it in NOTES-01.

## 8. CI & documentation
- **`.github/workflows/ci.yml`**: triggered on `push` and `pull_request`. The steps are:
  1. checkout;
  2. `oven-sh/setup-bun@v2`;
  3. `bun install --frozen-lockfile`;
  4. `bun run check`;
  5. `bun run build`;
  6. `node scripts/node-smoke.mjs`;
  7. `bunx playwright install --with-deps chromium firefox`;
  8. `bun run test:e2e`;
  9. the extension `build` and `build:firefox`.
- **README.md** covers:
  - the overview;
  - install (incl. the optional peers);
  - quick starts for the **extension**, **headless** (Playwright `addScriptTag` + `exposeFunction` proxy), and **server** (`parseHtml` + `ingest`) modes;
  - the core concepts (descriptor, profile, statuses);
  - an API reference table;
  - LLM configuration (`.env`, providers, the Ollama `OLLAMA_ORIGINS` note);
  - the overlay theming;
  - the read-only guarantee;
  - development scripts;
  - the license.
- Every public export has JSDoc with a short example where it is useful.

## 9. Definition of done
- All of these pass:
  - `bun run check`;
  - `bun run build` (and `scripts/check-size.ts`);
  - `node scripts/node-smoke.mjs`;
  - `bun run test:e2e` (Chromium + Firefox; the extension smoke on Chromium);
  - the extension `build` and `build:firefox`.
- `bun run test:live` passes or skips cleanly.
- Every task in TASKS-01 is `[x]`, or `[~]` with an entry in NOTES-01.
- SPEC-01 §10 has been updated by T39.
