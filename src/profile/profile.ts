import { FeedgrabError } from '../errors';
import type { FeedDescriptor, SiteProfile } from '../types';
import { migrate } from './migrate';
import { normalizeDescriptor, stableJson } from './normalize';
import { CURRENT_PROFILE_VERSION, SiteProfileV1Schema } from './schema';

/**
 * Creates a profile for the page type of `url` (hostname + path pattern, default: the URL path).
 * @example createProfile({ url: location.href, pathPattern: '/search/*', feeds: proposals })
 */
export function createProfile(input: {
  url: string | URL;
  pathPattern?: string;
  feeds: FeedDescriptor[];
}): SiteProfile {
  const url = new globalThis.URL(String(input.url));
  return {
    version: CURRENT_PROFILE_VERSION,
    hostname: url.host.toLowerCase(),
    pathPattern: input.pathPattern ?? url.pathname,
    feeds: input.feeds.map(normalizeDescriptor),
  };
}

/** Serializes a profile as JSON with stable (sorted) keys. */
export function serializeProfile(p: SiteProfile): string {
  return stableJson({ ...p, feeds: p.feeds.map(normalizeDescriptor) });
}

/**
 * Parses, migrates and validates a serialized profile.
 * Throws `INVALID_PROFILE` (zod issues in `details.issues`) or `UNSUPPORTED_PROFILE_VERSION`.
 */
export function parseProfile(s: string): SiteProfile {
  let raw: unknown;
  try {
    raw = JSON.parse(s);
  } catch (e) {
    throw new FeedgrabError('INVALID_PROFILE', 'Profile is not valid JSON', {
      issues: [],
      cause: e,
    });
  }
  const parsed = SiteProfileV1Schema.safeParse(migrate(raw));
  if (!parsed.success) {
    throw new FeedgrabError('INVALID_PROFILE', 'Profile does not match the schema', {
      issues: parsed.error.issues,
    });
  }
  const p = parsed.data as SiteProfile;
  return { ...p, feeds: p.feeds.map(normalizeDescriptor) };
}
