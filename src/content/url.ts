/** Absolute http(s) URL of `value` against `base`, or null (other schemes, `#…`, invalid). */
export function absoluteUrl(value: string | null | undefined, base: string): string | null {
  const v = value?.trim();
  if (!v || v.startsWith('#')) return null;
  try {
    const u = new globalThis.URL(v, base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

/** A `srcset` with every candidate URL made absolute; candidates that aren't http(s) are dropped. */
export function absoluteSrcset(srcset: string | null | undefined, base: string): string | null {
  if (!srcset) return null;
  const out: string[] = [];
  for (const part of srcset.split(',')) {
    const [url, ...desc] = part.trim().split(/\s+/);
    const abs = absoluteUrl(url, base);
    if (abs) out.push([abs, ...desc].join(' '));
  }
  return out.length ? out.join(', ') : null;
}

/** Lower-case file extension of a URL's path (`mp4`), or '' when it has none. */
export function urlExtension(url: string): string {
  try {
    const path = new globalThis.URL(url).pathname;
    const dot = path.lastIndexOf('.');
    return dot > path.lastIndexOf('/') ? path.slice(dot + 1).toLowerCase() : '';
  } catch {
    return '';
  }
}
