# TASKS-01: Feed Detector v1 — Task List

Source documents: `spec/SPEC-01.md` (SPEC) and `spec/PLAN-01.md` (PLAN). `L<a>-<b>` means lines a to b, inclusive.

## How to work a task
1. Take the **first unchecked task** (`[ ]`) whose `Depends` are all `[x]` (or `[~]` when the dependency allows partial).
2. Read **only** the cited `Read:` line ranges, e.g. `sed -n '265,292p' spec/PLAN-01.md`. Always apply PLAN L33-41 (code conventions) and L8-32 (rules). Open existing source files only to call or extend them.
3. Create or modify the files listed under `Files:`, following the `Do:` steps. Exported names and signatures must match the cited lines.
4. Run the `Accept:` commands, then `bun run check` (from T01 on). Fix the code until everything is green. Never weaken a test so that it passes.
5. Tick the box (`[ ]` → `[x]`) in this file, then run `git add -A && git commit -m "<Commit line>"` on `main`. The message is one line with no body and no trailers. Never push.

## Auto-mode rules (never stop to ask)
- If something is ambiguous, choose what best fits PLAN, then append `- T<nn>: <decision> — <reason>` to `spec/NOTES-01.md` (create it if missing).
- Never edit `spec/SPEC-01.md` or `spec/PLAN-01.md` (only T39 may), because that would break these line references.
- If a task is blocked (e.g. a network failure after 2 retries), mark it `[~]`, log the reason in NOTES-01, commit with ` (partial)` appended, and continue with the tasks that don't depend on it.
- If an installed library's API differs from PLAN (AI SDK major, happy-dom settings, WXT, Playwright), adapt inside the named module and log it.
- Tests build their DOMs with `parseHtml` or `loadFixture`. They never register a global DOM.

## Index of reference ranges
- SPEC: §1 Goal L5-17 · §2 Principles L19-25 · §3 Runtime modes L27-38 · §4 Terms L40-45 · §5 Workflow L47-53 · §6 Detection L55-68 · §7 Overlay L70-81 · §8 Exclusions L83-95 · §9 Iteration L97-135 · §10 API L137-182 · §11 LLM L184-211 · §12 Deps L213-224 · §13 Non-goals L226-232 · §14 Non-functional L234-245.
- PLAN:
  - §1 L8-41 · §2 Clarifications L42-79 · §3 Architecture L80-144 · §4 Tooling L145-192
  - §5.0 Types L195-208 · §5.1 Env L209-221 · §5.2 Selector eval L222-231 · §5.3 Generation L232-245 · §5.4 Signatures L246-264 · §5.5 Heuristic L265-292 · §5.6 Descriptors L293-311 · §5.7 Skeleton L312-323 · §5.8 Refine L324-337 · §5.9 Rules L338-355 · §5.10 Engine L356-377 · §5.11 Classifier L378-389 · §5.12 Feed L390-445 · §5.13 Ingest L446-457 · §5.14 Cleanup L458-465 · §5.15 LLM L466-503 · §5.16 Profiles L504-530 · §5.17 Overlay L531-568 · §5.18 Server L569-578 · §5.19 Bundle L579-583 · §5.20 Index L584-591
  - §6 Testing L592-670 · §7 Extension L671-724 · §8 CI/docs L725-748 · §9 Done L749-758

---

## Phase A — Setup

- [x] **T01 — Scaffold project, tooling, and install deps**
  - Depends: none
  - Read: PLAN L8-41, L145-178
  - Files: `package.json`, `tsconfig.json`, `biome.json`, `bunfig.toml`, `.gitignore`, `.env.example`, `LICENSE`, `src/index.ts`, `tests/unit/smoke.test.ts`, `spec/NOTES-01.md`
  - Do:
    1. Run `bun init -y` if useful, then write `package.json`:
       - `name: "feed-detector"`, `version: "0.1.0"`, `type: "module"`, `license: "MIT"`, `author: "Fayaz Ahmed"`;
       - `workspaces: ["examples/*"]`;
       - every script from PLAN L166-178 (`check:all` may reference later things).
    2. Install the regular deps: `bun add zod ai @medv/finder xpath`.
    3. Install the dev deps: `bun add -d typescript @biomejs/biome @types/bun happy-dom @ai-sdk/openai-compatible @ai-sdk/openai @ai-sdk/google @openrouter/ai-sdk-provider @playwright/test`.
    4. Add `peerDependencies` (as `>=<installed major>`) and `peerDependenciesMeta` (all `optional: true`) for `happy-dom` and the four provider packages (PLAN L147-152).
    5. Write `tsconfig.json`, `biome.json` (use the `$schema` URL that matches the installed Biome), `bunfig.toml`, `.gitignore`, and `.env.example` as specified in PLAN L153-165. `.env.example` lists the variables from SPEC L192-198 with comments.
    6. Write the MIT `LICENSE` ("Copyright (c) 2026 Fayaz Ahmed"). `src/index.ts` = `export const VERSION = '0.1.0';`. `tests/unit/smoke.test.ts` asserts `VERSION`.
    7. Create `spec/NOTES-01.md` with the heading `# NOTES-01 — implementation decisions log`.
  - Accept: `bun run lint && bun run typecheck && bun run test` all pass. `git status` shows the spec files and the scaffold.
  - Commit: `chore: scaffold project tooling and spec docs (T01)`

- [x] **T02 — Build script, entry stubs, and the exports map**
  - Depends: T01
  - Read: PLAN L133-144, L179-192
  - Files: `scripts/build.ts`, `scripts/check-size.ts`, `tsconfig.build.json`, `package.json` (exports/files/sideEffects), stubs `src/overlay/index.ts`, `src/server.ts`, `src/llm/index.ts`, `src/llm/providers.ts`, `src/llm/run-model.ts`, `src/llm/run-model.stub.ts`, `src/browser.ts`
  - Do:
    1. Create each entry stub with `export {};` (or a placeholder `VERSION` re-export). `run-model.ts` exports `async function runModel(): Promise<never>`, which throws `new Error('not implemented')`. `run-model.stub.ts` has the same signature.
    2. Make `src/browser.ts` assign `globalThis.FeedDetector = { VERSION }`.
    3. Implement `scripts/build.ts` exactly as in PLAN L179-192: the ESM entries with externals read from `package.json` deps and peers; the IIFE bundle with an `onResolve` plugin that maps `/run-model$/` to `run-model.stub.ts`; then `tsc -p tsconfig.build.json`; then the size print.
    4. Implement `scripts/check-size.ts`: fail if `dist/browser.global.js` is larger than 120 KB.
    5. Write the `exports` map, `files`, and `sideEffects` in `package.json` per PLAN L133-144, with types under `dist/types/...`.
  - Accept: `bun run build` produces `dist/index.js`, `dist/overlay/index.js`, `dist/server.js`, `dist/llm/index.js`, `dist/llm/providers.js`, `dist/browser.global.js`, and `dist/types/index.d.ts`. `node -e "import('./dist/index.js').then(m=>console.log(m.VERSION))"` prints `0.1.0`. `bun run scripts/check-size.ts` passes.
  - Commit: `build: add bun build script, entry stubs and exports map (T02)`

