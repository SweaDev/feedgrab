import { normalizeRule } from '../profile/normalize';
import { evaluateSelector } from '../selector/evaluate';
import type { SelectorRule } from '../types';
import type { BuiltinRule } from './builtin';

export { normalizeRule };

/** Result of matching a selector rule against an item. */
export type RuleMatch = { itemMatch: boolean; parts: Element[]; element?: Element };

function safeMatches(el: Element, css: string): boolean {
  try {
    return el.matches(css);
  } catch {
    return false;
  }
}

function safeEvaluate(rule: Pick<SelectorRule, 'selector'>, item: Element): Element[] {
  try {
    return evaluateSelector(rule.selector, item);
  } catch {
    return [];
  }
}

/**
 * Matches a user/LLM selector rule relative to an item. `item` scope: the item itself or any
 * descendant matches → item match. `part` scope: matching descendants are parts.
 * Invalid selectors never match.
 */
export function matchSelectorRule(item: Element, rule: SelectorRule): RuleMatch {
  const { selector } = rule;
  if (rule.scope === 'item') {
    if (selector.type === 'css' && safeMatches(item, selector.value)) {
      return { itemMatch: true, parts: [], element: item };
    }
    const found = safeEvaluate(rule, item);
    return found[0]
      ? { itemMatch: true, parts: [], element: found[0] }
      : { itemMatch: false, parts: [] };
  }
  return { itemMatch: false, parts: safeEvaluate(rule, item).filter((el) => el !== item) };
}

/** Built-in rules: a match on the item excludes it; descendant matches are parts. */
export function matchBuiltin(item: Element, rule: BuiltinRule): RuleMatch {
  const css = rule.selector.value;
  const itemMatch = safeMatches(item, css);
  const parts = Array.from(item.querySelectorAll(css));
  return itemMatch ? { itemMatch, parts, element: item } : { itemMatch, parts };
}
