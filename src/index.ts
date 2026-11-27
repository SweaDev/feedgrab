export { type RemovalHandle, type RemovalMode, removeItem, removeParts } from './cleanup/remove';
export {
  contentField,
  describeFeed,
  FIELD_NAMES,
  fieldRuleFor,
  suggestFields,
} from './content/describe';
export type { MediaProvider, ProviderMatch } from './content/providers';
export { registerProvider, resolveProvider } from './content/providers';
export { detectFeeds } from './detect/detect';
export { detectFromSelector, inspectFromElement } from './detect/inspect';
export { suggestPermalinkParams, suggestPermalinks } from './detect/permalink';
export {
  findReferenceItem,
  matchStructure,
  partCoverage,
  partText,
  structureCoverage,
  suggestStructure,
} from './detect/structure';
export type { ErrorCode } from './errors';
export { FeedgrabError } from './errors';
export type { BuiltinRule } from './exclude/builtin';
export { BUILTIN_RULES } from './exclude/builtin';
export type { DescriptorCheck } from './feed/check';
export { checkDescriptor } from './feed/check';
export { canonicalUrl, permalinkId } from './feed/item-id';
export { captureSample } from './feed/sample';
export { openFeed } from './feed/unified-feed';
export type * from './llm/contract';
export { createLlmProxy } from './llm/proxy';
export { matchProfile } from './profile/match';
export { createProfile, parseProfile, serializeProfile } from './profile/profile';
export { CURRENT_PROFILE_VERSION } from './profile/schema';
export type { GenerateOptions } from './selector/generate';
export { generateSelector } from './selector/generate';
export { matchSelector, validateSelector } from './selector/match';
export type { XPathEngine } from './selector/xpath';
export { registerXPathEngine } from './selector/xpath';
export type * from './types';

/** Library version. */
export const VERSION = '0.6.0';
