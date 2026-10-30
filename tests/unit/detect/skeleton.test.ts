import { expect, test } from 'bun:test';
import { findCandidates } from '../../../src/detect/heuristic';
import { buildSkeleton } from '../../../src/detect/skeleton';
import { loadFixture } from '../../helpers/dom';

test('skeleton is compact, includes the outlier and is deterministic', () => {
  const cands = findCandidates(loadFixture('social-feed'));
  const s = buildSkeleton(cands);
  expect(s.startsWith('#0 container=.timeline items=12 itemSelector=:scope > article score=')).toBe(
    true,
  );
  expect(s).not.toContain('</');
  expect(s).not.toContain('href=');
  expect(s).toContain('<article .post.promoted>');
  expect(s).toContain('<p .text> "');
  expect(buildSkeleton(findCandidates(loadFixture('social-feed')))).toBe(s);
});

test('skeleton respects the budget', () => {
  const cands = findCandidates(loadFixture('two-feeds'));
  const s = buildSkeleton(cands, { maxChars: 400 });
  expect(s.endsWith('…truncated')).toBe(true);
  expect(s.length).toBeLessThanOrEqual(400 + '\n…truncated'.length);
  expect(buildSkeleton(cands).length).toBeGreaterThan(400);
});
