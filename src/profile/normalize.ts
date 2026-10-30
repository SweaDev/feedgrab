import { hashString } from '../env/hash';
import type { FeedDescriptor, Rule } from '../types';

/** JSON with recursively sorted object keys (`undefined` values dropped). */
export function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}

/** Fills `origin` (default `'user'`) and a deterministic `id` (`r_<hash>`) when missing. */
export function normalizeRule<R extends Rule>(rule: R): R & { id: string; origin: 'user' | 'llm' } {
  const { id, ...rest } = rule;
  const withOrigin = { ...rest, origin: rule.origin ?? 'user' } as Omit<R, 'id'> & {
    origin: 'user' | 'llm';
  };
  return { ...withOrigin, id: id ?? `r_${hashString(stableJson(withOrigin))}` } as R & {
    id: string;
    origin: 'user' | 'llm';
  };
}

/** Normalizes every rule of a descriptor. */
export function normalizeDescriptor(d: FeedDescriptor): FeedDescriptor {
  return { ...d, exclude: d.exclude.map(normalizeRule), include: d.include.map(normalizeRule) };
}
