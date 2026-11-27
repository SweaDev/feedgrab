# feedgrab 02: tasks

Spec: `spec/SPEC-02.md`. Plan: `spec/PLAN-02.md` (cited by section). Notes: `spec/NOTES-02.md`. Each phase ends in a tag; see `AGENTS.md` Git and releases.

## Phase M — Content model and extraction (v0.6.0)

- [x] **T41 — Content types and profile schema**
  - Depends: none
  - Read: PLAN §1
  - Files: `src/types.ts`, `src/profile/schema.ts`, `tests/unit/profile/profile.test.ts`
  - Do: add the §1 types and `FeedDescriptor.content`; add `FeedContentSchema` (optional on v1).
  - Accept: profiles with and without `content` round-trip through `serializeProfile`/`parseProfile`; invalid field rules are rejected; `bun run check` passes.
  - Commit: `feat(content): content kinds, typed item content and field rules in descriptors (T41)`

- [x] **T42 — URLs and media providers**
  - Depends: T41
  - Read: PLAN §2 (`url`, `providers`)
  - Files: `src/content/url.ts`, `src/content/providers.ts`, `tests/unit/content/providers.test.ts`
  - Accept: YouTube watch/short/shorts/embed, Vimeo, Dailymotion, Spotify episode/track, SoundCloud and direct files resolve to the right provider, id, kind and embed URL; unknown URLs resolve to `null`; `registerProvider` adds one.
  - Commit: `feat(content): media provider registry and url helpers (T42)`

- [x] **T43 — Fields, media and kinds**
  - Depends: T42
  - Read: PLAN §2 (`media`, `fields`, `score`, `kind`, `extract`)
  - Files: `src/content/media.ts`, `src/content/fields.ts`, `src/content/score.ts`, `src/content/kind.ts`, `src/content/extract.ts`, `tests/unit/content/extract.test.ts`
  - Accept: per-module unit tests; field rules win over heuristics; the element is never mutated.
  - Commit: `feat(content): extract typed item content with field rules and heuristics (T43)`

- [x] **T44 — `FeedItem.content()` and fixtures**
  - Depends: T43
  - Read: PLAN §2 wiring, §5
  - Files: `src/feed/feed-item.ts`, `src/feed/unified-feed.ts`, `tests/fixtures/{video-grid,image-gallery,podcast-list,pdf-list,mixed-feed}.*`, `tests/helpers/dom.ts`, `tests/unit/fixtures.test.ts`, `tests/unit/content/fixtures.test.ts`, `tests/unit/feed/readonly.test.ts`
  - Accept: every new fixture's items report the truth kind and field values; feed types match `.expected.json`; DOM snapshots unchanged.
  - Commit: `feat(feed): items report their typed content via content() (T44)`

- [x] **T45 — `generateSelector` and `checkDescriptor`**
  - Depends: T44
  - Read: PLAN §4
  - Files: `src/selector/generate.ts`, `src/feed/check.ts`, `src/index.ts`, `tests/unit/selector/generate-selector.test.ts`, `tests/unit/feed/check.test.ts`, `tests/unit/api.test.ts`
  - Accept: relative selectors find the element first in its root; `checkDescriptor` reports items, link hits, structure matches and the content type without mutating the page.
  - Commit: `feat: export generateSelector and checkDescriptor for host picker UIs (T45)`

- [ ] **T46 — Docs and version 0.6.0**
  - Depends: T41–T45
  - Files: `README.md`, `package.json`, `src/index.ts`, `tests/unit/smoke.test.ts`
  - Accept: full Definition of Done; tag `v0.6.0`.
  - Commit: `chore: version 0.6.0`

## Phase N — Recognition at grab time (v0.7.0)

- [ ] **T47 — `describeFeed` and `suggestFields`** — PLAN §2 (`describe`); detectFeeds fills `content.type`. Commit: `feat(content): describeFeed and suggestFields with coverage (T47)`
- [ ] **T48 — Skeleton media signals and LLM content fields** — PLAN §3. Commit: `feat(llm): detect reports content type and field selectors (T48)`
- [ ] **T49 — Samples keep media attributes; structure coverage exports** — PLAN §4. Commit: `feat(sample): keep media attributes; export structure coverage (T49)`
- [ ] **T50 — Overlay: highlighter export, color scheme, type badge** — PLAN §4. Commit: `feat(overlay): dark mode, content-type badge and exported highlighter (T50)`
- [ ] **T51 — Docs and version 0.7.0** — Commit: `chore: version 0.7.0`

## Phase O — Item pages (v0.8.0)

- [ ] **T52 — `describePage`** — PLAN §2 (`page`), fixtures `page-video`, `page-article`. Commit: `feat(content): describePage from og, json-ld, oembed and page media (T52)`
- [ ] **T53 — `feedgrab/page` entry with `extractArticle`** — PLAN §2 (`article`), optional peer `@mozilla/readability`, not in the IIFE. Commit: `feat(page): extractArticle entry with optional readability (T53)`
- [ ] **T54 — Docs and version 0.8.0** — Commit: `chore: version 0.8.0`
