import type { MediaInfo } from '../types';
import { urlExtension } from './url';

/** What a media URL resolves to. */
export type ProviderMatch = {
  provider: string;
  id: string;
  kind: MediaInfo['kind'];
  /** Player URL for an iframe; unset for direct files. */
  embedUrl?: string;
  /** Mime type of a direct file. */
  mime?: string;
};

/** A media provider: recognizes its page, share and embed URLs. */
export type MediaProvider = {
  name: string;
  /** Returns a match for the URL, or null when it isn't this provider's. */
  match(url: URL): Omit<ProviderMatch, 'provider'> | null;
};

const host = (u: URL) => u.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
const seg = (u: URL) => u.pathname.split('/').filter(Boolean);
const ID = /^[\w-]{4,}$/;

const youtube: MediaProvider = {
  name: 'youtube',
  match(u) {
    const h = host(u);
    const s = seg(u);
    let id: string | null = null;
    if (h === 'youtu.be') id = s[0] ?? null;
    else if (h === 'youtube.com' || h === 'music.youtube.com' || h === 'youtube-nocookie.com') {
      if (s[0] === 'watch') id = u.searchParams.get('v');
      else if (s[0] === 'shorts' || s[0] === 'embed' || s[0] === 'live' || s[0] === 'v')
        id = s[1] ?? null;
    }
    if (!id || !ID.test(id)) return null;
    return { id, kind: 'video', embedUrl: `https://www.youtube-nocookie.com/embed/${id}` };
  },
};

const vimeo: MediaProvider = {
  name: 'vimeo',
  match(u) {
    const h = host(u);
    const s = seg(u);
    const id =
      h === 'vimeo.com'
        ? s.find((p) => /^\d+$/.test(p))
        : h === 'player.vimeo.com' && s[0] === 'video'
          ? s[1]
          : undefined;
    if (!id || !/^\d+$/.test(id)) return null;
    return { id, kind: 'video', embedUrl: `https://player.vimeo.com/video/${id}` };
  },
};

const dailymotion: MediaProvider = {
  name: 'dailymotion',
  match(u) {
    const h = host(u);
    const s = seg(u);
    let id: string | undefined;
    if (h === 'dai.ly') id = s[0];
    else if (h === 'dailymotion.com')
      id = s[0] === 'video' ? s[1] : s[0] === 'embed' ? s[2] : undefined;
    else if (h === 'geo.dailymotion.com') id = u.searchParams.get('video') ?? undefined;
    if (!id || !ID.test(id)) return null;
    return { id, kind: 'video', embedUrl: `https://www.dailymotion.com/embed/video/${id}` };
  },
};

const SPOTIFY_TYPES: Record<string, MediaInfo['kind']> = {
  episode: 'audio',
  track: 'audio',
  show: 'audio',
  album: 'audio',
  playlist: 'audio',
};

const spotify: MediaProvider = {
  name: 'spotify',
  match(u) {
    if (host(u) !== 'open.spotify.com') return null;
    const s = seg(u).filter((p) => !/^intl-/.test(p) && p !== 'embed');
    const type = s[0];
    const id = s[1];
    if (!type || !id || !SPOTIFY_TYPES[type] || !ID.test(id)) return null;
    return {
      id: `${type}/${id}`,
      kind: 'audio',
      embedUrl: `https://open.spotify.com/embed/${type}/${id}`,
    };
  },
};

const soundcloud: MediaProvider = {
  name: 'soundcloud',
  match(u) {
    const h = host(u);
    if (h === 'w.soundcloud.com') {
      const inner = u.searchParams.get('url');
      if (!inner) return null;
      return { id: inner, kind: 'audio', embedUrl: u.href };
    }
    if (h !== 'soundcloud.com') return null;
    const s = seg(u);
    if (s.length < 2 || ['discover', 'search', 'stream', 'you', 'upload'].includes(s[0] ?? ''))
      return null;
    const page = `https://soundcloud.com/${s.slice(0, 3).join('/')}`;
    return {
      id: s.slice(0, 3).join('/'),
      kind: 'audio',
      embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(page)}`,
    };
  },
};

const FILES: Record<string, { kind: MediaInfo['kind']; mime: string }> = {
  mp4: { kind: 'video', mime: 'video/mp4' },
  m4v: { kind: 'video', mime: 'video/mp4' },
  webm: { kind: 'video', mime: 'video/webm' },
  mov: { kind: 'video', mime: 'video/quicktime' },
  m3u8: { kind: 'video', mime: 'application/vnd.apple.mpegurl' },
  mp3: { kind: 'audio', mime: 'audio/mpeg' },
  m4a: { kind: 'audio', mime: 'audio/mp4' },
  aac: { kind: 'audio', mime: 'audio/aac' },
  ogg: { kind: 'audio', mime: 'audio/ogg' },
  oga: { kind: 'audio', mime: 'audio/ogg' },
  opus: { kind: 'audio', mime: 'audio/opus' },
  wav: { kind: 'audio', mime: 'audio/wav' },
  flac: { kind: 'audio', mime: 'audio/flac' },
  pdf: { kind: 'pdf', mime: 'application/pdf' },
};

const registry: MediaProvider[] = [youtube, vimeo, dailymotion, spotify, soundcloud];

/** Kind and mime type of a direct media file URL by its extension, or null. */
export function fileKind(url: string): { kind: MediaInfo['kind']; mime: string } | null {
  return FILES[urlExtension(url)] ?? null;
}

/**
 * Registers a media provider, checked before the built-in ones (YouTube, Vimeo, Dailymotion,
 * Spotify, SoundCloud). Returns a function that removes it again.
 */
export function registerProvider(provider: MediaProvider): () => void {
  registry.unshift(provider);
  return () => {
    const i = registry.indexOf(provider);
    if (i >= 0) registry.splice(i, 1);
  };
}

/**
 * Resolves a page, share or embed URL to its media provider, id, kind and embed URL, or a direct
 * media file to its kind and mime type (`provider: 'file'`, id = the URL). Null for anything else.
 */
export function resolveProvider(url: string): ProviderMatch | null {
  let u: URL;
  try {
    u = new globalThis.URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  for (const p of registry) {
    try {
      const m = p.match(u);
      if (m) return { provider: p.name, ...m };
    } catch {}
  }
  const file = fileKind(u.href);
  return file ? { provider: 'file', id: u.href, ...file } : null;
}