- [x] **T03 — Public types and the error class**
  - Depends: T01
  - Read: SPEC L115-125, L137-177; PLAN L43-52, L76, L195-208
  - Files: `src/types.ts`, `src/errors.ts`, `tests/unit/errors.test.ts`
  - Do:
    1. Declare every type listed in PLAN L196-207, plus `LlmBackend` as `LanguageModel | LlmProxyFn`. Use `import type { LanguageModel } from 'ai'`. Define `LlmProxyFn` as a type here; the zod schemas come later in T14.
    2. Shapes:
       - `FeedItem`: SPEC L117-124 plus `connected` and `rescuedBy?`.
       - `Rule`: the optional `id`/`origin` from PLAN L47-52.
       - `UnifiedFeed`: `items()`, `iterate()`, `[Symbol.asyncIterator]`, `on`/`off`/`once`, `ingest`, `dispose`, `readonly profile`.
       - `FeedEvents`: `item:added`, `item:updated` (item, prevStatus), `item:removed`, `feed:lost` ({feedId}), `feed:error` ({feedId?, error}).
    3. In `errors.ts`, write `FeedDetectorError` with the `ErrorCode` union from PLAN L205-206, `name = 'FeedDetectorError'`, and `details`.
    4. Test: `instanceof`, `code`, `details`.
  - Accept: `bun run check`.
  - Commit: `feat(types): add public types and FeedDetectorError (T03)`

- [x] **T04 — Environment utilities (dom, hash, text, timers)**
  - Depends: T03
  - Read: PLAN L33-41, L64-66, L209-221
  - Files: `src/env/dom.ts`, `src/env/hash.ts`, `src/env/text.ts`, `src/env/timers.ts`, `tests/unit/env/*.test.ts`
  - Do:
    1. In `dom.ts`, implement everything listed in PLAN L210-216, plus `PARSED_DOCUMENT = Symbol.for('feed-detector.parsed')` and `isParsedDocument(doc)`.
    2. `hash.ts`: FNV-1a 32-bit → base36, padded to 7 characters.
    3. `text.ts`: `normalizeText` and `textLength`, using `doc.createTreeWalker` and skipping SCRIPT/STYLE.
    4. `timers.ts`: `timers = { setTimeout, clearTimeout, queueMicrotask, now }`, delegating to `globalThis`, plus a test-only `__setTimers(partial)`.
    5. Tests: construct documents with `new Window()` from `happy-dom` directly (`parseHtml` arrives in T05). Cover:
       - `hasLayout` is false in happy-dom;
       - hidden detection;
       - the hash is stable (snapshot known values, e.g. `hashString('abc')`);
       - text normalization skips scripts and truncates.
  - Accept: `bun run check`.
  - Commit: `feat(env): add dom, hash, text and timer utilities (T04)`

- [x] **T05 — Server entry, XPath registry, test helpers, and DOM capability probe**
  - Depends: T04
  - Read: SPEC L34, L38; PLAN L61-66, L222-231 (xpath.ts part), L569-578, L617-626
  - Files: `src/selector/xpath.ts`, `src/server.ts`, `tests/helpers/dom.ts`, `tests/helpers/snapshot.ts`, `tests/unit/server/server.test.ts`, `tests/unit/server/capabilities.test.ts`
  - Do:
    1. `xpath.ts`: `XPathEngine`, `registerXPathEngine`, `getXPathEngine`.
    2. `server.ts`: `parseHtml(html, url)` and `disposeDocument(doc)` per PLAN L569-578. Tag the document with `PARSED_DOCUMENT`. Register the `xpath` package engine when `doc.evaluate` is missing or fails a probe.
    3. Helpers:
       - `loadFixture(name, url?)`, `fixtureTruth(doc)` (returns `{ feeds: Map<name, Element>, items: Element[], excluded: Map<kind, Element[]>, parts: Element[] }`), and `appendFragment(container, html)`;
       - `domSnapshot(doc)`, which removes `[data-feed-detector-overlay]` from a clone.
    4. `capabilities.test.ts` asserts and **logs** the following in a parsed document:
       - `querySelectorAll(':scope > div')` on an element;
       - `:has()`;
       - `createTreeWalker`;
       - `compareDocumentPosition`;
       - the `MutationObserver` on `getWindow(doc)` actually firing;
       - `implementation.createHTMLDocument` + `innerHTML`;
       - XPath through native evaluation or the registered engine.

       For any capability that is missing, write a NOTES-01 entry naming the workaround that later tasks must use (e.g. no `:has()` means item-id uses a manual check), and make the test assert that the workaround path works instead.
  - Accept: `bun run check`. The capability results are recorded in NOTES-01.
  - Commit: `feat(server): add parseHtml, xpath registry and test helpers (T05)`

- [x] **T06 — Synthetic fixture catalog**
  - Depends: T05
  - Read: PLAN L594-616
  - Files: `tests/fixtures/*.html`, `tests/fixtures/*.expected.json`, `tests/fixtures/README.md`, `tests/unit/fixtures.test.ts`
  - Do:
    1. Write every fixture from the table at PLAN L601-612: realistic markup, **no `<script>`**, the ground-truth `data-fixture-*` attributes, and realistic permalinks (`<a href="/post/123"><time>…</time></a>`).
       - The chunk files are fragments of 5 items each, continuing the ids.
       - `paginated-2.html` repeats exactly one permalink from page 1.
    2. Write `<name>.expected.json` per PLAN L614. Fragments don't need one.
    3. `README.md` documents the attribute conventions.
    4. `fixtures.test.ts`: for each expected file, `loadFixture` and check that the counts in the `data-fixture-*` attributes match the JSON, so the fixtures stay internally consistent.
  - Accept: `bun run check`.
  - Commit: `test: add synthetic html fixture catalog (T06)`

## Phase B — Selectors & signatures

- [x] **T07 — Selector evaluation, validateSelector, matchSelector**
  - Depends: T05
  - Read: SPEC L77-81; PLAN L43-46, L222-231
  - Files: `src/selector/evaluate.ts`, `src/selector/match.ts`, `tests/unit/selector/evaluate.test.ts`
  - Do:
    1. `evaluateSelector(sel, context)` handles CSS and XPath (native or through the registry). It returns elements only, and throws `INVALID_SELECTOR` with `details.cause` on a syntax error, or `XPATH_UNSUPPORTED`.
    2. `resolveContainers(doc, d)` and `resolveItems(container, d)`. The latter keeps descendants only.
    3. `validateSelector(doc, sel)` never throws. `matchSelector(doc, sel, { root? })` includes `boxes` only when `hasLayout`.
    4. Tests on `social-feed`: CSS, relative `:scope >` paths, XPath (`.//article`), an invalid CSS selector, an invalid XPath, and `boxes` absent in happy-dom.
  - Accept: `bun run check`.
  - Commit: `feat(selector): add css/xpath evaluation and selector validation (T07)`

