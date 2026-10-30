import type { SiteProfile } from '../types';

function segments(path: string): string[] {
  return path.split(/[?#]/)[0]?.split('/').filter(Boolean) ?? [];
}

function segmentMatches(pattern: string, seg: string): boolean {
  if (pattern === '*') return true;
  if (!pattern.includes('*')) return pattern === seg;
  const re = pattern.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${re.join('.*')}$`).test(seg);
}

function globMatch(pattern: string[], path: string[]): boolean {
  if (pattern.length === 0) return path.length === 0;
  const [head, ...rest] = pattern as [string, ...string[]];
  if (head === '**') {
    for (let i = 0; i <= path.length; i++) if (globMatch(rest, path.slice(i))) return true;
    return false;
  }
  if (path.length === 0) return false;
  return segmentMatches(head, path[0] as string) && globMatch(rest, path.slice(1));
}

/** True when a path pattern (`*`, `**`, `post-*`) matches a URL path. */
export function pathMatches(pattern: string, path: string): boolean {
  return globMatch(segments(pattern), segments(path));
}

/** Host specificity: 2 for an exact match (incl. port), 1 for `*.domain` (subdomains only), 0 otherwise. */
export function hostSpecificity(pattern: string, url: URL): number {
  const p = pattern.toLowerCase();
  if (p === url.host.toLowerCase()) return 2;
  if (!p.startsWith('*.')) return 0;
  const [name = '', port] = p.slice(2).split(':');
  if (port !== undefined && port !== url.port) return 0;
  return url.hostname.toLowerCase().endsWith(`.${name}`) ? 1 : 0;
}

function rank(p: SiteProfile, hostSpec: number): number[] {
  const segs = segments(p.pathPattern);
  return [
    hostSpec,
    segs.filter((s) => !s.includes('*')).length,
    -segs.filter((s) => s === '**').length,
    -segs.filter((s) => s !== '**' && s.includes('*')).length,
    p.pathPattern.length,
  ];
}

/**
 * Picks the most specific profile for a URL (hostname + path pattern), or `undefined`.
 * @example matchProfile(location.href, profiles)
 */
export function matchProfile(url: string | URL, profiles: SiteProfile[]): SiteProfile | undefined {
  const u = new globalThis.URL(String(url));
  const matches = profiles
    .map((p) => ({ p, host: hostSpecificity(p.hostname, u) }))
    .filter(({ p, host }) => host > 0 && pathMatches(p.pathPattern, u.pathname))
    .map(({ p, host }) => ({ p, key: rank(p, host) }));
  matches.sort((a, b) => {
    for (let i = 0; i < a.key.length; i++) {
      const d = (b.key[i] as number) - (a.key[i] as number);
      if (d !== 0) return d;
    }
    return a.p.pathPattern < b.p.pathPattern ? -1 : a.p.pathPattern > b.p.pathPattern ? 1 : 0;
  });
  return matches[0]?.p;
}
