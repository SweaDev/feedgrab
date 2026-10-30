import { expect, test } from 'bun:test';
import { FeedDetectorError, toFeedDetectorError } from '../../src/errors';

test('FeedDetectorError carries code and details', () => {
  const e = new FeedDetectorError('NO_MATCH', 'nothing', { selector: '.x' });
  expect(e).toBeInstanceOf(FeedDetectorError);
  expect(e).toBeInstanceOf(Error);
  expect(e.name).toBe('FeedDetectorError');
  expect(e.code).toBe('NO_MATCH');
  expect(e.message).toBe('nothing');
  expect(e.details).toEqual({ selector: '.x' });
});

test('message defaults to code; toFeedDetectorError wraps', () => {
  expect(new FeedDetectorError('DISPOSED').message).toBe('DISPOSED');
  const wrapped = toFeedDetectorError(new Error('boom'), 'LLM_UNAVAILABLE');
  expect(wrapped.code).toBe('LLM_UNAVAILABLE');
  expect(wrapped.message).toBe('boom');
  const same = new FeedDetectorError('DISPOSED');
  expect(toFeedDetectorError(same, 'LLM_UNAVAILABLE')).toBe(same);
});