- [x] **T08 — Stable classes and structural signatures**
  - Depends: T04
  - Read: SPEC L57; PLAN L246-264
  - Files: `src/signature/classes.ts`, `src/signature/signature.ts`, `tests/unit/signature/*.test.ts`
  - Do:
    1. Implement `isStableToken`, `isStableClass`, and `stableClasses` with the exact regexes from PLAN L247-256.
    2. Implement `sigL1`, `shape`, `sigL2`, `classSimilarity`, `isSameKind(a, b)`, and `dominantSignature` per PLAN L257-263.
    3. Tests:
       - a table of class names. Stable: `post`, `card`, `result`, `story-item`. Unstable: `css-1q2w3e`, `sc-AxjAm`, `_post_1x9ab_12`, `md:flex`, `is-active`, `jsx-123456`, `a1b2c3d`.
       - "same kind" behavior on `product-grid` (the sponsored card is still the same kind as a normal card) and on `css-modules`.
  - Accept: `bun run check`.
  - Commit: `feat(signature): add stable class filter and structural signatures (T08)`

- [x] **T09 — Selector generation (container + item)**
  - Depends: T07, T08
  - Read: PLAN L43-46, L232-245
  - Files: `src/selector/generate.ts`, `tests/unit/selector/generate.test.ts`
  - Do:
    1. `containerSelector(el)`: a stable unique id first, then `finder` with **`root: el.ownerDocument.body`** and the options from PLAN L234-236, then the `buildPathSelector` fallback.
    2. `itemSelector(container, items)` with the S1/S2 rule and the wrapper case (PLAN L238-242). `cssEscape` is implemented locally.
    3. Tests over every fixture with a `data-fixture-feed`:
       - `containerSelector(truthContainer)` resolves to exactly that element;
       - `itemSelector`, evaluated relative to the container, covers every `data-fixture-item`;
       - the generated selectors never contain hashed classes (`product-grid`, `css-modules`) or `data-fixture`.
  - Accept: `bun run check`.
  - Commit: `feat(selector): generate robust container and item selectors (T09)`

## Phase C — Detection

- [x] **T10 — Heuristic candidate discovery and scoring**
  - Depends: T08, T06
  - Read: SPEC L55-63; PLAN L265-292
  - Files: `src/detect/candidate.ts`, `src/detect/score.ts`, `src/detect/heuristic.ts`, `tests/unit/detect/heuristic.test.ts`
  - Do:
    1. `candidate.ts` holds the `Features` and `Candidate` types and the grouping helper (group by `sigL1`, then merge "same kind" groups).
    2. `score.ts` exports the `WEIGHTS`, `THRESHOLD = 0.45`, and `NAV_SELECTOR` constants, plus `computeFeatures(c, doc)` and `scoreFeatures(f, hasLayout)`, exactly as in PLAN L274-288.
    3. `heuristic.ts`: `findCandidates(doc, { minItems = 3, threshold, topK = 10 })`, covering the walk, the wrapper skip, nested suppression, and deterministic sorting (PLAN L267-292).
    4. Tests: for each fixture's expected JSON, the expected feed containers are present among the candidates, and the top candidate is the main feed.
       - `nested-feeds`: no candidate for the inner replies.
       - `social-feed`: nav and trending score below the threshold.
       - `two-feeds`: both feeds pass.
    5. If the fixtures fail, tune **only** the constants in `score.ts`, and log the final values and the reason in NOTES-01.
  - Accept: `bun run check`.
  - Commit: `feat(detect): add heuristic feed candidate discovery and scoring (T10)`

- [x] **T11 — Descriptors, detectFeeds (heuristic), inspectFromElement, detectFromSelector**
  - Depends: T09, T10
  - Read: SPEC L47-53, L74, L139-143; PLAN L43-52, L293-311
  - Files: `src/detect/descriptor.ts`, `src/detect/detect.ts`, `src/detect/inspect.ts`, `src/index.ts`, `tests/unit/detect/detect.test.ts`, `tests/unit/detect/inspect.test.ts`
  - Do:
    1. `descriptorFromCandidate(c, source)`, with ids `fd_<hash>` (PLAN L294-297).
    2. `detectFeeds(doc, opts)` with the `DetectOptions` from PLAN L299. Leave a clear seam, `if (opts.llm) return refine(...)`, for T17. For now it ignores `llm`.
    3. `inspectFromElement(el, { minItems = 2 })` and `detectFromSelector(doc, input)` per PLAN L303-311, with the error codes `NO_REPEATING_ANCESTOR` and `NO_MATCH`.
    4. Export these, `validateSelector`, and `matchSelector` from `src/index.ts`.
    5. Tests:
       - `detectFeeds` on each fixture: the first descriptor's container resolves to the truth container, and its items cover the truth items;
       - inspect from a deep element (the `time` inside post 3) returns the timeline;
       - `detectFromSelector` in all three input forms;
       - `confirmed` is false, and ids are deterministic.
  - Accept: `bun run check`.
  - Commit: `feat(detect): add detectFeeds, inspectFromElement and detectFromSelector (T11)`

## Phase D — Profiles

- [x] **T12 — Profile schema, normalization, serialize/parse, and migrations**
  - Depends: T03, T04
  - Read: SPEC L45, L148-151, L173-175; PLAN L47-52, L350, L504-515
  - Files: `src/profile/schema.ts`, `src/profile/normalize.ts`, `src/profile/migrate.ts`, `src/profile/profile.ts`, `src/index.ts`, `tests/unit/profile/profile.test.ts`
  - Do:
    1. Write the zod schemas from PLAN L505, with `CURRENT_PROFILE_VERSION = 1`. Only `selector` rules are valid inside `include`.
    2. `normalizeRule(rule)`: `id = 'r_' + hashString(stableJson(ruleWithoutId))`, `origin` defaults to `'user'`. Also add the `stableJson` helper (recursively sorted keys).
    3. `migrate`, `createProfile`, `serializeProfile`, and `parseProfile` per PLAN L506-515, with the errors `INVALID_PROFILE` and `UNSUPPORTED_PROFILE_VERSION`.
    4. Export them from `src/index.ts`.
    5. Tests:
       - round-trip;
       - the key order is stable;
       - rule ids are filled deterministically;
       - an invalid profile → `INVALID_PROFILE` with issues;
       - `version: 99` → `UNSUPPORTED_PROFILE_VERSION`.
  - Accept: `bun run check`.
  - Commit: `feat(profile): add site profile schema, serialization and migrations (T12)`

