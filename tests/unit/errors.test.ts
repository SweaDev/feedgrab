import { expect, test } from 'bun:test';
import { FeedgrabError, toFeedgrabError } from '../../src/errors';

test('FeedgrabError carries code and details', () => {
  const e = new FeedgrabError('NO_MATCH', 'nothing', { selector: '.x' });
  expect(e).toBeInstanceOf(FeedgrabError);
  expect(e).toBeInstanceOf(Error);
  expect(e.name).toBe('FeedgrabError');
  expect(e.code).toBe('NO_MATCH');
  expect(e.message).toBe('nothing');
  expect(e.details).toEqual({ selector: '.x' });
});

test('message defaults to code; toFeedgrabError wraps', () => {
  expect(new FeedgrabError('DISPOSED').message).toBe('DISPOSED');
  const wrapped = toFeedgrabError(new Error('boom'), 'LLM_UNAVAILABLE');
  expect(wrapped.code).toBe('LLM_UNAVAILABLE');
  expect(wrapped.message).toBe('boom');
  const same = new FeedgrabError('DISPOSED');
  expect(toFeedgrabError(same, 'LLM_UNAVAILABLE')).toBe(same);
});
