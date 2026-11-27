import type { ContentKind, FeedContentType } from '../types';
import type { FoundMedia } from './media';
import { FEED_KIND_SHARE, IMAGE_MAX_TEXT, KIND_CONFIDENCE } from './score';

const round = (n: number) => Math.round(n * 1e4) / 1e4;

/** The order kinds are listed in (and ties are broken by). */
export const CONTENT_KINDS: readonly ContentKind[] = ['post', 'image', 'video', 'audio', 'pdf'];

/** Signals that decide an item's kind. */
export type KindSignals = { media: FoundMedia | null; images: number; textLength: number };

/** An item's kind and how sure it is: media > image-dominant with little text > post. */
export function itemKind(s: KindSignals): { kind: ContentKind; confidence: number } {
  if (s.media) return { kind: s.media.media.kind, confidence: KIND_CONFIDENCE[s.media.via] };
  if (s.images > 0 && s.textLength <= IMAGE_MAX_TEXT)
    return { kind: 'image', confidence: KIND_CONFIDENCE.image };
  return { kind: 'post', confidence: KIND_CONFIDENCE.post };
}

/** Share of each kind among items, and the feed's type (`mixed` when none reaches the threshold). */
export function feedType(kinds: readonly ContentKind[]): {
  type: FeedContentType;
  kinds: Record<ContentKind, number>;
} {
  const shares = Object.fromEntries(CONTENT_KINDS.map((k) => [k, 0])) as Record<
    ContentKind,
    number
  >;
  if (!kinds.length) return { type: 'post', kinds: shares };
  for (const k of kinds) shares[k] += 1;
  for (const k of CONTENT_KINDS) shares[k] = round(shares[k] / kinds.length);
  let best: ContentKind = 'post';
  for (const k of CONTENT_KINDS) if (shares[k] > shares[best]) best = k;
  return { type: shares[best] >= FEED_KIND_SHARE ? best : 'mixed', kinds: shares };
}