- [x] **T13 — matchProfile with hostname and path-pattern specificity**
  - Depends: T12
  - Read: SPEC L45, L50; PLAN L516-530
  - Files: `src/profile/match.ts`, `src/index.ts`, `tests/unit/profile/match.test.ts`
  - Do:
    1. Implement glob matching (`*`, `**`, and `*` within a segment), ignoring the query, hash, and trailing slash.
    2. Implement host matching: exact (incl. port) and `*.domain` (subdomains only).
    3. Implement the 6-key specificity ordering (PLAN L522-528).
    4. Tests:
       - `/search/*` vs `/**` vs the exact `/search/foo` → the exact pattern wins;
       - `*.example.com` vs `www.example.com`;
       - no match → `undefined`;
       - ties are resolved lexically.
  - Accept: `bun run check`.
  - Commit: `feat(profile): add matchProfile with url pattern specificity (T13)`

## Phase E — LLM

- [x] **T14 — LLM contracts, proxy, and backend resolution**
  - Depends: T03
  - Read: SPEC L32-33, L165-166, L176, L203-207; PLAN L53-60, L77, L466-478
  - Files: `src/llm/contract.ts`, `src/llm/proxy.ts`, `src/llm/backend.ts`, `src/index.ts`, `tests/unit/llm/proxy.test.ts`
  - Do:
    1. zod schemas for `DetectRequest`, `ClassifyRequest`, `LlmRequest` (discriminated on `task`), `DetectResponse`, `ClassifyResponse`, and `responseSchemaFor(task)`. Shapes are at PLAN L324-337 (detect) and L378-389 (classify): read L325-326 and L385-386 only.
    2. Move the `LlmProxyFn` type in `src/types.ts` so it derives from the contract types.
    3. `createLlmProxy(send)` and `isLanguageModel(x)` per PLAN L472-474.
    4. `resolveBackend(b)` (PLAN L475-477): a function → validate its response; a model → `await import('./run-model')`.
    5. Export `createLlmProxy` from `src/index.ts`.
    6. Tests:
       - a valid round trip;
       - an invalid response → `LLM_INVALID_RESPONSE`;
       - the abort signal is passed through;
       - `isLanguageModel` on a fake model object.
  - Accept: `bun run check`.
  - Commit: `feat(llm): add request/response contracts, proxy and backend resolution (T14)`

- [x] **T15 — Structured-output adapter, prompts, handleLlmRequest, and the llm entry**
  - Depends: T14
  - Read: SPEC L184-191; PLAN L478-489, L617-626 (mock-llm part)
  - Files: `src/llm/structured.ts`, `src/llm/prompts.ts`, `src/llm/run-model.ts`, `src/llm/index.ts`, `tests/helpers/mock-llm.ts`, `tests/unit/llm/handle.test.ts`
  - Do:
    1. Check the installed `ai` major (`bun pm ls ai`) and use its recommended structured-output API (PLAN L483-486), with `temperature: 0` and **one** repair retry. Log the API choice in NOTES-01.
    2. `prompts.ts`: use the system texts from PLAN L480-482 verbatim. Embed the items as `<item id="…">…</item>`.
    3. `handleLlmRequest(req: unknown, model, opts?)`: parse it (`LLM_BAD_REQUEST`), dispatch on `task`, and return JSON. `run-model.ts` re-exports it as `runModel`.
    4. `llm/index.ts` exports `handleLlmRequest` and the contract types. `createModel` and the rest come in T16.
    5. `mock-llm.ts`: `fnBackend(handler)` (records calls) and `mockModel(responses)`, which uses the `ai/test` mock model for the installed version.
    6. Tests:
       - classify and detect through `mockModel`;
       - an invalid output → one retry, then `LLM_INVALID_RESPONSE`;
       - a bad request → `LLM_BAD_REQUEST`.
  - Accept: `bun run check`.
  - Commit: `feat(llm): add structured output adapter, prompts and handleLlmRequest (T15)`

- [x] **T16 — LLM config from env, createModel (DI), and the providers entry**
  - Depends: T15
  - Read: SPEC L192-202; PLAN L53-60, L490-503
  - Files: `src/llm/config.ts`, `src/llm/models.ts`, `src/llm/providers.ts`, `src/llm/index.ts`, `.env.example`, `tests/unit/llm/config.test.ts`
  - Do:
    1. `LlmConfig` zod schema. `readEnvConfig(env?)` takes the default env from `globalThis.process?.env` and applies the default base URLs (PLAN L490-493).
    2. `ProviderFactories` (type-only imports), `createModel(config, providers)`, and `createModelFromEnv(providers, env?)` per PLAN L494-501. The `LLM_PROVIDER_MISSING` message names the package to install.
    3. `providers.ts`: `allProviders` with static imports.
    4. Export everything from `llm/index.ts`. Update `.env.example` comments if needed.
    5. Tests:
       - env parsing: unset model → null; bad provider → `LLM_CONFIG`; the Ollama default URL;
       - `createModel` with stub factories records its arguments;
       - a missing factory → `LLM_PROVIDER_MISSING`;
       - `allProviders` has 4 functions.
  - Accept: `bun run check`, then `bun run build`.
  - Commit: `feat(llm): add env config, createModel with injected providers (T16)`

- [x] **T17 — DOM skeleton builder and LLM refine in detectFeeds**
  - Depends: T11, T14
  - Read: SPEC L65-68, L211; PLAN L298-301, L312-337
  - Files: `src/detect/skeleton.ts`, `src/detect/llm-refine.ts`, `src/detect/detect.ts`, `tests/unit/detect/skeleton.test.ts`, `tests/unit/detect/llm-refine.test.ts`
  - Do:
    1. `buildSkeleton(candidates, opts)` per PLAN L312-323, including an outlier sample and the `maxChars` truncation.
    2. `refineWithLlm(doc, candidates, backend, opts)`:
       - send a request for the top `llmTopK` candidates;
       - validate the response (PLAN L327-331), merge (PLAN L332-336), and fall back on errors through `onLlmError`;
       - LLM exclusions become rules with `origin: 'llm'`.
    3. Wire it into `detectFeeds` through `resolveBackend`.
    4. Tests use `fnBackend`:
       - the skeleton has no full HTML, respects the budget, and is deterministic;
       - the LLM refines the item selector → `source: 'llm'` with the blended confidence;
       - an invalid container is dropped;
       - an invalid exclusion is dropped while the feed is kept;
       - the backend throws → the heuristic result is returned and `onLlmError` is called.
  - Accept: `bun run check`.
  - Commit: `feat(detect): add dom skeleton and llm refinement pass (T17)`

## Phase F — Exclusions

- [x] **T18 — Built-in rules, specificity, and selector rule matching**
  - Depends: T07, T12
  - Read: SPEC L84-90, L94; PLAN L67-70, L338-355
  - Files: `src/exclude/builtin.ts`, `src/exclude/specificity.ts`, `src/exclude/rules.ts`, `src/index.ts` (export `BUILTIN_RULES`), `tests/unit/exclude/rules.test.ts`
  - Do:
    1. `BUILTIN_RULES`, with the exact selectors from PLAN L339-344.
    2. `cssSpecificity` (selector lists take the max; `:is`/`:not`/`:has` count as their most specific argument; `:where` = 0), `xpathSpecificity`, and `compareSpecificity`.
    3. `matchSelectorRule(item, rule)` and `matchBuiltin(item, rule)` per PLAN L351-354, importing `normalizeRule` from `src/profile/normalize.ts`.
    4. Tests:
       - specificity table: `#a` > `.a.b` > `.a` > `div`, and `:where(.a)` = `[0,0,0]`;
       - on `social-feed`: post 4 is an item-match for `b_data_ad`, post 6's iframe is a part, post 8 is an item-match for `b_ad_class`.
  - Accept: `bun run check`.
  - Commit: `feat(exclude): add builtin rules, specificity and selector rule matching (T18)`

