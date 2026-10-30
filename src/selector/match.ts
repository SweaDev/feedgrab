import { hasLayout } from '../env/dom';
import type { MatchResult, Selector } from '../types';
import { evaluateSelector } from './evaluate';

/**
 * Checks a selector without throwing.
 * @example validateSelector(document, { type: 'css', value: '.post' }) // { valid: true, count: 12 }
 */
export function validateSelector(
  doc: Document,
  sel: Selector,
): { valid: boolean; count: number; error?: string } {
  try {
    return { valid: true, count: evaluateSelector(sel, doc).length };
  } catch (e) {
    return { valid: false, count: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Matches a selector (relative to `root` when given). `boxes` is present only when the
 * document has layout. Throws `INVALID_SELECTOR` / `XPATH_UNSUPPORTED`.
 */
export function matchSelector(
  doc: Document,
  sel: Selector,
  opts: { root?: Element } = {},
): MatchResult {
  const elements = evaluateSelector(sel, opts.root ?? doc);
  if (!hasLayout(doc)) return { elements };
  const boxes = elements.map((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  return { elements, boxes };
}
