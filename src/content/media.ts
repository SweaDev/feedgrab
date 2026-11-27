import { findPermalink } from '../detect/permalink';
import type { MediaInfo, Selector } from '../types';
import { fileKind, resolveProvider } from './providers';
import { absoluteUrl } from './url';

/** Media found in an item, and which signal found it. */
export type FoundMedia = { media: MediaInfo; via: 'element' | 'link' };

const num = (v: string | null): number | undefined => {
  const n = v ? Number.parseInt(v, 10) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const BADGE = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/;
const ISO = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i;

/** Seconds of a duration written as `h:mm:ss`, `m:ss` or ISO 8601 (`PT1H2M3S`), else undefined. */
export function parseDuration(value: string | null | undefined): number | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  const b = BADGE.exec(v);
  if (b) return Number(b[1] ?? 0) * 3600 + Number(b[2]) * 60 + Number(b[3]);
  const i = ISO.exec(v);
  if (i && v.length > 1 && /\d/.test(v)) {
    const s =
      Number(i[1] ?? 0) * 86400 +
      Number(i[2] ?? 0) * 3600 +
      Number(i[3] ?? 0) * 60 +
      Number(i[4] ?? 0);
    return s > 0 ? Math.round(s) : undefined;
  }
  return undefined;
}

/** Duration stated in an item: `itemprop=duration`, `time[datetime^=P]`, or a `12:34` badge. */
export function findDuration(el: Element): number | undefined {
  for (const d of el.querySelectorAll('[itemprop="duration"], time[datetime^="P"]')) {
    const s = parseDuration(
      d.getAttribute('content') ?? d.getAttribute('datetime') ?? d.textContent,
    );
    if (s) return s;
  }
  for (const n of el.querySelectorAll('span, div, time, p, b, small')) {
    if (n.children.length) continue;
    const t = (n.textContent ?? '').trim();
    if (t.length <= 8) {
      const s = parseDuration(t);
      if (s) return s;
    }
  }
  return undefined;
}

/** Media of a `video`/`audio` element, a provider player or a PDF embed inside `el`, or null. */
export function mediaFromElement(el: Element, base: string): MediaInfo | null {
  const av = el.querySelector('video, audio');
  if (av) {
    const kind = av.localName === 'audio' ? 'audio' : 'video';
    const sources = [av, ...av.querySelectorAll('source')];
    let url: string | undefined;
    let mime: string | undefined;
    for (const s of sources) {
      const src = absoluteUrl(s.getAttribute('src'), base);
      if (src) {
        url = src;
        mime = s.getAttribute('type') ?? fileKind(src)?.mime;
        break;
      }
    }
    const m: MediaInfo = { kind };
    if (url) m.url = url;
    if (mime) m.mime = mime;
    const poster = absoluteUrl(av.getAttribute('poster'), base);
    if (poster) m.poster = poster;
    const width = num(av.getAttribute('width'));
    const height = num(av.getAttribute('height'));
    if (width) m.width = width;
    if (height) m.height = height;
    if (url) {
      const p = resolveProvider(url);
      if (p && p.provider !== 'file') Object.assign(m, providerFields(p));
    }
    return m;
  }
  for (const f of el.querySelectorAll('iframe[src], embed[src], object[data]')) {
    const src = absoluteUrl(f.getAttribute('src') ?? f.getAttribute('data'), base);
    if (!src) continue;
    const type = f.getAttribute('type');
    if (type === 'application/pdf' || fileKind(src)?.kind === 'pdf') {
      return { kind: 'pdf', url: src, mime: 'application/pdf' };
    }
    const p = resolveProvider(src);
    if (p && p.provider !== 'file') {
      const m: MediaInfo = { kind: p.kind, ...providerFields(p) };
      const width = num(f.getAttribute('width'));
      const height = num(f.getAttribute('height'));
      if (width) m.width = width;
      if (height) m.height = height;
      return m;
    }
  }
  return null;
}

function providerFields(p: NonNullable<ReturnType<typeof resolveProvider>>): Partial<MediaInfo> {
  const out: Partial<MediaInfo> = { provider: p.provider, providerId: p.id };
  if (p.embedUrl) out.embedUrl = p.embedUrl;
  return out;
}

function fromLink(href: string, type: string | null): MediaInfo | null {
  if (type === 'application/pdf') return { kind: 'pdf', url: href, mime: 'application/pdf' };
  const p = resolveProvider(href);
  if (!p) return null;
  if (p.provider === 'file') {
    const m: MediaInfo = { kind: p.kind, url: href };
    if (p.mime) m.mime = p.mime;
    return m;
  }
  return { kind: p.kind, ...providerFields(p) };
}

/**
 * Playable media of an item: a `video`/`audio` element, a provider player or PDF embed, else its
 * permalink or a thumbnail link pointing at a provider page or a media file. Null for none.
 * Reads only; never fetches.
 */
export function findMedia(el: Element, base: string, permalink?: Selector): FoundMedia | null {
  const found = mediaFromElement(el, base);
  if (found) return { media: found, via: 'element' };
  const links: Element[] = [];
  const main = findPermalink(el, base, permalink);
  if (main) links.push(main);
  for (const a of el.querySelectorAll('a[href]')) {
    if (
      a !== main &&
      (a.querySelector('img, picture') || a.getAttribute('type') === 'application/pdf')
    )
      links.push(a);
  }
  if (el.localName === 'a' && el.hasAttribute('href') && !links.includes(el)) links.unshift(el);
  for (const a of links) {
    const href = absoluteUrl(a.getAttribute('href'), base);
    if (!href) continue;
    const m = fromLink(href, a.getAttribute('type'));
    if (m) return { media: m, via: 'link' };
  }
  return null;
}
