import { z } from 'zod';

export const DetectRequestSchema = z.object({
  task: z.literal('detect'),
  skeleton: z.string(),
  candidates: z.array(
    z.object({
      index: z.number().int().min(0),
      container: z.string(),
      item: z.string(),
      count: z.number().int().min(0),
    }),
  ),
});

export const ClassifyRequestSchema = z.object({
  task: z.literal('classify'),
  criteria: z.array(z.string().min(1)).min(1),
  items: z.array(z.object({ id: z.string(), text: z.string() })),
});

export const LlmRequestSchema = z.discriminatedUnion('task', [
  DetectRequestSchema,
  ClassifyRequestSchema,
]);

export const DetectResponseSchema = z.object({
  feeds: z.array(
    z.object({
      candidateIndex: z.number().int().min(0).optional(),
      containerSelector: z.string(),
      itemSelector: z.string(),
      exclusions: z.array(z.object({ selector: z.string(), scope: z.enum(['item', 'part']) })),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

export const ClassifyResponseSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      exclude: z.boolean(),
      criteriaIndex: z.number().int().min(0).optional(),
      confidence: z.number().min(0).max(1),
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
export function responseSchemaFor<T extends LlmTask>(task: T): z.ZodType<ResponseFor<T>> {
  return (task === 'detect'
    ? DetectResponseSchema
    : ClassifyResponseSchema) as unknown as z.ZodType<ResponseFor<T>>;
}
