import { toFeedDetectorError } from '../errors';
import type { ResolvedBackend } from '../llm/backend';
import type { DetectRequest, DetectResponse } from '../llm/contract';
import { normalizeRule } from '../profile/normalize';
import { evaluateSelector, resolveItems } from '../selector/evaluate';
import type { Candidate, DetectOptions, FeedDescriptor, Selector, SelectorRule } from '../types';
import { compareDocumentOrder } from './candidate';
import { descriptorFromCandidate, descriptorId } from './descriptor';
import { round4 } from './score';
import { buildSkeleton } from './skeleton';

type Refined = { d: FeedDescriptor; first: Element };

function css(value: string): Selector {
  return { type: 'css', value };
}

function tryEvaluate(sel: Selector, ctx: Document | Element): Element[] | null {
  try {
    return evaluateSelector(sel, ctx);
  } catch {
    return null;
  }
}

function validateFeed(
  doc: Document,
  feed: DetectResponse['feeds'][number],
  candidates: Candidate[],
  minItems: number,
): Refined | null {
  const containers = tryEvaluate(css(feed.containerSelector), doc);
  const first = containers?.[0];
  if (!first) return null;
  const item = css(feed.itemSelector);
  let items: Element[];
  try {
    items = resolveItems(first, { item });
  } catch {
    return null;
  }
  const cand =
    candidates.find((c) => c.container === first) ??
    (feed.candidateIndex !== undefined ? candidates[feed.candidateIndex] : undefined);
  const max = Math.max(200, 10 * (cand?.items.length ?? 0));
  if (items.length < minItems || items.length > max) return null;

  const exclude: SelectorRule[] = [];
  for (const ex of feed.exclusions) {
    const matches = tryEvaluate(css(ex.selector), first);
    if (!matches || matches.length === 0) continue;
    exclude.push(
      normalizeRule({
        kind: 'selector',
        selector: css(ex.selector),
        scope: ex.scope,
        origin: 'llm',
      }),
    );
  }
  const heuristic = candidates.find((c) => c.container === first)?.score ?? 0.5;
  const container = css(feed.containerSelector);
  return {
    first,
    d: {
      id: descriptorId(container, item),
      container,
      item,
      exclude,
      include: [],
      source: 'llm',
      confidence: round4(0.5 * feed.confidence + 0.5 * heuristic),
      confirmed: false,
    },
  };
}

/**
 * Sends the top candidates' skeleton to the LLM, validates every returned selector against
 * the DOM and merges the result with the heuristic descriptors. Falls back to the heuristic
 * result on any LLM error (reported through `onLlmError`).
 */
export async function refineWithLlm(
  doc: Document,
  candidates: Candidate[],
  backend: ResolvedBackend,
  opts: DetectOptions = {},
): Promise<FeedDescriptor[]> {
  const heuristic: Refined[] = candidates.map((c) => ({
    d: descriptorFromCandidate(c, 'heuristic'),
    first: c.container,
  }));
  const top = candidates.slice(0, opts.llmTopK ?? 5);
  if (top.length === 0) return heuristic.map((h) => h.d);
  const req: DetectRequest = {
    task: 'detect',
    skeleton: buildSkeleton(top, { maxChars: opts.maxSkeletonChars ?? 12000 }),
    candidates: top.map((c, index) => ({
      index,
      container: heuristic[index]?.d.container.value ?? '',
      item: heuristic[index]?.d.item.value ?? '',
      count: c.items.length,
    })),
  };
  let res: DetectResponse;
  try {
    res = await backend(req, { signal: opts.signal });
  } catch (e) {
    opts.onLlmError?.(toFeedDetectorError(e, 'LLM_UNAVAILABLE'));
    return heuristic.map((h) => h.d);
  }
  const refined: Refined[] = [];
  for (const feed of res.feeds) {
    const r = validateFeed(doc, feed, candidates, opts.minItems ?? 3);
    if (r && !refined.some((x) => x.d.id === r.d.id || x.first === r.first)) refined.push(r);
  }
  const merged = [
    ...refined,
    ...heuristic.filter((h) => !refined.some((r) => r.first === h.first)),
  ];
  merged.sort((a, b) => b.d.confidence - a.d.confidence || compareDocumentOrder(a.first, b.first));
  return merged.map((m) => m.d);
}
