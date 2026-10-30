import type { DetectOptions, FeedDescriptor } from '../types';
import { descriptorFromCandidate } from './descriptor';
import { findCandidates } from './heuristic';

/**
 * Proposes feeds for a document: the heuristic pass, then an optional LLM refinement.
 * Never throws because of the LLM (errors go to `onLlmError`).
 * @example
 * const proposals = await detectFeeds(document);
 * proposals[0].container // { type: 'css', value: '.timeline' }
 */
export async function detectFeeds(
  doc: Document,
  opts: DetectOptions = {},
): Promise<FeedDescriptor[]> {
  const candidates = findCandidates(doc, opts);
  const seen = new Set<string>();
  const descriptors: FeedDescriptor[] = [];
  for (const c of candidates) {
    const d = descriptorFromCandidate(c, 'heuristic');
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    descriptors.push(d);
  }
  // LLM refinement seam (T17).
  return descriptors;
}
