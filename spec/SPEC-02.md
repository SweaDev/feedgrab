# feedgrab 02: semantic feeds

v1 (`SPEC-01.md`) finds feeds and iterates their items. 02 makes feedgrab **semantic**: it understands what kind of content a feed holds and what attributes each item has, and collects those attributes while it reads the feed. It stays a generic library: hosts (Ghostify and any project with similar needs) decide what to keep and how to present it.

## Requirements

1. **Content kinds.** Each item has a kind: `post` (article, blog post, status, product, any text-first entry), `image`, `video`, `audio` or `pdf`. A feed has a content type: one of those kinds, or `mixed` when no kind clearly dominates.
2. **Typed attributes.** Each item reports its content:
   - for every kind: `title`, `author`, `publishedAt` (ISO 8601 when known), `images` (src, srcset, alt, size) and the permalink (v1);
   - for posts and images: the **content itself**: `text`, plus `html` of the item's content with scripts, styles and event handlers removed. The host sanitizes before it renders;
   - for video, audio and pdf: only **playable attributes**: the media URL, mime type, embed URL, provider and provider id, poster, duration and size. feedgrab never downloads media bodies (a later spec may let hosts save them).
3. **Recognition while identifying a feed.** Detection and inspection report the feed's content type and the attributes found, with coverage across items, so a host's picker can show them at grab time.
4. **Editable attributes.** A descriptor can carry the content type and per-attribute **field rules** (a selector relative to the item and where to read the value: text, HTML or an attribute). Field rules win over the heuristics. They are saved in profiles like the permalink and structure (optional, additive fields of profile v1). Hosts build their own UI to check and change them: pick an element (inspect) or type a selector.
5. **Providers.** Known media providers (YouTube, Vimeo, Dailymotion, Spotify, SoundCloud) map page and embed URLs to a provider, an id, a kind and an embed URL. Hosts can register more.
6. **Item pages.** Given a `Document` of an item's own page (the host fetches it), feedgrab describes it: kind, title, author, date, images and media from Open Graph, Twitter cards, JSON-LD, oEmbed links and page media. An optional entry extracts the article (Readability as an optional peer dependency).
7. **Helpers hosts need for a picker UI:** a selector generator for any element, a dry-run check of a descriptor on a document, structure coverage, and the overlay's highlighter.
8. **The generic overlay** follows light or dark mode and shows each feed's content type.
9. **Unchanged v1 rules:** no DOM globals, read-only page, determinism, zod/mini, the IIFE stays within 120 KB (the Readability entry is not in the IIFE), and LLM use stays optional.

## Non-goals
- Fetching pages, images or media; storage; sanitizing; players or viewers (all host concerns).
- Saving media bodies (a later spec).
