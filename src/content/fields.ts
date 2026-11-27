import { normalizeText } from '../env/text';
import { evaluateSelector } from '../selector/evaluate';
import type { FieldName, FieldRule, ImageInfo } from '../types';
import { parseDuration } from './media';
import { MAX_HTML, MAX_IMAGES, MIN_IMAGE_SIZE } from './score';
import { absoluteSrcset, absoluteUrl } from './url';

/** Fields whose value is a URL; their rules read an attribute by default. */
export const URL_FIELDS: ReadonlySet<FieldName> = new Set([
  'image',
  'mediaUrl',
  'embedUrl',
  'poster',
]);
const URL_ATTRS = ['src', 'href', 'poster', 'content', 'data-src', 'srcset'];

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

const HEADING = 'h1, h2, h3, h4, [role="heading"]';
const AUTHOR = [
  '[itemprop="author"] [itemprop="name"]',
  '[rel="author"]',
  '[itemprop="author"]',
  'a[class*="author"]',
  '[class*="author"] a',
  '[class*="byline"]',
  'a[class*="channel"]',
  '[class*="channel"] a',
  '[class*="creator"]',
  '[class*="author"]',
];
const DESCRIPTION = 'p, [class*="excerpt"], [class*="description"], [class*="summary"]';
/** Chrome around the content that should not end up in its text. */
const NOISE =
  'h1, h2, h3, h4, [role="heading"], button, time, svg, img, script, style, noscript, template, [hidden], [aria-hidden="true"], [class*="dropdown"], [class*="author"], [class*="avatar"], [class*="reaction"], [class*="comment"], [class*="tag"], [class*="meta"], [class*="footer"], [class*="byline"]';
/** Paragraphs that hold metadata (author, date), not the item's text. */
const META = '[class*="meta"], [class*="author"], [class*="byline"], [class*="date"]';
/** Hints (class, alt, src) of images that are not content. */
const NOT_CONTENT_IMG = /avatar|profile|icon|logo|emoji|sprite|badge|pixel|spacer/i;
const LAZY_ATTRS = ['data-src', 'data-lazy-src', 'data-original', 'data-preload-image', 'data-bg'];
/** Tags dropped from `html`. */
const DROP = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'select',
  'textarea',
  'svg',
  'canvas',
  'link',
  'meta',
]);
/** Attributes kept in `html` (URLs are made absolute). */
const KEEP_ATTRS = new Set([
  'href',
  'src',
  'srcset',
  'alt',
  'title',
  'datetime',
  'width',
  'height',
  'colspan',
  'rowspan',
]);

function first(root: Element, rule: FieldRule): Element | null {
  try {
    return evaluateSelector(rule.selector, root)[0] ?? null;
  } catch {
    return null;
  }
}

/** ISO 8601 of a machine-readable date (`2024-05-01`, `2024-05-01T10:00Z`), else undefined. */
export function toIsoDate(value: string | null | undefined): string | undefined {
  const v = value?.trim();
  if (!v || !/^\d{4}-\d{2}-\d{2}/.test(v)) return undefined;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

/** HTML of an element's content without scripts, styles, embeds, forms or event handlers. */
export function cleanHtml(el: Element, base: string): string | undefined {
  const copy = el.cloneNode(true) as Element;
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (DROP.has(child.localName)) {
        child.remove();
        continue;
      }
      for (const name of child.getAttributeNames()) {
        if (!KEEP_ATTRS.has(name)) child.removeAttribute(name);
        else if (name === 'href' || name === 'src') {
          const abs = absoluteUrl(child.getAttribute(name), base);
          if (abs) child.setAttribute(name, abs);
          else child.removeAttribute(name);
        } else if (name === 'srcset') {
          const abs = absoluteSrcset(child.getAttribute(name), base);
          if (abs) child.setAttribute(name, abs);
          else child.removeAttribute(name);
        }
      }
      walk(child);
    }
  };
  walk(copy);
  const html = copy.innerHTML.replace(/<!--[\s\S]*?-->/g, '').trim();
  return html && html.length <= MAX_HTML ? html : undefined;
}

/** Raw string value of a field rule on an item, or undefined when it finds nothing. */
export function readField(
  item: Element,
  name: FieldName,
  rule: FieldRule,
  base: string,
): string | undefined {
  const el = first(item, rule);
  if (!el) return undefined;
  const source = rule.source ?? (URL_FIELDS.has(name) ? 'attr' : 'text');
  if (source === 'html') return cleanHtml(el, base);
  if (source === 'text') {
    if (name === 'publishedAt') return toIsoDate(el.getAttribute('datetime') ?? el.textContent);
    const t = clean(normalizeText(el, Number.POSITIVE_INFINITY));
    return t || undefined;
  }
  const attrs = rule.attr ? [rule.attr] : URL_ATTRS;
  for (const a of attrs) {
    const v = el.getAttribute(a);
    if (!v) continue;
    if (URL_FIELDS.has(name)) {
      const abs = a === 'srcset' ? absoluteUrl(v.split(/[\s,]+/)[0], base) : absoluteUrl(v, base);
      if (abs) return abs;
    } else if (name === 'publishedAt') {
      const iso = toIsoDate(v);
      if (iso) return iso;
    } else if (name === 'duration') {
      const s = parseDuration(v);
      if (s) return String(s);
    } else return clean(v);
  }
  return undefined;
}