- [x] **T19 — Exclusion engine (precedence, includes, parts, reasons)**
  - Depends: T18
  - Read: SPEC L83-95; PLAN L356-377
  - Files: `src/exclude/engine.ts`, `tests/unit/exclude/engine.test.ts`
  - Do:
    1. `evaluateItem(item, ctx)`, following steps 1–6 at PLAN L357-377 exactly: rank by origin, compare specificity, include rescue, the pending/`needsLlm` logic, parts deduped in document order, and reasons sorted.
    2. Tests, as a table of scenarios:
       - a builtin exclude is beaten by a user include → kept with `rescuedBy`;
       - a user exclude `.post.promoted` vs a user include `.post` → excluded (higher specificity);
       - an equal-specificity include beats an exclude;
       - the signature outlier;
       - with an `llm-text` rule and no verdict → `pending` and `needsLlm`;
       - an exclude verdict → excluded with the criteria and confidence;
       - parts plus an include that rescues a part.
  - Accept: `bun run check`.
  - Commit: `feat(exclude): add exclusion engine with precedence and include rescue (T19)`

- [x] **T20 — LLM text classifier (batching, cache, abort, retry)**
  - Depends: T14, T04
  - Read: SPEC L91-93; PLAN L378-389
  - Files: `src/exclude/llm-classifier.ts`, `tests/unit/exclude/llm-classifier.test.ts`
  - Do:
    1. `LlmClassifier` with the API and defaults from PLAN L379-389. Use `timers` from `env/timers.ts` so that tests can drive time.
    2. Implement an LRU of 5000 entries keyed by `hash(text):hash(criteria)`, and truncate texts to 600 characters.
    3. Tests with `fnBackend`:
       - 25 enqueued items → batches of 10/10/5, with at most 2 concurrent;
       - the delay flush after 250 ms;
       - a cache hit makes no new request;
       - the confidence threshold;
       - failure → one retry → verdict `{ exclude: false, error: true }` and `onError` called;
       - `dispose()` aborts in-flight requests (the signal is aborted).
  - Accept: `bun run check`.
  - Commit: `feat(exclude): add batched llm text classifier with cache (T20)`

## Phase G — Unified feed

- [x] **T21 — Feed primitives (item id, emitter, async queue, registry, FeedItemImpl)**
  - Depends: T04, T03
  - Read: SPEC L103, L112; PLAN L71, L390-405
  - Files: `src/feed/item-id.ts`, `src/feed/emitter.ts`, `src/feed/async-queue.ts`, `src/feed/registry.ts`, `src/feed/feed-item.ts`, `tests/unit/feed/primitives.test.ts`
  - Do:
    1. `itemId(el, baseUrl, minItemTextLength)` per PLAN L392-400. Use the NOTES-01 capability workaround if `:has()` is missing. Use `globalThis.URL`, strip the tracking params, and sort the query.
    2. `Emitter` (a listener error → `feed:error`, no recursion), `AsyncQueue` (`push`, `close`, `drainThenClose`, async iterator), and `ItemRegistry` (binary insertion by `(docSeq, compareDocumentPosition)`).
    3. `FeedItemImpl`: the public fields, an internal symbol state (removal handles, last evaluation), and a cached `text()`.
    4. Tests:
       - the same permalink with different `utm_*`/hash → same id;
       - a text fallback;
       - a placeholder → `null`;
       - emitter unsubscribe and error routing;
       - queue ordering, close, and drain;
       - registry order across two documents.
  - Accept: `bun run check`.
  - Commit: `feat(feed): add item ids, emitter, async queue and registry (T21)`

- [x] **T22 — openFeed core (initial scan, evaluation, snapshot, iteration, dispose)**
  - Depends: T21, T19, T12
  - Read: SPEC L97-113, L154; PLAN L64-66, L406-428
  - Files: `src/feed/unified-feed.ts`, `src/index.ts`, `tests/unit/feed/open-feed.test.ts`
  - Do:
    1. Implement `openFeed(doc, profile, opts)` with the `FeedOptions` defaults (PLAN L407):
       - the initial scan with dedupe and `dominantSig` per descriptor;
       - `evaluateItem` (builtins on by default);
       - events emitted in a microtask;
       - `feed:lost` for a descriptor with no container.
    2. `items(opts)`, `iterate(opts)`, and `[Symbol.asyncIterator]`, with per-iterator dedupe and the status filter. `live:false` uses `drainThenClose`. Observation (T23), ingest (T24), and LLM (T25) are stubs for now: `ingest` throws `new Error('not implemented')` until T24.
    3. `dispose({ restore })`: idempotent, and later calls throw `DISPOSED`.
    4. Tests on `social-feed` (parsed → `live:false`):
       - the item count, order, and statuses match the fixture truth for builtins (posts 4 and 8 excluded, post 6 has 1 part);
       - the `two-feeds` unified order is document order;
       - `for await` ends for `live:false`;
       - the status filter `excluded` yields 2;
       - events fire after `openFeed` returns;
       - the no-container descriptor → `feed:lost`.
  - Accept: `bun run check`.
  - Commit: `feat(feed): add openFeed with unified ordering, iteration and dispose (T22)`

- [x] **T23 — Live observation (MutationObserver, re-attach dedupe, re-mount, feed:lost, placeholders)**
  - Depends: T22
  - Read: SPEC L100-101, L109-112; PLAN L71, L129-132, L429-440
  - Files: `src/feed/observer.ts`, `src/feed/unified-feed.ts`, `tests/unit/feed/observer.test.ts`
  - Do:
    1. `FeedObserver` per PLAN L429-440: microtask-coalesced `processBatch`, add/re-attach/remove, placeholder re-checks, subtree change re-evaluation, and a re-mount watcher with `lostTimeoutMs`. Record the batch durations (an internal `stats` array) for T37.
    2. It is enabled when `live` is true and `getWindow(doc)?.MutationObserver` exists. Tests force `live: true` on parsed documents.
    3. Tests (happy-dom, `live: true`):
       - append `infinite-chunk-2` → 5 `item:added` in order, and a live iterator yields them;
       - remove and re-insert a clone of an item → `item:removed`, then `item:updated` (not added), and the iterator does not yield it again;
       - fill the `placeholder.html` skeletons with text → they are emitted;
       - replace the whole container (re-mount) → items continue with no `feed:lost`;
       - remove the container permanently → `feed:lost` after the timeout (use a short `lostTimeoutMs`).
  - Accept: `bun run check`.
  - Commit: `feat(feed): observe live dom for new, removed and remounted items (T23)`

