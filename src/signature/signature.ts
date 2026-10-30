import { hashString } from '../env/hash';
import { stableClasses } from './classes';

/** Level-1 signature: lowercase tag + stable classes, e.g. `article.post`. */
export function sigL1(el: Element): string {
  return [el.tagName.toLowerCase(), ...stableClasses(el)].join('.');
}

function childTags(el: Element): string[] {
  return Array.from(el.children)
    .slice(0, 12)
    .map((c) => c.tagName.toUpperCase())
    .sort();
}

/** Sorted multiset of (up to 12) child tags, e.g. `A,DIV*2,IMG`. */
export function shape(el: Element): string {
  const counts = new Map<string, number>();
  for (const t of childTags(el)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].map(([t, n]) => (n > 1 ? `${t}*${n}` : t)).join(',');
}

/** Level-2 signature: hash of `sigL1 | shape`. */
export function sigL2(el: Element): string {
  return hashString(`${sigL1(el)}|${shape(el)}`);
}

function jaccard<T>(a: T[], b: T[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / (sa.size + sb.size - inter);
}

function multisetJaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const ca = new Map<string, number>();
  const cb = new Map<string, number>();
  for (const x of a) ca.set(x, (ca.get(x) ?? 0) + 1);
  for (const x of b) cb.set(x, (cb.get(x) ?? 0) + 1);
  let inter = 0;
  let union = 0;
  for (const k of new Set([...ca.keys(), ...cb.keys()])) {
    inter += Math.min(ca.get(k) ?? 0, cb.get(k) ?? 0);
    union += Math.max(ca.get(k) ?? 0, cb.get(k) ?? 0);
  }
  return inter / union;
}

/** Jaccard similarity of the stable classes of two elements. */
export function classSimilarity(a: Element, b: Element): number {
  return jaccard(stableClasses(a), stableClasses(b));
}

/** Same tag and similar classes (Jaccard ≥ 0.5), or both classless with similar child shapes. */
export function isSameKind(a: Element, b: Element): boolean {
  if (a.tagName !== b.tagName) return false;
  const ca = stableClasses(a);
  const cb = stableClasses(b);
  if (ca.length === 0 && cb.length === 0) return multisetJaccard(childTags(a), childTags(b)) >= 0.5;
  return jaccard(ca, cb) >= 0.5;
}

/** `isSameKind` on two `sigL1` strings (shape unknown: classless signatures of one tag match). */
export function isSameKindSig(a: string, b: string): boolean {
  const [ta = '', ...ca] = a.split('.');
  const [tb = '', ...cb] = b.split('.');
  if (ta !== tb) return false;
  if (ca.length === 0 && cb.length === 0) return true;
  return jaccard(ca, cb) >= 0.5;
}

/** Most common `sigL1` of the items; ties broken lexically. */
export function dominantSignature(items: Element[]): string {
  const counts = new Map<string, number>();
  for (const el of items) {
    const s = sigL1(el);
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  let best = '';
  let bestN = 0;
  for (const [s, n] of counts) {
    if (n > bestN || (n === bestN && s < best)) {
      best = s;
      bestN = n;
    }
  }
  return best;
}
