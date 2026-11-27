import { findPermalink } from '../detect/permalink';
import { normalizeText } from '../env/text';
import type { FeedContent, FieldName, ItemContent, MediaInfo, Selector } from '../types';
import {
  cleanHtml,
  findAuthor,
  findImages,
  findPublished,
  findText,
  findTitle,
  readField,
} from './fields';
import { itemKind } from './kind';
import { type FoundMedia, findDuration, findMedia } from './media';
import { resolveProvider } from './providers';
import { KIND_CONFIDENCE, MAX_MEDIA_TEXT, MAX_TEXT } from './score';

/** What `extractContent` needs from the feed's descriptor. */
export type ExtractOptions = {
  /** Base URL that relative links and sources resolve against. */
  baseUrl: string;
  content?: FeedContent;
  permalink?: Selector;
};

function ruleValue(el: Element, opts: ExtractOptions, name: FieldName): string | undefined {
  const rule = opts.content?.fields?.[name];
  return rule ? readField(el, name, rule, opts.baseUrl) : undefined;
}

/** Media from the mediaUrl/embedUrl rules, else the item's own media. */
function mediaOf(el: Element, opts: ExtractOptions): FoundMedia | null {
  const url = ruleValue(el, opts, 'mediaUrl');
  const embed = ruleValue(el, opts, 'embedUrl');
  const found = findMedia(el, opts.baseUrl, opts.permalink);
  if (!url && !embed) return found;
  const media: MediaInfo = { ...(found?.media ?? { kind: 'video' }) };
  for (const u of [embed, url]) {
    if (!u) continue;
    const p = resolveProvider(u);
    if (p) {
      media.kind = p.kind;
      if (p.provider === 'file') {
        media.url = u;
        if (p.mime) media.mime = p.mime;
      } else {
        media.provider = p.provider;
        media.providerId = p.id;
        if (p.embedUrl) media.embedUrl = p.embedUrl;
      }
    }
  }
  if (url && !media.url && !media.embedUrl) media.url = url;
  if (embed && !media.embedUrl) media.embedUrl = embed;
  return { media, via: 'element' };
}

/**
 * Typed content of an item element: the descriptor's field rules first, heuristics for the rest.
 * Posts and images keep `text` and `html`; video, audio and PDF items keep playable attributes in
 * `media` and at most a short `text`. Reads only (works on detached copies), never fetches.
 */
export function extractContent(el: Element, opts: ExtractOptions): ItemContent {
  const base = opts.baseUrl;
  const declared = opts.content?.type;
  const permalink = findPermalink(el, base, opts.permalink);
  const found = mediaOf(el, opts);
  const images = findImages(el, base);
  const ruleImage = ruleValue(el, opts, 'image');
  if (ruleImage && !images.some((i) => i.src === ruleImage)) images.unshift({ src: ruleImage });
  const title = ruleValue(el, opts, 'title') ?? findTitle(el, permalink);
  const { kind: sensed, confidence: sensedConfidence } = itemKind({
    media: found,
    images: images.length,
    textLength: normalizeText(el, Number.POSITIVE_INFINITY).length,
  });
  const kind = declared && declared !== 'mixed' ? declared : sensed;
  const confidence = declared && declared !== 'mixed' ? KIND_CONFIDENCE.declared : sensedConfidence;
  const playable = kind === 'video' || kind === 'audio' || kind === 'pdf';

  const out: ItemContent = { kind, images, confidence };
  if (title) out.title = title;
  const author = ruleValue(el, opts, 'author') ?? findAuthor(el);
  if (author) out.author = author;
  const published = ruleValue(el, opts, 'publishedAt') ?? findPublished(el);
  if (published) out.publishedAt = published;
  const text =
    ruleValue(el, opts, 'text') ??
    findText(el, title, playable ? MAX_MEDIA_TEXT : MAX_TEXT, !playable);
  if (text)
    out.text =
      playable && text.length > MAX_MEDIA_TEXT ? `${text.slice(0, MAX_MEDIA_TEXT - 1)}…` : text;
  if (!playable) {
    const html = ruleValue(el, opts, 'html') ?? cleanHtml(el, base);
    if (html) out.html = html;
    return out;
  }

  let media: MediaInfo | undefined = found?.media.kind === kind ? { ...found.media } : undefined;
  media ??= { kind };
  const poster =
    ruleValue(el, opts, 'poster') ?? media.poster ?? (kind !== 'pdf' ? images[0]?.src : undefined);
  if (poster) media.poster = poster;
  const duration = Number(ruleValue(el, opts, 'duration')) || media.duration || findDuration(el);
  if (duration && kind !== 'pdf') media.duration = duration;
  out.media = media;
  return out;
}