- [x] **T24 — Ingest follow-up documents (pagination / load-more)**
  - Depends: T22
  - Read: SPEC L34, L102-104, L155; PLAN L446-457
  - Files: `src/feed/ingest.ts`, `src/feed/unified-feed.ts`, `tests/unit/feed/ingest.test.ts`
  - Do:
    1. `toDocument(mainDoc, input)` uses `mainDoc.implementation.createHTMLDocument`.
    2. `feed.ingest(input, { url })`: `docSeq` increments, `sourceUrl` is set, ids are deduped across documents, items are evaluated, and `item:added` fires. It returns the new items.
    3. Tests:
       - `paginated-1` + ingest of the `paginated-2` HTML string → 15 unique items, with page-2 items after page-1 items and `sourceUrl` set;
       - ingesting a `Document` works too;
       - a `live:false` iterator started before the ingest yields the ingested items, provided they arrive before it drains;
       - ingest after `dispose` throws `DISPOSED`.
  - Accept: `bun run check`.
  - Commit: `feat(feed): add ingest for paginated and load-more documents (T24)`

- [x] **T25 — LLM text rules in the feed (pending → kept/excluded)**
  - Depends: T20, T22
  - Read: SPEC L91-93, L109-112; PLAN L441-445
  - Files: `src/feed/unified-feed.ts`, `tests/unit/feed/llm-feed.test.ts`
  - Do:
    1. With `opts.llm` and a descriptor containing `llm-text` rules: create an `LlmClassifier` through `resolveBackend`, enqueue the items whose evaluation `needsLlm`, and re-evaluate on results, emitting `item:updated`. Never enqueue an item that has `rescuedBy`.
    2. Classifier errors → `feed:error`. The affected items become `kept`.
    3. `dispose` aborts the classifier.
    4. Tests with `fnBackend` on `social-feed` plus the rule `{ kind: 'llm-text', criteria: 'sponsored posts' }`:
       - non-builtin items start as `pending`;
       - after the mock responds, post 10 becomes `excluded` with an `llm-text` reason, and the rest become `kept`;
       - an iterator with `status: 'excluded'` and `includePending: false` yields post 10 once;
       - the error path;
       - no LLM call is made for builtin-excluded items.
  - Accept: `bun run check`.
  - Commit: `feat(feed): classify items with llm text rules and emit status updates (T25)`

- [x] **T26 — Removal helpers, dispose restore, and the read-only invariant**
  - Depends: T22, T24
  - Read: SPEC L20, L38, L127-135, L245; PLAN L76, L458-465, L627-633
  - Files: `src/cleanup/remove.ts`, `src/feed/unified-feed.ts` (`dispose` restore), `src/index.ts`, `tests/unit/cleanup/remove.test.ts`, `tests/unit/feed/readonly.test.ts`
  - Do:
    1. `removeItem` and `removeParts` with the `hide` and `detach` modes, `restore(): boolean`, idempotence, and handles recorded on the item (PLAN L458-465).
    2. `dispose({ restore: true })` restores every recorded handle.
    3. Export them from `src/index.ts`.
    4. Tests:
       - hide → `display: none !important` and `data-fd-removed`; restore reinstates the previous inline display;
       - detach and restore puts the item back at the same position;
       - a second remove returns the same handle;
       - `dispose({ restore: true })` brings everything back.
    5. `readonly.test.ts`: for **every** fixture, the `domSnapshot` before and after `detectFeeds` + `openFeed` + a full iteration + ingest (paginated) + `dispose` must be identical (PLAN L631-633).
  - Accept: `bun run check`.
  - Commit: `feat(cleanup): add removal helpers with restore and read-only invariant test (T26)`

## Phase H — Overlay

- [x] **T27 — Overlay host, theme, styles, highlighter, and picker**
  - Depends: T07
  - Read: SPEC L21, L71-76; PLAN L72-75, L129-132, L531-549
  - Files: `src/overlay/h.ts`, `src/overlay/theme.ts`, `src/overlay/styles.ts`, `src/overlay/host.ts`, `src/overlay/highlighter.ts`, `src/overlay/picker.ts`, `tests/unit/overlay/theme.test.ts`, `tests/unit/overlay/picker.test.ts`
  - Do:
    1. `h()`; `OverlayTheme`, `DEFAULT_THEME` (exact values from PLAN L533-536), and `themeToCss`; base CSS that uses only `--fd-*` variables.
    2. `mountHost`, with one host `div` that has an open shadow root, plus `unmount`.
    3. `createHighlighter`, using a rAF-throttled refresh from `getWindow(doc)`. It is a no-op when there is no layout.
    4. `pickElement` with capture-phase listeners, `Escape`/`signal` → `OVERLAY_CANCELLED`, and listener cleanup.
    5. Tests (happy-dom):
       - `themeToCss` merges partial themes;
       - `mountHost` adds exactly one node to the page and `unmount` removes it;
       - `pickElement` resolves on a dispatched click on a fixture element and rejects on an `Escape` keydown;
       - the page DOM is otherwise unchanged (`domSnapshot`).
  - Accept: `bun run check`.
  - Commit: `feat(overlay): add shadow host, theming, highlighter and element picker (T27)`

