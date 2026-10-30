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

const ATTRS = ['role', 'aria-label', 'data-testid'];

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
