import { FeedDetectorError } from '../errors';
import { CURRENT_PROFILE_VERSION } from './schema';

/** `migrations[v]` upgrades a version-`v` profile to `v + 1`. Empty for v1. */
export const migrations: Record<number, (p: Record<string, unknown>) => Record<string, unknown>> =
  {};

/** Upgrades a raw profile object to the current version. */
export function migrate(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new FeedDetectorError('INVALID_PROFILE', 'Profile must be an object', { issues: [] });
  }
  let p = raw as Record<string, unknown>;
  const version = p.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new FeedDetectorError('INVALID_PROFILE', 'Profile has no valid version', {
      issues: [{ path: ['version'], message: 'Expected a positive integer' }],
    });
  }
  if (version > CURRENT_PROFILE_VERSION) {
    throw new FeedDetectorError(
      'UNSUPPORTED_PROFILE_VERSION',
      `Profile version ${version} is newer than supported (${CURRENT_PROFILE_VERSION})`,
      { version },
    );
  }
  for (let v = version; v < CURRENT_PROFILE_VERSION; v++) {
    const step = migrations[v];
    if (!step)
      throw new FeedDetectorError('UNSUPPORTED_PROFILE_VERSION', `No migration from v${v}`);
    p = { ...step(p), version: v + 1 };
  }
  return p;
}