- [ ] **T28 — Overlay state reducer**
  - Depends: T12
  - Read: SPEC L74-75; PLAN L550-552
  - Files: `src/overlay/state.ts`, `tests/unit/overlay/state.test.ts`
  - Do:
    1. `OverlayState`, `DraftFeed`, the `Action` union (all 10 actions from PLAN L551), `initState(proposals, { url, existing? })` (pre-accepts the existing profile's feeds; `pathPattern` comes from `existing` or the URL path), the immutable `reduce`, and `toProfile(state, url)`.
    2. Tests: every action; immutability (`Object.freeze` the input); `toProfile` contains only the accepted feeds, with `confirmed: true` and normalized rule ids.
  - Accept: `bun run check`.
  - Commit: `feat(overlay): add pure overlay state reducer (T28)`

- [ ] **T29 — Overlay panel UI and openOverlay flow**
  - Depends: T27, T28, T11, T22
  - Read: SPEC L49, L70-81, L146; PLAN L553-568
  - Files: `src/overlay/panel.ts`, `src/overlay/open-overlay.ts`, `src/overlay/index.ts`, `tests/unit/overlay/panel.test.ts`, `tests/unit/overlay/open-overlay.test.ts`
  - Do:
    1. `renderPanel(root, state, dispatch, deps)` with every control from PLAN L553-560. Debounce the live `validateSelector` count by 150 ms. Pick buttons call `pickElement`, and Inspect calls `inspectFromElement`. Use stable `data-fd-action` attributes on controls so E2E tests can target them.
    2. `openOverlay(doc, proposals, opts)` per PLAN L561-566:
       - it guards with `OVERLAY_NO_LAYOUT`;
       - the preview through a transient `openFeed` (debounced 200 ms) feeds the highlighter;
       - Save resolves with `toProfile`; Cancel, Escape, or `signal` reject with `OVERLAY_CANCELLED`;
       - it always cleans up.
    3. `overlay/index.ts` exports `openOverlay`, `pickElement`, `DEFAULT_THEME`, and the types.
    4. Tests (happy-dom):
       - `renderPanel` into a detached div: the controls exist, typing a selector updates the count after the debounce, and toggling accept dispatches an action;
       - `openOverlay` rejects with `OVERLAY_NO_LAYOUT` in happy-dom.

       The full flow is covered by E2E in T32.
  - Accept: `bun run check`, then `bun run build`.
  - Commit: `feat(overlay): add overlay panel and openOverlay confirm/edit flow (T29)`

## Phase I — Browser bundle & E2E

- [ ] **T30 — Browser IIFE bundle and public API completeness**
  - Depends: T29, T26, T25, T24, T23, T17, T13, T16
  - Read: SPEC L33, L178-182; PLAN L77, L179-192, L579-591
  - Files: `src/browser.ts`, `src/index.ts`, `scripts/build.ts` (if needed), `tests/unit/api.test.ts`
  - Do:
    1. `src/browser.ts` per PLAN L579-583, with `version` taken from `package.json`.
    2. Make sure `src/index.ts` exports exactly the list at PLAN L584-591.
    3. `api.test.ts`:
       - check the value exports of `feed-detector` (core) against the list;
       - `feed-detector/llm` exports `handleLlmRequest`, `createModel`, `createModelFromEnv`, and `readEnvConfig`;
       - `feed-detector/server` exports `parseHtml` and `disposeDocument`;
       - `feed-detector/overlay` exports `openOverlay`, `pickElement`, and `DEFAULT_THEME`.
    4. Build, and confirm the IIFE contains the stub: grep the bundle for `LLM_MODEL_UNSUPPORTED_IN_BUNDLE`, and confirm it has no `generateObject`/`generateText` code from `ai`.
  - Accept: `bun run check && bun run build && bun run scripts/check-size.ts`. Also `grep -q LLM_MODEL_UNSUPPORTED_IN_BUNDLE dist/browser.global.js`.
  - Commit: `feat(browser): add iife bundle exposing FeedDetector global (T30)`

- [ ] **T31 — Playwright setup, parity scenarios, and live-scroll E2E**
  - Depends: T30
  - Read: SPEC L239-244; PLAN L634-648
  - Files: `playwright.config.ts`, `tests/e2e/serve.ts`, `tests/e2e/global-setup.ts`, `tests/scenarios/index.ts`, `tests/scenarios/run.ts`, `tests/scenarios/build.ts`, `tests/e2e/parity.spec.ts`, `tests/e2e/live-scroll.spec.ts`, `tests/unit/scenarios.test.ts`
  - Do:
    1. Run `bunx playwright install chromium firefox` (and `--with-deps` if the system libs are missing; retry twice).
    2. `serve.ts` serves `tests/fixtures` on port 4599. In `playwright.config.ts`, prefer the `webServer: { command: 'bun tests/e2e/serve.ts', port: 4599 }` form, with projects `chromium` and `firefox`.
    3. Scenarios (PLAN L634-640): at least `detect-social`, `feed-two-feeds`, `feed-search`, and `ingest-paginated`. Each returns a JSON summary without confidence. `tests/scenarios/build.ts` bundles them to `dist-test/scenarios.global.js` (IIFE, global `__FD_SCENARIOS__`, taking the API from `globalThis.FeedDetector`). Add `dist-test` to `.gitignore`.
    4. `tests/unit/scenarios.test.ts` runs the scenarios in Bun and writes their summaries to `dist-test/bun-summaries.json`.
    5. `parity.spec.ts`:
       - build the scenarios and load the Bun summaries;
       - for each scenario, open the fixture URL, add the `dist/browser.global.js` and scenario bundle script tags, run it in the page, and assert deep equality.
    6. `live-scroll.spec.ts`: `openFeed` live in the page; append chunk 2 via `page.evaluate`; assert 5 new items in order, and that the DOM is unchanged apart from the appended chunk.
    7. Update the `test:e2e` script to build the scenarios and run the unit scenarios first.
  - Accept: `bun run test:e2e` passes on Chromium and Firefox.
  - Commit: `test(e2e): add playwright parity and live scroll tests (T31)`

- [ ] **T32 — Overlay and theme E2E**
  - Depends: T31
  - Read: SPEC L70-76; PLAN L553-566, L649-656
  - Files: `tests/e2e/overlay.spec.ts`, `tests/e2e/theme.spec.ts`
  - Do:
    1. `overlay.spec.ts` on `social-feed`:
       - in the page, `const proposals = await FeedDetector.detectFeeds(document)`, then start `openOverlay` and keep the promise on `window`;
       - assert the host exists and highlight boxes are drawn;
       - use the `data-fd-action` controls to accept the first feed, add the exclude selector `.post.promoted` (scope item), and Save;
       - the resolved profile JSON has 1 feed, `confirmed: true`, and the rule present;
       - `domSnapshot` before = after (excluding the host);
       - Cancel rejects with `OVERLAY_CANCELLED`.
    2. `theme.spec.ts`: `theme.colors.item = '#ff00ff'` → the computed outline color of an item highlight box is `rgb(255, 0, 255)`, and `customCss` is applied.
  - Accept: `bun run test:e2e`.
  - Commit: `test(e2e): add overlay flow and theming e2e tests (T32)`

## Phase J — Example extension

- [ ] **T33 — WXT example scaffold, message/storage libs, background proxy, content script**
  - Depends: T30
  - Read: SPEC L203-210; PLAN L671-702
  - Files: `examples/extension/package.json`, `examples/extension/wxt.config.ts`, `examples/extension/tsconfig.json`, `examples/extension/lib/messages.ts`, `examples/extension/lib/storage.ts`, `examples/extension/entrypoints/background.ts`, `examples/extension/entrypoints/content.ts`, root `biome.json` and `tsconfig.json` (exclude the generated dirs)
  - Do:
    1. Scaffold per PLAN L673-680, then run `bun install` at the root (workspace link). Use WXT's `browser` import from `wxt/browser`.
    2. `messages.ts` and `storage.ts` per PLAN L682-689.
    3. `background.ts` per PLAN L690-692: model from settings, else `readEnvConfig(import.meta.env)`; `createModel(config, allProviders)`; a model cache; reply with `handleLlmRequest`.
    4. `content.ts` per PLAN L693-702, including the `FD_E2E` dev hook. Items are hidden with `removeItem` when excluded, and restored when the status changes back.
    5. Make sure root `bun run check` ignores `examples/extension/.output` and `.wxt`. The example has its own `tsconfig` that extends `.wxt/tsconfig.json`.
  - Accept: `bun run build && bun run --filter feed-detector-example-extension build` produces `examples/extension/.output/chrome-mv3/manifest.json`. `bun run check` passes.
  - Commit: `feat(example): add wxt example extension with background llm proxy and content script (T33)`

- [ ] **T34 — Example popup, options page, overlay flow, and Firefox build**
  - Depends: T33
  - Read: PLAN L703-716
  - Files: `examples/extension/entrypoints/popup/index.html`, `examples/extension/entrypoints/popup/main.ts`, `examples/extension/entrypoints/options/index.html`, `examples/extension/entrypoints/options/main.ts`, `examples/extension/README.md`
  - Do:
    1. Popup: a Detect button (`fd:start-detect` to the active tab, then `window.close()`), the profiles for the current host with Delete, and an options link.
    2. Options: the LLM provider select, model, base URL, API key (password), an enable-LLM checkbox, a color input for each theme color, and a panel position select. Save writes to storage and shows a status message.
    3. `README.md` covers how to build, load unpacked (Chrome) / temporary add-on (Firefox), the `.env` `FD_*` variables, and `OLLAMA_ORIGINS`.
  - Accept: `bun run --filter feed-detector-example-extension build` and `bun run --filter feed-detector-example-extension build:firefox` both succeed (`.output/firefox-mv3/manifest.json` exists). `bun run check` passes.
  - Commit: `feat(example): add popup and options pages with firefox build (T34)`

- [ ] **T35 — Extension smoke E2E (Chromium)**
  - Depends: T34, T31
  - Read: PLAN L717-724
  - Files: `tests/e2e/extension.spec.ts`, `playwright.config.ts` (add an `extension` project that runs on Chromium only), `package.json` (script `test:e2e:ext`)
  - Do:
    1. Build the example with `FD_E2E=1` (in the test's `beforeAll`, or in a script that runs before it).
    2. Implement the steps at PLAN L718-722: a persistent context with the extension loaded; open the fixture; post the E2E message; click Save in the overlay; reload; assert `data-fd-removed="item"` on posts 4 and 8 only.
    3. Apply the fallback rule from PLAN L723 if headless extension loading fails, and log it in NOTES-01.
  - Accept: `bun run test:e2e` (including the extension project) passes, or the extension test skips with a reason logged.
  - Commit: `test(e2e): add chromium smoke test for example extension (T35)`

## Phase K — Finishing

- [ ] **T36 — Opt-in live LLM tests and the Node smoke script**
  - Depends: T25, T17, T16, T30
  - Read: SPEC L256; PLAN L663-670
  - Files: `tests/live/detect.live.test.ts`, `tests/live/classify.live.test.ts`, `scripts/node-smoke.mjs`, `package.json` (script `smoke:node`)
  - Do:
    1. The live tests use `describe.skipIf(!process.env.FD_LLM_MODEL)` and `createModelFromEnv(allProviders)`, with assertions per PLAN L665-667. Allow a 120 s timeout.
    2. `node-smoke.mjs` per PLAN L668-670.
    3. Add `smoke:node` = `bun run build && node scripts/node-smoke.mjs`.
  - Accept: `bun run test:live` skips cleanly when `FD_LLM_MODEL` is unset (and passes if it is set). `bun run smoke:node` prints counts and exits 0.
  - Commit: `test: add opt-in live llm tests and node smoke script (T36)`

- [ ] **T37 — Performance and determinism tests**
  - Depends: T23, T11
  - Read: SPEC L237-238; PLAN L659-662
  - Files: `tests/unit/perf/perf.test.ts`, `tests/unit/perf/determinism.test.ts`
  - Do:
    1. Performance: a live feed on `infinite-base`. Append 10 batches of 5 items, and read the observer `stats`: median < 5 ms, p95 < 15 ms. Log the values. Use a soft assert (warn only) when `CI_SLOW` is set.
    2. Determinism: per PLAN L661-662.
    3. If the performance test fails, optimize the `processBatch` hot paths (cache the signatures and the `itemId` per element) and do not relax the thresholds. Log the optimizations in NOTES-01.
  - Accept: `bun run check`.
  - Commit: `test: add batch performance and detection determinism tests (T37)`

- [ ] **T38 — CI workflow**
  - Depends: T35, T36
  - Read: PLAN L725-735
  - Files: `.github/workflows/ci.yml`
  - Do:
    1. Write the workflow with exactly the steps at PLAN L726-735, on `ubuntu-latest`.
    2. Cache `~/.bun/install/cache`.
  - Accept: if `actionlint` is available, `actionlint` passes; otherwise the YAML parses (`bun -e "require('yaml')"`, or `python3 -c 'import yaml…'` if available).
  - Commit: `ci: add github actions workflow for checks, e2e and extension builds (T38)`

- [ ] **T39 — README, API docs, and the SPEC §10 sync (last task)**
  - Depends: all previous tasks
  - Read: SPEC L137-182; PLAN L42-79, L736-758
  - Files: `README.md`, `spec/SPEC-01.md` (§10 only), `src/**/*.ts` (JSDoc gaps)
  - Do:
    1. Rewrite `README.md` with the sections from PLAN L736-747. The code samples must match the real exports; verify them against `src/index.ts`, `src/llm/index.ts`, `src/server.ts`, and `src/overlay/index.ts`.
    2. Make sure every public export has JSDoc.
    3. Update the SPEC-01 §10 API sketch to match PLAN §2:
       - `SelectorInput`, `Rule.id`/`origin`, `feed:error`, `connected`/`rescuedBy`;
       - `createModel(config, providers)`, plus the entries `feed-detector/llm` and `feed-detector/llm/providers`;
       - `handleLlmRequest` living in `feed-detector/llm`;
       - `disposeDocument`, `registerXPathEngine`, and `restore(): boolean`.
       Edit only §10.
    4. Run the full Definition of Done (PLAN L749-758). Fix any failures before ticking.
  - Accept: every item in PLAN L750-758 holds.
  - Commit: `docs: write readme and sync spec api sketch with implementation (T39)`

## Phase L — Spec consistency follow-ups (added during implementation)

> Note: added while working T09. Some implementation decisions (logged in `spec/NOTES-01.md`) make SPEC-01/PLAN-01 text outside §10 inaccurate. Those files cannot be edited before T39 without shifting the cited line ranges, so the sync happens here, after T39.

- [ ] **T40 — Sync SPEC/PLAN with the implementation deviations logged in NOTES-01**
  - Depends: T39
  - Read: `spec/NOTES-01.md`
  - Files: `spec/SPEC-01.md`, `spec/PLAN-01.md`
  - Do:
    1. SPEC §12 and PLAN §4.1/§5.3: replace `@medv/finder` with the local deterministic selector generator (T09 note).
    2. Apply any other NOTES-01 entry tagged `(spec-sync)` to the cited SPEC/PLAN text.
    3. Keep edits minimal; line numbers no longer matter after T39.
  - Accept: `grep -n "medv" spec/SPEC-01.md spec/PLAN-01.md` returns nothing; `bun run check` passes.
  - Commit: `docs: sync spec and plan with implementation deviations (T40)`
