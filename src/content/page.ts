import type { ContentKind, ImageInfo, ItemContent, MediaInfo, PageDescription } from '../types';
import { toIsoDate } from './fields';
import { mediaFromElement, parseDuration } from './media';
import { resolveProvider } from './providers';
import { absoluteUrl } from './url';

type Json = Record<string, unknown>;

const clean = (s: unknown) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');

/** `<meta property|name=… content=…>` values, first one per key. */
function metaMap(doc: Document): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of doc.querySelectorAll('meta[content]')) {
    const key = (
      m.getAttribute('property') ??
      m.getAttribute('name') ??
      m.getAttribute('itemprop') ??
      ''
    ).toLowerCase();
    const value = clean(m.getAttribute('content'));
    if (key && value && !out.has(key)) out.set(key, value);
  }
  return out;
}

/** Every JSON-LD node of the page (arrays and `@graph` flattened); bad JSON is skipped. */
function jsonLd(doc: Document): Json[] {
  const out: Json[] = [];
  const add = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(add);
    else if (v && typeof v === 'object') {
      const o = v as Json;
      if (Array.isArray(o['@graph'])) add(o['@graph']);
      out.push(o);
    }
  };
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      add(globalThis.JSON.parse(s.textContent ?? ''));
    } catch {}
  }
  return out;
}

const types = (o: Json): string[] => {
  const t = o['@type'];
  return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === 'string');
};

const LD_KIND: [RegExp, ContentKind][] = [
  [/^(VideoObject|Movie|Clip|Episode|TVEpisode)$/, 'video'],
  [/^(AudioObject|PodcastEpisode|MusicRecording|RadioEpisode)$/, 'audio'],
  [/^(DigitalDocument|Report|ScholarlyArticle)$/, 'pdf'],
  [/^(ImageObject|Photograph)$/, 'image'],
  [/^(Article|NewsArticle|BlogPosting|TechArticle|SocialMediaPosting|WebPage)$/, 'post'],
];

/** The JSON-LD node that describes the page's main thing (media first), and its kind. */
function mainNode(nodes: Json[]): { node: Json; kind: ContentKind } | null {
  for (const [re, kind] of LD_KIND) {
    const node = nodes.find((n) => types(n).some((t) => re.test(t)));
    if (node) return { node, kind };
  }
  return null;
}

const str = (v: unknown): string | undefined => {
  if (typeof v === 'string') return clean(v) || undefined;
  if (Array.isArray(v)) return str(v[0]);
  if (v && typeof v === 'object') {
    const o = v as Json;
    return str(o.url ?? o.contentUrl ?? o.name ?? o['@id']);
  }
  return undefined;
};

const name = (v: unknown): string | undefined => {
  if (Array.isArray(v)) return name(v[0]);
  if (v && typeof v === 'object') return str((v as Json).name);
  return str(v);
};

