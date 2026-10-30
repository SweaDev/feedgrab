import { z } from 'zod/mini';

const index = () => z.int().check(z.gte(0));
const confidence = () => z.number().check(z.gte(0), z.lte(1));

export const DetectRequestSchema = z.object({
  task: z.literal('detect'),
  skeleton: z.string(),
  candidates: z.array(
    z.object({
      index: index(),
      container: z.string(),
      item: z.string(),
      count: index(),
    }),
  ),
});

export const ClassifyRequestSchema = z.object({
  task: z.literal('classify'),
  criteria: z.array(z.string().check(z.minLength(1))).check(z.minLength(1)),
  items: z.array(z.object({ id: z.string(), text: z.string() })),
});

export const LlmRequestSchema = z.discriminatedUnion('task', [
  DetectRequestSchema,
  ClassifyRequestSchema,
]);

export const DetectResponseSchema = z.object({
  feeds: z.array(
    z.object({
      candidateIndex: z.optional(index()),
      containerSelector: z.string(),
      itemSelector: z.string(),
      exclusions: z.array(z.object({ selector: z.string(), scope: z.enum(['item', 'part']) })),
      confidence: confidence(),
    }),
  ),
});

export const ClassifyResponseSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      exclude: z.boolean(),
      criteriaIndex: z.optional(index()),
      confidence: confidence(),
    }),
  ),
});

export type DetectRequest = z.infer<typeof DetectRequestSchema>;
export type ClassifyRequest = z.infer<typeof ClassifyRequestSchema>;
export type LlmRequest = z.infer<typeof LlmRequestSchema>;
export type DetectResponse = z.infer<typeof DetectResponseSchema>;
export type ClassifyResponse = z.infer<typeof ClassifyResponseSchema>;
export type LlmResponse = DetectResponse | ClassifyResponse;
export type LlmTask = LlmRequest['task'];

/** Response type for a task. */
export type ResponseFor<T extends LlmTask> = T extends 'detect' ? DetectResponse : ClassifyResponse;

/** Proxy form of an LLM backend: forwards a request to a host that holds the model. */
export type LlmProxyFn = (req: LlmRequest, opts?: { signal?: AbortSignal }) => Promise<unknown>;

/** Response schema for a task. */
export function responseSchemaFor<T extends LlmTask>(task: T): z.ZodMiniType<ResponseFor<T>> {
  return (task === 'detect'
    ? DetectResponseSchema
    : ClassifyResponseSchema) as unknown as z.ZodMiniType<ResponseFor<T>>;
}
