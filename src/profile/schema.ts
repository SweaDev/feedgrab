import { z } from 'zod/mini';

/** Current `SiteProfile.version`. */
export const CURRENT_PROFILE_VERSION = 1;

const nonEmpty = () => z.string().check(z.minLength(1));
const origin = () => z.optional(z.enum(['user', 'llm']));

/** zod schema for `Selector`. */
export const SelectorSchema = z.object({
  type: z.enum(['css', 'xpath']),
  value: nonEmpty(),
});

/** zod schema for `SelectorRule`. */
export const SelectorRuleSchema = z.object({
  kind: z.literal('selector'),
  selector: SelectorSchema,
  scope: z.enum(['item', 'part']),
  id: z.optional(z.string()),
  origin: origin(),
});

/** zod schema for `LlmTextRule`. */
export const LlmTextRuleSchema = z.object({
  kind: z.literal('llm-text'),
  criteria: nonEmpty(),
  id: z.optional(z.string()),
  origin: origin(),
});

/** zod schema for `Rule`. */
export const RuleSchema = z.discriminatedUnion('kind', [SelectorRuleSchema, LlmTextRuleSchema]);

/** zod schema for `FeedDescriptor`. */
export const FeedDescriptorSchema = z.object({
  id: nonEmpty(),
  container: SelectorSchema,
  item: SelectorSchema,
  exclude: z.array(RuleSchema),
  include: z.array(SelectorRuleSchema),
  source: z.enum(['heuristic', 'llm', 'inspect', 'manual']),
  confidence: z.number().check(z.gte(0), z.lte(1)),
  confirmed: z.boolean(),
});

/** zod schema for `SiteProfile v1`. */
export const SiteProfileV1Schema = z.object({
  version: z.literal(1),
  hostname: nonEmpty(),
  pathPattern: nonEmpty(),
  feeds: z.array(FeedDescriptorSchema),
  updatedAt: z.optional(z.string()),
});
