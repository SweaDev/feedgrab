import { IGNORED_TAGS } from '../env/dom';
import { isSameKind, sigL1 } from '../signature/signature';

export type { Candidate, Features } from '../types';

/** Element children that may be items (ignored tags removed). */
export function itemChildren(el: Element): Element[] {
  return Array.from(el.children).filter((c) => !IGNORED_TAGS.has(c.tagName));
}

/**
 * Groups children by `sigL1`, then merges groups whose representatives are "same kind".
 * Groups keep document order and are listed by first appearance.
 */
export function groupChildren(children: Element[]): Element[][] {
  const bySig = new Map<string, Element[]>();
  for (const c of children) {
    const s = sigL1(c);
    const g = bySig.get(s);
    if (g) g.push(c);
    else bySig.set(s, [c]);
  }
  const groups: Element[][] = [];
  for (const g of bySig.values()) {
    const rep = g[0] as Element;
    const target = groups.find((m) => isSameKind(m[0] as Element, rep));
    if (target) target.push(...g);
    else groups.push([...g]);
  }
  const order = new Map(children.map((c, i) => [c, i]));
  for (const g of groups) g.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  return groups;
}

/** Largest group; ties go to the group that starts first. */
export function largestGroup(children: Element[]): Element[] {
  let best: Element[] = [];
  for (const g of groupChildren(children)) if (g.length > best.length) best = g;
  return best;
}

/** Sort comparator for document order. */
export function compareDocumentOrder(a: Node, b: Node): number {
  if (a === b) return 0;
  return a.compareDocumentPosition(b) & 4 ? -1 : 1;
}
