# AGENTS.md

Guide for coding agents working in this repo. Read it before you start; it's meant to save you from
re-reading the whole codebase. For the details behind it, see `spec/PLAN-01.md` (authoritative
design), `spec/SPEC-01.md` (requirements), and `spec/NOTES-01.md` (places where the code
intentionally differs from the plan). `README.md` is the user-facing API doc.

## What this is

`feedgrab` is a TypeScript library (Bun for tooling, ESM, MIT). It **finds and describes**
repeating content feeds in a `Document` (timelines, search results, product grids), lets a user
confirm them in a Shadow-DOM overlay, and iterates one de-duplicated **unified feed** with a report
per item (`kept` / `excluded` / `pending`). It runs unchanged in three modes: browser extension
content script, headless browser (injected IIFE bundle), and server (Bun/Node + happy-dom). v1
(tasks T01–T40 in `spec/TASKS-01.md`) is complete.

## Commands

| Command | What it does |
|---|---|
| `bun install` | Install (root plus the `examples/*` workspace) |
| `bun run check` | Biome lint + `tsc` + unit tests. **Must be green before you finish any change.** |
| `bun test tests/unit/<area>/<file>.test.ts` | Run one unit test file |
| `bun run format` | Biome format (write) |
| `bun run build` | `dist/` ESM entries, the `dist/browser.global.js` IIFE, and `.d.ts` files |
| `bun run scripts/check-size.ts` | IIFE must be ≤ 120 KB and contain no noncharacters or lone surrogates |
| `bun run test:e2e` | Build + scenario bundle + Playwright (chromium, firefox, extension projects) |
| `bun run test:e2e:ext` | Extension smoke test only (Chromium) |
| `bun run smoke:node` | Build, then import `dist/` under Node ≥ 20 |
| `bun run test:live` | Real-LLM tests; skipped unless `FD_LLM_MODEL` is set |
| `bun run --filter feedgrab-example-extension build` / `build:firefox` | Example WXT extension (run the root `build` first, because it consumes `dist/`) |
| `bun run check:all` | Everything above that CI runs |

The full Definition of Done (as in CI, `.github/workflows/ci.yml`) is: `check`, `build`, `node
scripts/node-smoke.mjs`, `test:e2e`, then both extension builds. For changes that touch only
`src/` logic, `check` is usually enough. Run `build` + `check-size` when you touch exports, the
bundle, or `zod` usage. Run `test:e2e` when you touch the overlay, the observer, or anything where
Bun/browser parity matters.

## Source map (`src/`)

Layers: imports point **downward only**, with no cycles (PLAN §3.2).

| Layer | Modules | Responsibility |
|---|---|---|
| L0 | `types.ts`, `errors.ts`, `env/{dom,hash,text,timers}.ts` | All public types; `FeedgrabError` + `ErrorCode`; `getWindow`, `hasLayout`, `isElement`; FNV-1a `hashString`; `normalizeText`; stubbable `timers` |
| L1 | `selector/{evaluate,match,generate,xpath}.ts` | CSS/XPath evaluation, `validateSelector`/`matchSelector`, deterministic in-house selector generation (no finder library), XPath engine registry |
| L1 | `signature/{classes,signature}.ts` | Stable-class filter (rejects hashed/Tailwind/state classes), `sigL1`/`sigL2`, "same kind" |
| L1 | `profile/{schema,normalize,migrate,profile,match}.ts` | zod/mini profile schema, rule id normalization (`r_<hash>`), serialize/parse/migrate, `matchProfile` specificity |
| L1 | `llm/{contract,proxy}.ts` | Request/response zod schemas, `createLlmProxy`, `isLanguageModel` |
| L2 | `detect/{candidate,score,heuristic,descriptor,detect,inspect,skeleton}.ts` | Heuristic candidates + scoring (`WEIGHTS`, `THRESHOLD`, `NAV_SELECTOR` in `score.ts`), `detectFeeds`, `inspectFromElement`, `detectFromSelector`, LLM skeleton |
| L2 | `exclude/{builtin,specificity,rules,engine}.ts`, `llm/backend.ts` | `BUILTIN_RULES`, CSS/XPath specificity, rule matching, `evaluateItem` (precedence/include rescue/parts); `resolveBackend` |
| L3 | `detect/llm-refine.ts`, `exclude/llm-classifier.ts`, `cleanup/remove.ts` | LLM refinement of detections; batched + cached text classifier; `removeItem`/`removeParts` with `restore()` |
| L4 | `feed/{unified-feed,observer,ingest,registry,item-id,feed-item,emitter,async-queue}.ts` | `openFeed`, the MutationObserver pipeline, `ingest`, ordering, stable ids, events, async iteration |
| L5 | `overlay/*` | `openOverlay` (host, theme, styles, highlighter, picker, pure `state.ts` reducer, `panel.ts`) |
| Entry | `index.ts`, `server.ts`, `browser.ts`, `llm/index.ts`, `llm/providers.ts`, `overlay/index.ts` | Re-exports and wiring only |

