import { z } from 'zod';

/** Current `SiteProfile.version`. */
export const CURRENT_PROFILE_VERSION = 1;

export const SelectorSchema = z.object({
  type: z.enum(['css', 'xpath']),
  value: z.string().min(1),
});

export const SelectorRuleSchema = z.object({
  kind: z.literal('selector'),
  selector: SelectorSchema,
  scope: z.enum(['item', 'part']),
  id: z.string().optional(),
  origin: z.enum(['user', 'llm']).optional(),
});

export const LlmTextRuleSchema = z.object({
  kind: z.literal('llm-text'),
  criteria: z.string().min(1),
  id: z.string().optional(),
  origin: z.enum(['user', 'llm']).optional(),
});

export const RuleSchema = z.discriminatedUnion('kind', [SelectorRuleSchema, LlmTextRuleSchema]);

export const FeedDescriptorSchema = z.object({
  id: z.string().min(1),
  container: SelectorSchema,
  item: SelectorSchema,
  exclude: z.array(RuleSchema),
  include: z.array(SelectorRuleSchema),
  source: z.enum(['heuristic', 'llm', 'inspect', 'manual']),
  confidence: z.number().min(0).max(1),
  confirmed: z.boolean(),
});

export const SiteProfileV1Schema = z.object({
  version: z.literal(1),
  hostname: z.string().min(1),
  pathPattern: z.string().min(1),
  feeds: z.array(FeedDescriptorSchema),
  updatedAt: z.string().optional(),
});
