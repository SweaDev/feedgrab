import { hasLayout, IGNORED_TAGS, isHiddenStatic } from '../env/dom';
import { dominantSignature } from '../signature/signature';
import type { Candidate } from '../types';
import { compareDocumentOrder, itemChildren, largestGroup } from './candidate';
import { computeFeatures, scoreFeatures, THRESHOLD } from './score';

/** Options for `findCandidates`. */
export type FindCandidatesOptions = { minItems?: number; threshold?: number; topK?: number };

/** Candidate for one container: its largest group of same-kind children, scored. */
export function scoreContainer(container: Element, items: Element[], layout: boolean): Candidate {
  const features = computeFeatures({ container, items });
  return {
    container,
    items,
    signature: dominantSignature(items),
    score: scoreFeatures(features, layout),
    features,
  };
}

function byScoreThenOrder(a: Candidate, b: Candidate): number {
  return b.score - a.score || compareDocumentOrder(a.container, b.container);
}

/**
 * Finds containers of repeated, structurally similar items, scored and with nested
 * candidates suppressed. Deterministic for the same DOM.
 */
export function findCandidates(doc: Document, opts: FindCandidatesOptions = {}): Candidate[] {
  const { minItems = 3, threshold = THRESHOLD, topK = 10 } = opts;
  const root = doc.body;
  if (!root) return [];
  const layout = hasLayout(doc);
  const raw: Candidate[] = [];

  const stack: Element[] = [root];
  while (stack.length) {
    const el = stack.pop() as Element;
    const children = itemChildren(el).filter((c) => !isHiddenStatic(c));
    if (children.length >= minItems) {
      const group = largestGroup(children);
      if (group.length >= minItems) raw.push(scoreContainer(el, group, layout));
    }
    for (let i = children.length - 1; i >= 0; i--) {
      const c = children[i] as Element;
      if (!IGNORED_TAGS.has(c.tagName)) stack.push(c);
    }
  }

  const passing = raw.filter((c) => c.score >= threshold).sort(byScoreThenOrder);
  const kept: Candidate[] = [];
  for (const c of passing) {
    const nestedInKept = kept.some(
      (k) =>
        k.score >= c.score && (k.container === c.container || k.container.contains(c.container)),
    );
    const wrapsBetter = kept.some(
      (k) => c.container.contains(k.container) && k.score >= c.score * 1.1,
    );
    if (!nestedInKept && !wrapsBetter) kept.push(c);
  }
  return kept.sort(byScoreThenOrder).slice(0, topK);
}
