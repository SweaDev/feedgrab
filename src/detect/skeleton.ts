import { containerSelector, itemSelector } from '../selector/generate';
import { isStableToken, stableClasses } from '../signature/classes';
import { sigL1 } from '../signature/signature';
import type { Candidate } from '../types';

/** Options for `buildSkeleton`. */
export type SkeletonOptions = {
  maxChars?: number;
  samplesPerCandidate?: number;
  depth?: number;
  maxChildren?: number;
  textSample?: number;
};

const ATTRS = ['role', 'aria-label', 'data-testid', 'itemprop', 'type', 'datetime'];
/** Tags shown with where their media points (`src` host and file extension). */
const MEDIA = new Set(['img', 'video', 'audio', 'source', 'iframe', 'embed', 'object']);

/** `host/…ext` of a URL, enough for the LLM to tell a player or file from a page. */
function urlHint(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new globalThis.URL(raw, 'https://page.invalid/');
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const path = u.pathname;
    const dot = path.lastIndexOf('.');
    const ext = dot > path.lastIndexOf('/') ? path.slice(dot) : '';
    const host = u.hostname === 'page.invalid' ? '' : u.hostname;
    return `${host}/…${ext}`.slice(0, 60);
  } catch {
    return null;
  }
}

function directText(el: Element, max: number): string {
  let text = '';
  for (const n of Array.from(el.childNodes)) if (n.nodeType === 3) text += ` ${n.nodeValue ?? ''}`;
  text = text.replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function renderNode(el: Element, level: number, o: Required<SkeletonOptions>, out: string[]): void {
  const parts = [el.tagName.toLowerCase()];
  const classes = stableClasses(el);
  if (classes.length) parts.push(`.${classes.join('.')}`);
  const id = el.getAttribute('id');
  if (id && isStableToken(id)) parts.push(`#${id}`);
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v) parts.push(`${a}=${v.slice(0, 40)}`);
  }
  const tag = parts[0] as string;
  if (MEDIA.has(tag)) {
    const hint = urlHint(el.getAttribute('src') ?? el.getAttribute('data'));
    if (hint) parts.push(`src=${hint}`);
    if (el.hasAttribute('poster')) parts.push('poster');
  } else if (tag === 'a') {
    const hint = urlHint(el.getAttribute('href'));
    if (
      hint &&
      (/\.(pdf|mp3|mp4|m4a|webm)$/i.test(hint) ||
        /youtu|vimeo|spotify|soundcloud|dailymotion/.test(hint))
    )
      parts.push(`href=${hint}`);
  }
  const text = directText(el, o.textSample);
  out.push(`${'  '.repeat(level + 1)}<${parts.join(' ')}>${text ? ` "${text}"` : ''}`);
  if (level + 1 >= o.depth) return;
  const children = Array.from(el.children);
  for (const c of children.slice(0, o.maxChildren)) renderNode(c, level + 1, o, out);
  if (children.length > o.maxChildren) {
    out.push(`${'  '.repeat(level + 2)}…+${children.length - o.maxChildren}`);
  }
}

/**
 * Compact text skeleton of the candidates (tags, stable classes, short text samples; no HTML),
 * including one outlier item per candidate so the LLM can see ad-like items.
 */
export function buildSkeleton(candidates: Candidate[], opts: SkeletonOptions = {}): string {
  const o: Required<SkeletonOptions> = {
    maxChars: 12000,
    samplesPerCandidate: 3,
    depth: 3,
    maxChildren: 8,
    textSample: 80,
    ...opts,
  };
  const lines: string[] = [];
  let size = 0;
  const push = (block: string[]): boolean => {
    const text = block.join('\n');
    if (size + text.length + 1 > o.maxChars) return false;
    lines.push(text);
    size += text.length + 1;
    return true;
  };
  for (const [i, c] of candidates.entries()) {
    const header = `#${i} container=${containerSelector(c.container).value} items=${c.items.length} itemSelector=${itemSelector(c.container, c.items).value} score=${c.score}`;
    if (!push([header])) return `${lines.join('\n')}\n…truncated`;
    const samples = c.items.slice(0, o.samplesPerCandidate);
    const outlier = c.items.find((el) => sigL1(el) !== c.signature);
    if (outlier && !samples.includes(outlier)) samples.push(outlier);
    for (const el of samples) {
      const block: string[] = [];
      renderNode(el, 0, o, block);
      if (!push(block)) return `${lines.join('\n')}\n…truncated`;
    }
  }
  return lines.join('\n');
}
