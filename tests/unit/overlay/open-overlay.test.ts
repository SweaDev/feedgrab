import { expect, test } from 'bun:test';
import type { FeedgrabError } from '../../../src/errors';
import { openOverlay } from '../../../src/overlay/index';
import { loadFixture } from '../../helpers/dom';
import { domSnapshot } from '../../helpers/snapshot';

test('openOverlay rejects with OVERLAY_NO_LAYOUT in happy-dom', async () => {
  const doc = loadFixture('social-feed');
  const before = domSnapshot(doc);
  const e = (await openOverlay(doc, []).catch((x) => x)) as FeedgrabError;
  expect(e.code).toBe('OVERLAY_NO_LAYOUT');
  expect(doc.querySelector('[data-feedgrab-overlay]')).toBeNull();
  expect(domSnapshot(doc)).toBe(before);
});
