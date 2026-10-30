import { describe, expect, test } from 'bun:test';
import { type EvaluationContext, evaluateItem } from '../../../src/exclude/engine';
import type { FeedDescriptor, Rule, SelectorRule } from '../../../src/types';
import { loadFixture } from '../../helpers/dom';

const doc = loadFixture('social-feed');
const posts = Array.from(doc.querySelectorAll('article.post'));

const sel = (
  value: string,
  scope: 'item' | 'part' = 'item',
  origin?: 'user' | 'llm',
): SelectorRule => ({
  kind: 'selector',
  selector: { type: 'css', value },
  scope,
  ...(origin ? { origin } : {}),
});

function ctx(
  exclude: Rule[] = [],
  include: Rule[] = [],
  extra: Partial<EvaluationContext> = {},
): EvaluationContext {
  const descriptor: FeedDescriptor = {
    id: 'fd_test',
    container: { type: 'css', value: '.timeline' },
    item: { type: 'css', value: ':scope > article' },
    exclude,
    include,
    source: 'manual',
    confidence: 1,
    confirmed: true,
  };
  return { descriptor, builtins: true, dominantSig: 'article.post', ...extra };
}

describe('precedence', () => {
  test('builtin exclude beaten by a user include → kept with rescuedBy', () => {
    const r = evaluateItem(posts[3]!, ctx([], [sel('article')]));
    expect(r.status).toBe('kept');
    expect(r.rescuedBy?.origin).toBe('user');
    expect(r.rescuedBy?.ruleId).toMatch(/^r_/);
  });

  test('user exclude .post.promoted beats user include .post', () => {
    const r = evaluateItem(posts[7]!, ctx([sel('.post.promoted')], [sel('.post')]));
    expect(r.status).toBe('excluded');
    expect(r.reasons[0]!.origin).toBe('user');
    expect(r.reasons.map((x) => x.origin)).toEqual(['user', 'builtin']);
  });

  test('equal specificity: include beats exclude', () => {
    const r = evaluateItem(posts[0]!, ctx([sel('.post')], [sel('.post')]));
    expect(r.status).toBe('kept');
    expect(r.rescuedBy).toBeDefined();
  });

  test('a user include (rank 3) beats an llm-proposed exclude (rank 2) of higher specificity', () => {
    const exclude = [sel('#nope, .post.x, article.post', 'item', 'llm')];
    expect(evaluateItem(posts[0]!, ctx(exclude)).reasons[0]!.origin).toBe('llm');
    expect(evaluateItem(posts[0]!, ctx(exclude, [sel('p')])).status).toBe('kept');
  });

  test('signature outlier', () => {
    const r = evaluateItem(posts[0]!, ctx([], [], { dominantSig: 'div.card' }));
    expect(r.status).toBe('excluded');
    expect(r.reasons).toEqual([
      { ruleId: 'b_outlier', origin: 'builtin', kind: 'signature-outlier' },
    ]);
    expect(
      evaluateItem(posts[0]!, ctx([], [], { dominantSig: 'div.card', builtins: false })).status,
    ).toBe('kept');
  });

  test('builtins on: posts 4 and 8 excluded with builtin reasons', () => {
    expect(evaluateItem(posts[3]!, ctx()).reasons[0]!.ruleId).toBe('b_data_ad');
    expect(evaluateItem(posts[7]!, ctx()).reasons[0]!.ruleId).toBe('b_ad_class');
    expect(evaluateItem(posts[0]!, ctx()).status).toBe('kept');
  });
});

describe('llm text rules', () => {
  const llm: Rule = { kind: 'llm-text', criteria: 'sponsored posts' };

  test('no verdict → pending and needsLlm', () => {
    const r = evaluateItem(posts[9]!, ctx([llm]));
    expect(r).toMatchObject({ status: 'pending', needsLlm: true });
    const p = evaluateItem(posts[9]!, ctx([llm], [], { llmVerdict: () => 'pending' }));
    expect(p).toMatchObject({ status: 'pending', needsLlm: false });
  });

  test('exclude verdict → excluded with criteria and confidence', () => {
    const r = evaluateItem(
      posts[9]!,
      ctx([llm], [], { llmVerdict: () => ({ exclude: true, criteriaIndex: 0, confidence: 0.9 }) }),
    );
    expect(r.status).toBe('excluded');
    expect(r.reasons[0]).toMatchObject({
      kind: 'llm-text',
      criteria: 'sponsored posts',
      confidence: 0.9,
    });
    const kept = evaluateItem(
      posts[9]!,
      ctx([llm], [], { llmVerdict: () => ({ exclude: false, confidence: 0.9 }) }),
    );
    expect(kept.status).toBe('kept');
  });

  test('builtin-excluded items never need the LLM; includes skip it too', () => {
    expect(evaluateItem(posts[3]!, ctx([llm])).needsLlm).toBe(false);
    const r = evaluateItem(posts[9]!, ctx([llm], [sel('.post')]));
    expect(r).toMatchObject({ status: 'kept', needsLlm: false });
    expect(r.rescuedBy).toBeDefined();
  });
});

test('parts and an include that rescues a part', () => {
  const post6 = posts[5]!;
  const r = evaluateItem(post6, ctx([sel('img', 'part')]));
  expect(r.status).toBe('kept');
  expect(r.parts.map((p) => [p.element.tagName, p.rule.ruleId.slice(0, 2)])).toEqual([
    ['IMG', 'r_'],
    ['IFRAME', 'b_'],
  ]);
  const rescued = evaluateItem(post6, ctx([sel('img', 'part')], [sel('iframe.embed', 'part')]));
  expect(rescued.parts.map((p) => p.element.tagName)).toEqual(['IMG']);
  const dup = evaluateItem(post6, ctx([sel('iframe', 'part')]));
  expect(dup.parts.length).toBe(1);
});
