import type { ClassifyRequest, DetectRequest } from './contract';

export const DETECT_SYSTEM =
  'You identify repeating content feeds in web pages. Given candidate containers and DOM skeletons, return only real content feeds (posts, results, products, articles). Prefer the given selectors; you may refine them. Item selectors are evaluated relative to the container and should start with `:scope`. Suggest exclusion selectors only for ads/promotions/injected widgets you can see in the skeleton. Respond with JSON matching the schema.';

export const CLASSIFY_SYSTEM =
  'Decide for each item whether it matches ANY of the exclusion criteria. Judge by meaning, not keywords. Return one result per item id with exclude, the index of the matched criterion, and confidence 0..1.';

/** Prompt for feed detection refinement. */
export function detectPrompt(req: DetectRequest): { system: string; prompt: string } {
  const candidates = req.candidates
    .map(
      (c) => `- candidateIndex=${c.index} container=${c.container} item=${c.item} count=${c.count}`,
    )
    .join('\n');
  return {
    system: DETECT_SYSTEM,
    prompt: `Candidates:\n${candidates}\n\nDOM skeleton:\n${req.skeleton}`,
  };
}

/** Prompt for item text classification. */
export function classifyPrompt(req: ClassifyRequest): { system: string; prompt: string } {
  const criteria = req.criteria.map((c, i) => `${i}: ${c}`).join('\n');
  const items = req.items.map((it) => `<item id="${it.id}">${it.text}</item>`).join('\n');
  return {
    system: CLASSIFY_SYSTEM,
    prompt: `Exclusion criteria (index: text):\n${criteria}\n\nItems:\n${items}`,
  };
}
