/** Every error code a public API can throw. */
export type ErrorCode =
  | 'INVALID_SELECTOR'
  | 'NO_MATCH'
  | 'NO_REPEATING_ANCESTOR'
  | 'INVALID_PROFILE'
  | 'UNSUPPORTED_PROFILE_VERSION'
  | 'LLM_UNAVAILABLE'
  | 'LLM_BAD_REQUEST'
  | 'LLM_INVALID_RESPONSE'
  | 'LLM_MODEL_UNSUPPORTED_IN_BUNDLE'
  | 'LLM_CONFIG'
  | 'LLM_PROVIDER_MISSING'
  | 'OVERLAY_CANCELLED'
  | 'OVERLAY_NO_LAYOUT'
  | 'DISPOSED'
  | 'XPATH_UNSUPPORTED'
  | 'LISTENER_ERROR';

/**
 * The only error type thrown by public APIs.
 * @example
 * try { parseProfile(s) } catch (e) { if (e instanceof FeedgrabError && e.code === 'INVALID_PROFILE') … }
 */
export class FeedgrabError extends Error {
  override readonly name = 'FeedgrabError';
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, message?: string, details?: unknown) {
    super(message ?? code);
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

/** Wraps any thrown value as a `FeedgrabError` (pass-through when it already is one). */
export function toFeedgrabError(e: unknown, code: ErrorCode): FeedgrabError {
  if (e instanceof FeedgrabError) return e;
  const message = e instanceof Error ? e.message : String(e);
  return new FeedgrabError(code, message, { cause: e });
}
