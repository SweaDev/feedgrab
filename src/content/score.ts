/** Content-kind tuning. Change only here and log the change in `spec/NOTES-02.md`. */

/** An item with an image and at most this much text (title included) is an image item. */
export const IMAGE_MAX_TEXT = 80;

/** A kind on at least this share of a feed's items is the feed's type; otherwise `mixed`. */
export const FEED_KIND_SHARE = 0.8;

/** How sure an item's kind is, by the signal that decided it. */
export const KIND_CONFIDENCE = {
  /** The descriptor's `content.type` names one kind. */
  declared: 1,
  /** A `video`/`audio` element, or a provider player iframe. */
  element: 0.95,
  /** A link (the permalink or a thumbnail link) to a provider page or a media file. */
  link: 0.85,
  /** Image-dominant item with little text. */
  image: 0.7,
  /** Nothing media-like: text-first. */
  post: 0.6,
} as const;

/** Most images kept per item. */
export const MAX_IMAGES = 8;

/** Images whose width or height attribute is at most this many pixels are icons, not content. */
export const MIN_IMAGE_SIZE = 32;

/** Longest `text` kept for a post or image item. */
export const MAX_TEXT = 5000;

/** Longest `text` kept for a video, audio or PDF item (its description). */
export const MAX_MEDIA_TEXT = 300;

/** Items whose cleaned HTML is longer than this get no `html`. */
export const MAX_HTML = 20000;
