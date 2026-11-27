# feedgrab 02: plan

Spec: `spec/SPEC-02.md`. Tasks: `spec/TASKS-02.md`. Notes: `spec/NOTES-02.md`. v1 rules (`AGENTS.md` hard rules) all still apply.

## 1. Types (`src/types.ts`)
```ts
type ContentKind = 'post' | 'image' | 'video' | 'audio' | 'pdf';
type FeedContentType = ContentKind | 'mixed';
type FieldName = 'title' | 'text' | 'html' | 'author' | 'publishedAt' | 'image'
  | 'mediaUrl' | 'embedUrl' | 'poster' | 'duration';
type FieldRule = { selector: Selector; source?: 'text' | 'html' | 'attr'; attr?: string };
type FeedContent = { type: FeedContentType; fields?: Partial<Record<FieldName, FieldRule>> };
FeedDescriptor.content?: FeedContent;
type ImageInfo = { src: string; srcset?: string; alt?: string; width?: number; height?: number };
type MediaInfo = { kind: 'video' | 'audio' | 'pdf'; url?: string; embedUrl?: string; mime?: string;
  poster?: string; duration?: number; width?: number; height?: number; provider?: string; providerId?: string };
type ItemContent = { kind: ContentKind; title?: string; text?: string; html?: string; author?: string;
  publishedAt?: string; images: ImageInfo[]; media?: MediaInfo; confidence: number };
FeedItem.content(): ItemContent;
```
- `content` is an optional field on profile v1: no version bump, no migration (NOTES-01 v0.2 pattern). `FieldRule.source` defaults to `attr` for `image`, `mediaUrl`, `embedUrl` and `poster` (reading `src`, `href`, `poster` or `content` in that order), else `text`.
- `kind` comes from `content.type` when that is a single kind, else from the item's own signals.
- `duration` is in seconds; `publishedAt` is ISO 8601 (from `datetime`, `content` or a parsable date), else unset.

## 2. Modules (`src/content/`, layer L2 unless noted)
| Module | Does |
|---|---|
| `url.ts` | `absoluteUrl(value, base)`: http(s) only, `null` otherwise; `srcsetUrls`. |
| `providers.ts` | Built-in providers (YouTube, Vimeo, Dailymotion, Spotify, SoundCloud) with patterns for page, short and embed URLs → `{ provider, id, kind, embedUrl }`. `registerProvider(p)` for hosts; `resolveProvider(url)`. Direct files by extension: video (`mp4`, `webm`, `m3u8`, `mov`), audio (`mp3`, `m4a`, `ogg`, `wav`, `aac`, `opus`), `pdf`, with a mime type. |
| `media.ts` | `findMedia(el, base)`: `video`/`audio` (`src`, `source`, `poster`, size), provider iframes and embeds, links to provider pages or media files (permalink first), `type="application/pdf"`. Duration from `itemprop=duration`/`time[datetime^=PT]`/a `h:mm:ss`/`m:ss` badge. |
| `fields.ts` | `readField(el, rule, base)`; heuristics for title (heading, `itemprop=headline/name`, `aria-label` of the permalink, image alt), author (`rel=author`, `itemprop=author`, class hints `author/byline/channel/creator`), date (`time[datetime]`, `itemprop=datePublished`), text (description-like paragraphs, else text without chrome), html (content node clone without script/style/on* attributes, from a detached copy), images (non-avatar `img`/`picture source`/`[data-src]`, srcset, size). Ported from Ghostify's `src/feed/extract.ts`, minus site-specific selectors. |
| `score.ts` | Kind constants: `IMAGE_MAX_TEXT` (text length below which an image-dominant item is an image), `FEED_KIND_SHARE` 0.8, `KIND_CONFIDENCE`. Tuning goes only here and is logged. |
| `kind.ts` | `itemKind(signals)`: provider or `video` → video; `audio` or audio provider → audio; pdf → pdf; images and little text → image; else post. `feedType(items)`: a kind with share ≥ `FEED_KIND_SHARE` of items, else `mixed`; shares rounded to 4 decimals. |
| `extract.ts` | `extractContent(el, descriptor, base)` → `ItemContent`: field rules first, heuristics for the rest; video/audio/pdf drop `html`, keep at most a short `text`. Never mutates the element (clones are detached). |
| `describe.ts` (L3) | `describeFeed(doc, descriptor)`: runs the descriptor (non-live), returns `{ type, kinds, fields: FieldSummary[], items }` where each field has coverage and a sample value. `suggestFields(items, { reference })`: per field, candidate selectors (from `selector/generate.ts`) with coverage and the reference item's value, like `suggestStructure`. |
| `page.ts` | `describePage(doc, url)` → `ItemContent`: og/twitter meta, JSON-LD (`VideoObject`, `AudioObject`, `PodcastEpisode`, `Article`/`BlogPosting`/`NewsArticle`, `ImageObject`, `DigitalDocument`), oEmbed `<link>`, page `video`/`audio`/`embed[type=application/pdf]`, providers. |
| `article.ts` (entry `feedgrab/page`) | `extractArticle(doc, opts?)` runs `@mozilla/readability` (optional peer) on a clone, returns `{ title, byline, siteName, html, text, publishedAt }` or `null`. Not in the IIFE. |