LLM host-side files: `llm/handle.ts` (`handleLlmRequest`), `structured.ts` (the only AI SDK
structured-output call), `prompts.ts`, `config.ts` (`FD_LLM_*` env), `models.ts` (`createModel`
with injected provider factories), and `run-model.ts` / `run-model.stub.ts`.

Package entry points (`package.json` `exports`): `.` → `src/index.ts`, `./overlay`, `./server`,
`./llm`, `./llm/providers`, and `./browser` (IIFE, global `Feedgrab`, no `.d.ts`).

## Hard rules (the tests or the bundle break if you violate them)

- **No DOM globals in `src/`.** Never touch `window`, `document`, `Node`, `CSS`, `HTMLElement`, or
  `MutationObserver` directly. Use the document you were given and `getWindow(doc)`
  (= `doc.defaultView`). JS globals (`URL`, `setTimeout`, `AbortController`, `structuredClone`, …)
  go through `globalThis`. Timers go through `timers` from `env/timers.ts`, so tests can stub them.
  The only browser-only APIs allowed are in `overlay/*` (rAF, `ResizeObserver`, `getComputedStyle`,
  all read from `getWindow(doc)`) and the `MutationObserver` in `feed/observer.ts`.
- **Node type checks are numeric** (`node.nodeType === 1`, `isElement`), never `instanceof`.
  Elements may come from happy-dom or another realm.
- **Public APIs throw only `FeedgrabError`** with a code from the `ErrorCode` union in
  `errors.ts`. Wrap foreign errors with `toFeedgrabError`. If you need a new code, add it to the
  union and log it in NOTES-01.
- **Read-only invariant.** Detection, the overlay, iteration, and `ingest` must never mutate the
  page DOM. Only `removeItem`/`removeParts` do, marking nodes with `data-fd-removed`.
  `tests/unit/feed/readonly.test.ts` compares DOM snapshots on every fixture. The overlay adds
  exactly one node, `<div data-feedgrab-overlay>` with an open shadow root (no custom
  elements).
- **Determinism.** Heuristic output must be identical for the same DOM, in Bun and in browsers.
  Sort with explicit tie-breakers (score, then document order), round scores to 4 decimals, and
  don't let anything depend on `Map`/object iteration of unordered sources.
  `tests/unit/perf/determinism.test.ts` and the Playwright parity scenarios enforce this.
- **Module boundaries for heavy dependencies:**
  - `llm/structured.ts` is the only **runtime** import of `ai`, and `llm/providers.ts` is the only
    runtime import of the provider packages. Everywhere else (`types.ts`, `backend.ts`,
    `models.ts`, …) uses `import type` only;
  - the core reaches `run-model.ts` **only** via `await import('./run-model')` in
    `llm/backend.ts`; the IIFE build swaps it for `run-model.stub.ts`, which throws
    `LLM_MODEL_UNSUPPORTED_IN_BUNDLE`;
  - only `server.ts` imports `happy-dom` / `xpath`;
  - only `llm/providers.ts` statically imports the provider packages.
- **zod: always `import { z } from 'zod/mini'`**, never full `zod`. Full zod pushes the IIFE over
  the 120 KB budget (146 KB versus about 80 KB).
- **No raw noncharacters (U+FFFF etc.) in source regexes.** The minifier emits them raw, and
  Chrome then rejects the content script as non-UTF-8. Use code-unit checks.
  `tests/unit/bundle-encoding.test.ts` guards this.
- **Entry files only re-export.** Logic goes in a module.
- **Public exports need JSDoc.** Internal helpers don't.

## Code style

- ESM, `.ts`, relative imports **without extensions**, named exports only (no default exports),
  one responsibility per module, pure functions where practical.
- Biome: 2-space indent, width 100, single quotes, trailing commas, organized imports. Run
  `bun run format` instead of hand-formatting. `*.md` and `tests/fixtures/*.html` are excluded
  from Biome.
- TypeScript is `strict` with `noUncheckedIndexedAccess` and `verbatimModuleSyntax` (use
  `import type`). Non-null `!` is allowed in `tests/` and `scripts/` only.
- Ids are a prefix plus `hashString(...)`: `fd_` descriptors, `r_` rules, `i_` items, `b_` builtins.

## Core semantics to keep in mind

- **Selectors.** A container selector is evaluated on the document and may match several
  containers. An item selector is evaluated **relative to each container** (generated ones look
  like `:scope > article.post`), and non-descendants are dropped.
- **Item ids** (`feed/item-id.ts`) use the canonical permalink (hash and `utm_*`/`fbclid`/… removed,
  query sorted), else a text hash. An item with no link and less than `minItemTextLength` (10)
  characters is a **placeholder**: it is tracked but not emitted until it fills in. Ids dedupe
  across feeds, re-renders, and ingests.