const num = (v: unknown) => {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

function ogKind(t: string | undefined): ContentKind | undefined {
  if (!t) return undefined;
  if (t.startsWith('video')) return 'video';
  if (t.startsWith('music') || t === 'audio') return 'audio';
  if (t === 'article' || t === 'blog' || t === 'website') return 'post';
  return undefined;
}

/**
 * Describes an item's own page (fetched by the host): its kind, title, author, date, text,
 * images and playable media, from JSON-LD, Open Graph and Twitter cards, media elements and known
 * providers, in that order of trust. Read-only; never fetches (an oEmbed endpoint is only
 * reported). For the article body use `extractArticle`.
 */
export function describePage(doc: Document, url: string): PageDescription {
  const meta = metaMap(doc);
  const ld = mainNode(jsonLd(doc));
  const node = ld?.node ?? {};
  const linkHref = (rel: string) =>
    doc.querySelector(`link[rel="${rel}"][href]`)?.getAttribute('href');
  const canonical = absoluteUrl(linkHref('canonical') ?? meta.get('og:url'), url) ?? url;
  const abs = (v: string | undefined) => absoluteUrl(v, canonical) ?? undefined;

  // Media: JSON-LD, then og:video/og:audio and twitter:player, then page elements, then providers.
  let media: MediaInfo | undefined;
  const ldUrl = abs(str(node.contentUrl ?? (node.associatedMedia as Json | undefined)?.contentUrl));
  const ldEmbed = abs(str(node.embedUrl));
  const ogVideo = abs(
    meta.get('og:video:secure_url') ?? meta.get('og:video:url') ?? meta.get('og:video'),
  );
  const ogAudio = abs(meta.get('og:audio:secure_url') ?? meta.get('og:audio'));
  const player = abs(meta.get('twitter:player'));
  const stream = abs(meta.get('twitter:player:stream'));
  const elementMedia = doc.body ? mediaFromElement(doc.body, canonical) : null;
  const provider = resolveProvider(canonical);
  const kindHint =
    ld?.kind ??
    ogKind(meta.get('og:type')) ??
    (ogVideo ? 'video' : ogAudio ? 'audio' : undefined) ??
    elementMedia?.kind ??
    (provider && provider.provider !== 'file' ? provider.kind : undefined);
  if (kindHint === 'video' || kindHint === 'audio' || kindHint === 'pdf') {
    const m: MediaInfo = { kind: kindHint };
    const direct =
      ldUrl ?? (kindHint === 'audio' ? ogAudio : undefined) ?? stream ?? elementMedia?.url;
    const embeds = [
      ldEmbed,
      kindHint === 'video' ? ogVideo : undefined,
      player,
      elementMedia?.embedUrl,
    ];
    if (direct) m.url = direct;
    for (const e of embeds) {
      if (!e) continue;
      const p = resolveProvider(e);
      if (p?.provider === 'file' && !m.url) m.url = e;
      else if (!m.embedUrl) m.embedUrl = p?.embedUrl ?? e;
      if (p && p.provider !== 'file' && !m.provider)
        [m.provider, m.providerId] = [p.provider, p.id];
    }
    if (provider && provider.provider !== 'file') {
      m.provider ??= provider.provider;
      m.providerId ??= provider.id;
      if (!m.embedUrl && provider.embedUrl) m.embedUrl = provider.embedUrl;
    }
    if (kindHint === 'pdf' && !m.url && provider?.provider === 'file') m.url = canonical;
    const mime = clean(node.encodingFormat) || meta.get('og:video:type') || elementMedia?.mime;
    if (mime && m.url) m.mime = mime;
    const poster = abs(str(node.thumbnailUrl)) ?? abs(meta.get('og:image')) ?? elementMedia?.poster;
    if (poster && kindHint !== 'pdf') m.poster = poster;
    const duration =
      parseDuration(str(node.duration)) ??
      num(meta.get('video:duration')) ??
      num(meta.get('music:duration'));
    if (duration && kindHint !== 'pdf') m.duration = duration;
    const width = num(meta.get('og:video:width')) ?? elementMedia?.width;
    const height = num(meta.get('og:video:height')) ?? elementMedia?.height;
    if (width) m.width = width;
    if (height) m.height = height;
    media = m;
  }

  const images: ImageInfo[] = [];
  for (const src of [
    str(node.image),
    str(node.thumbnailUrl),
    meta.get('og:image'),
    meta.get('twitter:image'),
  ]) {
    const a = abs(src);
    if (a && !images.some((i) => i.src === a)) images.push({ src: a });
  }
  const content: ItemContent = {
    kind: kindHint ?? 'post',
    images: images.slice(0, 8),
    confidence: ld ? 0.95 : meta.has('og:type') || media ? 0.8 : 0.5,
  };
  const title =
    name(node.headline) ??
    name(node.name) ??
    meta.get('og:title') ??
    meta.get('twitter:title') ??
    clean(doc.title);
  if (title) content.title = title;
  const author =
    name(node.author) ?? name(node.creator) ?? meta.get('author') ?? meta.get('article:author');
  if (author) content.author = author;
  const published = toIsoDate(
    str(node.datePublished) ??
      str(node.uploadDate) ??
      meta.get('article:published_time') ??
      meta.get('date'),
  );
  if (published) content.publishedAt = published;
  const text = clean(node.description) || meta.get('og:description') || meta.get('description');
  if (text) content.text = text;
  if (media) content.media = media;

  const out: PageDescription = { ...content, url: canonical };
  const site = meta.get('og:site_name');
  if (site) out.siteName = site;
  const oembed = abs(
    doc
      .querySelector('link[rel="alternate"][type="application/json+oembed"][href]')
      ?.getAttribute('href') ?? undefined,
  );
  if (oembed) out.oembedUrl = oembed;
  return out;
}
