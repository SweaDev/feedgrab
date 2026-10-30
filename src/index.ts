export { detectFeeds } from './detect/detect';
export { detectFromSelector, inspectFromElement } from './detect/inspect';
export type { ErrorCode } from './errors';
export { FeedDetectorError } from './errors';
export type * from './llm/contract';
export { createLlmProxy } from './llm/proxy';
export { matchProfile } from './profile/match';
export { createProfile, parseProfile, serializeProfile } from './profile/profile';
export { CURRENT_PROFILE_VERSION } from './profile/schema';
export { matchSelector, validateSelector } from './selector/match';
export type { XPathEngine } from './selector/xpath';
export { registerXPathEngine } from './selector/xpath';
export type * from './types';

/** Library version. */
export const VERSION = '0.1.0';