- **Exclusion precedence** (`exclude/engine.ts`). Rank: user selector rule 3 > LLM selector rule
  or LLM text verdict 2 > builtin 1. Within a rank, higher specificity wins. An `include` rule
  rescues an item from an exclude of lower rank, or of equal rank with specificity ≤ its own, and
  sets `rescuedBy`. Rescued items are never sent to the LLM. A builtin match on the item itself
  excludes the item; a match on a descendant is reported as a part.
- **`live` default.** `parseHtml` tags documents with `Symbol.for('feedgrab.parsed')`, which
  makes them `live: false`; otherwise feeds are live. One `MutationObserver` on
  `doc.documentElement` coalesces records per microtask into `processBatch()` (target < 5 ms).
  Re-attached items emit `item:updated`, not `item:added`. A container that stays missing for
  `lostTimeoutMs` emits `feed:lost`.
- **Events** for the initial scan fire in a microtask after `openFeed` returns, and `items()` is
  already populated synchronously. Listener errors become `feed:error` (`LISTENER_ERROR`).
- **LLM is optional everywhere.** `detectFeeds` never throws because of the LLM (it calls
  `onLlmError` and keeps the heuristic result). Classifier failures turn the affected items `kept`
  and emit `feed:error`. With no `llm` backend, `llm-text` rules are treated as non-matching.
- **Profiles** are plain JSON keyed by `hostname` + `pathPattern`. `serializeProfile` sorts keys.
  If you change the schema, bump `CURRENT_PROFILE_VERSION` and add a migration in
  `profile/migrate.ts`.

## Testing

- Unit tests live at `tests/unit/<area>/*.test.ts` (`bun:test`). **Never register a global DOM.**
  Build documents with `loadFixture(name)` / `parseHtml` (`tests/helpers/dom.ts`), and append
  chunks with `appendFragment`.
- Fixtures (`tests/fixtures/*.html`) are synthetic, contain no `<script>`, and encode the ground
  truth in `data-fixture-feed|item|excluded|part|skeleton` attributes (read them with
  `fixtureTruth(doc)`). Each has a `<name>.expected.json`, and `tests/unit/fixtures.test.ts` keeps
  the two consistent. The library must never read `data-fixture-*`. If you add a fixture, add its
  `.expected.json` too.
- LLM tests use `fnBackend(handler)` (a proxy that records calls) or `mockModel(responses)`
  (`MockLanguageModelV4` from `ai/test`, for AI SDK v7) from `tests/helpers/mock-llm.ts`. No network.
- Stub time with `__setTimers` from `src/env/timers.ts`.
- happy-dom has no layout (`hasLayout` is false, so there are no boxes and the overlay throws
  `OVERLAY_NO_LAYOUT`) and no native `document.evaluate`, so XPath uses the `xpath` package,
  registered by `parseHtml`. The overlay flow, theming, and live scroll are tested in
  `tests/e2e/*.spec.ts` (Playwright, fixtures served on port 4599).
- Parity: `tests/scenarios/index.ts` defines scenarios that run both in Bun
  (`tests/unit/scenarios.test.ts`) and in the browser against `dist/browser.global.js`, and the
  results must deep-equal. Summaries exclude `confidence`, because layout signals legitimately
  change it.
- Never weaken a test or relax a threshold to make it pass. Heuristic tuning goes only through the
  constants in `detect/score.ts`, and must be logged.
- Changing the public API? Update `src/index.ts` (or the relevant entry), `tests/unit/api.test.ts`
  (which asserts the export list), the README API table, and SPEC-01 §10.

## Spec and decision log

- `spec/PLAN-01.md` is the authoritative design. When the code must deviate, append
  `- T<nn>|<topic>: <decision> — <reason>` to `spec/NOTES-01.md`, and update SPEC/PLAN if the
  deviation changes documented behaviour. v1 is finished, so line references in TASKS-01 no longer
  constrain edits.
- New work that is planned as tasks should follow the TASKS-01 format: Depends / Read / Files /
  Do / Accept / Commit.

## Git

- Commit on `main`, one line per logical change (or per task), conventional prefix (`feat(scope):`,
  `fix:`, `test:`, `docs:`, `build:`, `ci:`, `chore:`), with **no body and no trailers**. When
  working a TASKS file, tick its checkbox in the same commit and use the task's `Commit:` line
  verbatim. **Never push.** Only commit when asked to, or when you're working through tasks.

## Known environment gotchas

- The example extension resolves `feedgrab` from the workspace's built `dist/`, so run
  `bun run build` first. Its content script bundles the lazy `run-model` chunk anyway (Vite inlines
  dynamic imports), which is accepted for the example.
- Chromium (Playwright 1.64) ignores `--load-extension`. `tests/e2e/extension.spec.ts` loads the
  unpacked extension via CDP `Extensions.loadUnpacked`, with `--enable-unsafe-extension-debugging`.
- Playwright browsers may need `bunx playwright install --with-deps chromium firefox`.
- The AI SDK is v7: use `generateText({ output: Output.object({ schema }) })` with `instructions`,
  and keep all of that in `llm/structured.ts`.
