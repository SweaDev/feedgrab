import { compareDocumentOrder } from '../detect/candidate';
import { normalizeRule } from '../profile/normalize';
import { evaluateSelector } from '../selector/evaluate';
import { isSameKindSig, sigL1 } from '../signature/signature';
import type {
  ExclusionMatch,
  FeedDescriptor,
  ItemStatus,
  LlmTextRule,
  PartMatch,
  RuleRef,
  SelectorRule,
} from '../types';
import { BUILTIN_RULES, OUTLIER_RULE_ID } from './builtin';
import { matchBuiltin, matchSelectorRule } from './rules';
import { compareSpecificity, type Specificity, selectorSpecificity } from './specificity';

/** LLM classification result for one item. */
export type LlmVerdict = {
  exclude: boolean;
  criteriaIndex?: number;
  confidence: number;
  error?: boolean;
};

/** Context for `evaluateItem`. */
export type EvaluationContext = {
  descriptor: FeedDescriptor;
  builtins: boolean;
  dominantSig: string;
  llmVerdict?: (item: Element) => LlmVerdict | 'pending' | undefined;
};

/** Result of evaluating one item against the exclusion rules. */
export type Evaluation = {
  status: ItemStatus;
  reasons: ExclusionMatch[];
  parts: PartMatch[];
  rescuedBy?: RuleRef;
  needsLlm: boolean;
};

type Ranked = { match: ExclusionMatch; rank: number; spec: Specificity };

const ZERO: Specificity = [0, 0, 0];

function stronger(a: Ranked, b: Ranked): boolean {
  return a.rank > b.rank || (a.rank === b.rank && compareSpecificity(a.spec, b.spec) > 0);
}

function strongest(list: Ranked[]): Ranked | undefined {
  let best: Ranked | undefined;
  for (const r of list) if (!best || stronger(r, best)) best = r;
  return best;
}

function selectorRules(rules: FeedDescriptor['exclude']): (SelectorRule & { id: string })[] {
  return rules.filter((r): r is SelectorRule => r.kind === 'selector').map((r) => normalizeRule(r));
}

function matchesInclude(el: Element, item: Element, rule: SelectorRule): boolean {
  if (rule.selector.type === 'css') {
    try {
      return el.matches(rule.selector.value);
    } catch {
      return false;
    }
  }
  try {
    return evaluateSelector(rule.selector, item).includes(el);
  } catch {
    return false;
  }
}

/**
 * Evaluates one item: collects exclude/include matches, applies precedence (rank by origin,
 * then specificity; includes win ties), LLM text verdicts and part matches.
 */
export function evaluateItem(item: Element, ctx: EvaluationContext): Evaluation {
  const { descriptor } = ctx;
  const excludes = selectorRules(descriptor.exclude);
  const includes = selectorRules(descriptor.include);
  const llmRules = descriptor.exclude
    .filter((r): r is LlmTextRule => r.kind === 'llm-text')
    .map((r) => normalizeRule(r));

  const ex: Ranked[] = [];
  const partCandidates: PartMatch[] = [];
  for (const rule of excludes) {
    const m = matchSelectorRule(item, rule);
    const ref: RuleRef = { ruleId: rule.id, origin: rule.origin ?? 'user' };
    if (m.itemMatch) {
      ex.push({
        match: {
          ...ref,
          kind: 'selector',
          selector: rule.selector,
          ...(m.element ? { element: m.element } : {}),
        },
        rank: rule.origin === 'llm' ? 2 : 3,
        spec: selectorSpecificity(rule.selector),
      });
    }
    for (const el of m.parts) partCandidates.push({ element: el, rule: ref });
  }
  if (ctx.builtins) {
    for (const rule of BUILTIN_RULES) {
      const m = matchBuiltin(item, rule);
      const ref: RuleRef = { ruleId: rule.id, origin: 'builtin' };
      if (m.itemMatch) {
        ex.push({
          match: { ...ref, kind: 'selector', selector: rule.selector, element: item },
          rank: 1,
          spec: selectorSpecificity(rule.selector),
        });
      }
      for (const el of m.parts) partCandidates.push({ element: el, rule: ref });
    }
    if (ctx.dominantSig && !isSameKindSig(sigL1(item), ctx.dominantSig)) {
      ex.push({
        match: { ruleId: OUTLIER_RULE_ID, origin: 'builtin', kind: 'signature-outlier' },
        rank: 1,
        spec: ZERO,
      });
    }
  }

  const inc: Ranked[] = [];
  for (const rule of includes) {
    if (rule.scope !== 'item') continue;
    const m = matchSelectorRule(item, rule);
    if (!m.itemMatch) continue;
    inc.push({
      match: {
        ruleId: rule.id,
        origin: rule.origin ?? 'user',
        kind: 'selector',
        selector: rule.selector,
      },
      rank: 3,
      spec: selectorSpecificity(rule.selector),
    });
  }

  // Parts: dedupe by element (first rule wins), drop rescued ones, document order.
  const seen = new Set<Element>();
  const parts = partCandidates
    .filter((p) => {
      if (seen.has(p.element)) return false;
      seen.add(p.element);
      return !includes.some((r) => matchesInclude(p.element, item, r));
    })
    .sort((a, b) => compareDocumentOrder(a.element, b.element));

  const E = strongest(ex);
  const I = strongest(inc);
  if (
    I &&
    (!E || I.rank > E.rank || (I.rank === E.rank && compareSpecificity(I.spec, E.spec) >= 0))
  ) {
    return {
      status: 'kept',
      reasons: [],
      parts,
      rescuedBy: { ruleId: I.match.ruleId, origin: I.match.origin },
      needsLlm: false,
    };
  }
  if (E) {
    const reasons = [...ex]
      .sort((a, b) => b.rank - a.rank || compareSpecificity(b.spec, a.spec))
      .map((r) => r.match);
    return { status: 'excluded', reasons, parts, needsLlm: false };
  }
  if (llmRules.length > 0) {
    const verdict = ctx.llmVerdict?.(item);
    if (verdict === undefined || verdict === 'pending') {
      return { status: 'pending', reasons: [], parts, needsLlm: verdict === undefined };
    }
    if (verdict.exclude && !verdict.error) {
      const rule =
        llmRules[verdict.criteriaIndex ?? 0] ?? (llmRules[0] as (typeof llmRules)[number]);
      return {
        status: 'excluded',
        reasons: [
          {
            ruleId: rule.id,
            origin: rule.origin,
            kind: 'llm-text',
            criteria: rule.criteria,
            confidence: verdict.confidence,
          },
        ],
        parts,
        needsLlm: false,
      };
    }
  }
  return { status: 'kept', reasons: [], parts, needsLlm: false };
}