Wiring: `feed/feed-item.ts` gets `content()` (cached per element, like `text()`); `feed/unified-feed.ts` passes descriptor and base URL. `profile/schema.ts` gets `FeedContentSchema`.

## 3. Detection and LLM
- `detect/skeleton.ts` adds `src` host and file extension, `type`, `poster`, `datetime`, `itemprop` and `.pdf` hrefs to the rendered tags, and always renders `video`, `audio`, `iframe` and `source`.
- `llm/contract.ts`: `DetectResponseSchema.feeds[]` gets optional `contentType` and `fields` (field name → CSS selector relative to the item). `detect/llm-refine.ts` validates them (selectors that match nothing are dropped) and copies them into `descriptor.content`. No new task kind.
- `detectFeeds` fills `descriptor.content = { type }` from `feedType` for each proposal (heuristic; fields stay empty unless the LLM gave them).
- `detect/score.ts` `MEDIA_SELECTOR` adds `audio, iframe[src]` (logged).

## 4. Samples and helpers
- `feed/sample.ts` keeps `src`, `poster`, `type` and `srcset` on `img`, `video`, `audio`, `source` and `iframe` when they are http(s) URLs of at most 300 characters (bodies stay empty), so field checks work on samples.
- `selector/generate.ts`: export `generateSelector(el, { root? })`. With `root` it returns a selector relative to the root (`:scope …`), else a unique document selector.
- `feed/check.ts`: `checkDescriptor(doc, descriptor, opts?)` → `{ items, withLink, matchingStructure, kinds, type }` (non-live run, read-only).
- `detect/structure.ts`: export `structureCoverage(items, structure)` and `partCoverage(items, part)`.
- `overlay`: export `createHighlighter`; `OverlayTheme.colorScheme: 'light' | 'dark' | 'auto'` (default `auto`, `prefers-color-scheme` via `getWindow(doc).matchMedia`) with `DARK_THEME`; feed rows show a content-type badge.

## 5. Fixtures and tests
- New fixtures (synthetic, no `<script>`, each with `.expected.json`): `video-grid`, `image-gallery`, `podcast-list`, `pdf-list`, `mixed-feed`; pages `page-video`, `page-article` (for `describePage`, no feed truth).
- Truth attributes: `data-fixture-kind="<kind>"` on items and `data-fixture-field="<name>"` on the element holding a field value; `fixtureTruth` reads them. The `.expected.json` gets `kind` per item and `type` per feed.
- Unit tests per module under `tests/unit/content/`; fixture-driven tests check kinds, feed types and field values; `readonly.test.ts` covers `content()`; determinism covers `feedType` and `describeFeed`; scenario summaries add `kind`.

## 6. Releases
| Tag | Contents |
|---|---|
| v0.6.0 | §1, `url`, `providers`, `media`, `fields`, `score`, `kind`, `extract`, `FeedItem.content()`, schema, fixtures, `generateSelector`, `checkDescriptor` |
| v0.7.0 | `describeFeed`/`suggestFields`, §3, §4 samples, structure coverage, overlay highlighter export, color scheme and badge |
| v0.8.0 | `describePage`, `feedgrab/page` with `extractArticle` |

## Public API
v1 exports (README API table) plus: `describeFeed`, `suggestFields`, `describePage`, `resolveProvider`, `registerProvider`, `generateSelector`, `checkDescriptor`, `structureCoverage`, `partCoverage`; `feedgrab/overlay`: `createHighlighter`, `DARK_THEME`; `feedgrab/page`: `extractArticle`. Types: §1 types, `FieldSummary`, `FieldCandidate`, `FeedDescription`, `MediaProvider`, `DescriptorCheck`, `Article`.

## Decisions