/**
 * Heuristic title: a heading, `itemprop=headline|name`, a `figcaption`, the permalink's label or
 * text, else undefined.
 */
export function findTitle(el: Element, permalink: Element | null): string | undefined {
  const node =
    el.querySelector(HEADING) ??
    el.querySelector('[itemprop="headline"], [itemprop="name"]') ??
    el.querySelector('figcaption');
  const t = clean(node?.textContent);
  if (t) return t;
  const label = clean(permalink?.getAttribute('aria-label') ?? permalink?.getAttribute('title'));
  if (label) return label;
  // A permalink that is a timestamp ("Oct 11", "5h") is not a title.
  if (!permalink || permalink.querySelector('time') || permalink.localName === 'time')
    return undefined;
  const text = clean(permalink.textContent);
  return text && text.length <= 200 && text.split(' ').length >= 2 ? text : undefined;
}

/** Heuristic author: `rel`/`itemprop` author, then author, byline, channel or creator classes. */
export function findAuthor(el: Element): string | undefined {
  for (const sel of AUTHOR) {
    for (const node of el.querySelectorAll(sel)) {
      const t = clean(node.textContent);
      if (t && t.length <= 80) return t;
    }
  }
  return undefined;
}

/** Heuristic publication date: `time[datetime]` or `itemprop=datePublished`, as ISO 8601. */
export function findPublished(el: Element): string | undefined {
  for (const node of el.querySelectorAll('[itemprop="datePublished"], time[datetime]')) {
    const iso = toIsoDate(node.getAttribute('datetime') ?? node.getAttribute('content'));
    if (iso) return iso;
  }
  return undefined;
}

/**
 * Description-like paragraphs if there are any, else (when `fallback`) the item's text without its
 * chrome.
 */
export function findText(
  el: Element,
  title: string | undefined,
  max: number,
  fallback = true,
): string | undefined {
  const paras = [...el.querySelectorAll(DESCRIPTION)]
    .filter(
      (p) => !p.closest(HEADING) && !p.parentElement?.closest(DESCRIPTION) && !p.matches(META),
    )
    .map((p) => clean(p.textContent))
    .filter((t) => t && t !== title);
  let text = [...new Set(paras)].join(' ');
  if (!text && fallback) {
    const copy = el.cloneNode(true) as Element;
    for (const n of copy.querySelectorAll(NOISE)) n.remove();
    text = clean(copy.textContent);
    if (title) text = text.replace(title, '').trim();
  }
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function lazySrc(img: Element): string | null {
  const src = img.getAttribute('src');
  if (src && !src.startsWith('data:')) return src;
  for (const a of LAZY_ATTRS) {
    const v = img.getAttribute(a);
    if (v) return v;
  }
  return null;
}

function tooSmall(img: Element): boolean {
  const w = Number.parseInt(img.getAttribute('width') ?? '', 10);
  const h = Number.parseInt(img.getAttribute('height') ?? '', 10);
  return (w > 0 && w <= MIN_IMAGE_SIZE) || (h > 0 && h <= MIN_IMAGE_SIZE);
}

const BG_URL = /background-image\s*:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/i;

/** Content images of an item (no avatars, icons or tiny images), at most `MAX_IMAGES`. */
export function findImages(el: Element, base: string): ImageInfo[] {
  const out: ImageInfo[] = [];
  const seen = new Set<string>();
  const add = (info: ImageInfo) => {
    if (seen.has(info.src) || out.length >= MAX_IMAGES) return;
    seen.add(info.src);
    out.push(info);
  };
  const nodes = [
    el,
    ...el.querySelectorAll('img, [data-preload-image], [data-bg], [style*="background-image"]'),
  ];
  for (const node of nodes) {
    const hint = `${node.getAttribute('class') ?? ''} ${node.getAttribute('alt') ?? ''}`;
    if (node.localName === 'img') {
      const src = absoluteUrl(lazySrc(node), base);
      if (!src || NOT_CONTENT_IMG.test(hint) || NOT_CONTENT_IMG.test(src) || tooSmall(node))
        continue;
      const info: ImageInfo = { src };
      const pic = node.parentElement?.localName === 'picture' ? node.parentElement : null;
      const srcset = absoluteSrcset(
        node.getAttribute('srcset') ?? pic?.querySelector('source[srcset]')?.getAttribute('srcset'),
        base,
      );
      if (srcset) info.srcset = srcset;
      const alt = clean(node.getAttribute('alt'));
      if (alt) info.alt = alt;
      const w = Number.parseInt(node.getAttribute('width') ?? '', 10);
      const h = Number.parseInt(node.getAttribute('height') ?? '', 10);
      if (w > 0) info.width = w;
      if (h > 0) info.height = h;
      add(info);
      continue;
    }
    if (NOT_CONTENT_IMG.test(hint)) continue;
    const raw =
      node.getAttribute('data-preload-image') ??
      node.getAttribute('data-bg') ??
      BG_URL.exec(node.getAttribute('style') ?? '')?.[1] ??
      null;
    const src = absoluteUrl(raw, base);
    if (src && !NOT_CONTENT_IMG.test(src)) add({ src });
  }
  return out;
}
