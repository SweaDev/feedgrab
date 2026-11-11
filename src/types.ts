import type { LanguageModel } from 'ai';
import type { FeedgrabError } from './errors';
import type { LlmProxyFn } from './llm/contract';

export type { LlmProxyFn } from './llm/contract';

/** A CSS or XPath selector. */
export type Selector = { type: 'css' | 'xpath'; value: string };

/** Input for `detectFromSelector`: at least one of `container` / `item`. */
export type SelectorInput = { container?: Selector; item?: Selector };

/** Where a stored rule came from. Built-in rules are never stored. */
export type RuleOrigin = 'user' | 'llm';

/** Where a match came from. */
export type MatchOrigin = 'builtin' | 'user' | 'llm';

/** A CSS/XPath rule evaluated relative to an item. */
export type SelectorRule = {
  kind: 'selector';
  selector: Selector;
  scope: 'item' | 'part';
  id?: string;
  origin?: RuleOrigin;
};

/** A plain-language rule classified by the LLM. */
export type LlmTextRule = { kind: 'llm-text'; criteria: string; id?: string; origin?: RuleOrigin };

/** An exclusion or include rule. Only selector rules are valid in `include`. */
export type Rule = SelectorRule | LlmTextRule;

/** Reference to the rule that produced a match. */
export type RuleRef = { ruleId: string; origin: MatchOrigin };

/** Serializable description of one feed. */
export type FeedDescriptor = {
  id: string;
  container: Selector;
  item: Selector;
  exclude: Rule[];
  include: Rule[];
  source: 'heuristic' | 'llm' | 'inspect' | 'manual';
  confidence: number;
  confirmed: boolean;
  /**
   * The item's permalink, relative to the item: a link, or an element inside or around one.
   * Used for item ids and `FeedItem.permalink`; the heuristic applies when it is unset or finds no link.
   */
  permalink?: Selector;
  /**
   * Query parameters that identify the item (e.g. `['v']` for YouTube's `watch?v=`). When set,
   * only these are kept in the permalink and its id (`[]` drops the query string); when unset,
   * only known tracking parameters (`utm_*`, `fbclid`, …) are removed.
   */
  permalinkParams?: string[];
  /**
   * The structure of a well-formed item, usually taken from one the user chose (see
   * `suggestStructure`). When it has required parts, items missing one are excluded (reason
   * kind `structure`) instead of being checked by the built-in signature-outlier rule.
   */
  structure?: ItemStructure;
};

/** One element of an item's structure (`FeedDescriptor.structure`). */
export type StructurePart = {
  /** Selector relative to the item; the part is present when it matches an element. */
  selector: Selector;
  /** Items without this part are excluded. Optional parts only rank items (`findReferenceItem`). */
  required: boolean;
  /** Short name for UIs, e.g. `link`, `time`, `image`. */
  label?: string;
};

/** The parts a well-formed item of a feed has. */
export type ItemStructure = { parts: StructurePart[] };

/** A part offered by `suggestStructure`. */
export type StructureCandidate = StructurePart & {
  /** Share of the items that have this part (rounded to 4 decimals). */
  coverage: number;
  /** Text, `alt` or `aria-label` of the part in the reference item, trimmed. */
  text: string;
};

/** Options for `suggestStructure`. */
export type StructureOptions = {
  /** The well-formed item to describe (default `items[0]`). */
  reference?: Element;
  /** Parts at least this share of the items have are suggested as required (default 0.7). */
  requiredCoverage?: number;
  /** Maximum number of parts (default 16). */
  maxParts?: number;
};

/** Result of `matchStructure`. */
export type StructureMatch = {
  /** True when the item has every required part. */
  ok: boolean;
  /** Required parts the item lacks. */
  missing: StructurePart[];
  /** Number of optional parts the item has. */
  optional: number;
};

/** Every feed descriptor for one page type (hostname + path pattern). */
export type SiteProfile = {
  version: number;
  hostname: string;
  pathPattern: string;
  feeds: FeedDescriptor[];
  updatedAt?: string;
};

/** Item status in the unified feed. */
export type ItemStatus = 'kept' | 'excluded' | 'pending';

/** Why an item was excluded. */
export type ExclusionMatch = {
  ruleId: string;
  origin: MatchOrigin;
  kind: 'selector' | 'llm-text' | 'signature-outlier' | 'structure';
  selector?: Selector;
  criteria?: string;
  confidence?: number;
  element?: Element;
};

/** A sub-element matched by a `part` rule. */
export type PartMatch = { element: Element; rule: RuleRef };

/** Report for one item of the unified feed. */
export interface FeedItem {
  readonly id: string;
  readonly feedId: string;
  readonly element: Element;
  readonly status: ItemStatus;
  readonly reasons: ExclusionMatch[];
  readonly parts: PartMatch[];
  /** False once the element has left the DOM. */
  readonly connected: boolean;
  /** Set when an include rule kept the item. */
  readonly rescuedBy?: RuleRef;
  /** Set for items of ingested documents. */
  readonly sourceUrl?: string;
  /** Canonical URL the id is based on; unset for text-hash ids. */
  readonly permalink?: string;
  /** Normalized text, as used for LLM classification. */
  text(): string;
}

/** A link of an item offered as its permalink by `suggestPermalinks`. */
export type PermalinkCandidate = {
  /** CSS selector relative to the item. */
  selector: Selector;
  /** Canonical URL in the reference item. */
  url: string;
  /** Link text or `aria-label`, trimmed. */
  text: string;
  /** Higher is more likely the permalink (rounded to 4 decimals). */
  score: number;
  /** Query parameters of this link across the items (see `suggestPermalinkParams`). */
  params: PermalinkParam[];
};

/** A query parameter of items' permalinks, to choose `FeedDescriptor.permalinkParams` from. */
export type PermalinkParam = {
  name: string;
  /** Value in the first permalink that has it. */
  value: string;
  /** Share of the items whose permalink has it (rounded to 4 decimals). */
  coverage: number;
  /** Distinct values per permalink that has it; 0 when fewer than 2 have it (rounded to 4 decimals). */
  uniqueness: number;
};

/** Options for `captureSample`. */
export type SampleOptions = {
  /** Items to keep (default 2). */
  items?: number;
  /** Size budget of the returned HTML in UTF-8 bytes (default 20000). */
  maxBytes?: number;
  /** Characters kept per text node (default 80). */
  maxText?: number;
  /**
   * An item that must be in the sample (default: the descriptor's `structure` reference item,
   * see `findReferenceItem`, else the first item). The other items are the first ones in order.
   */
  reference?: Element;
};

/** Options for `suggestPermalinks`. */
export type PermalinkOptions = {
  /** The item whose links are ranked (default `items[0]`). */
  reference?: Element;
};

/** A `LanguageModel` (direct) or a proxy function. */
export type LlmBackend = LanguageModel | LlmProxyFn;

/** Options for `detectFeeds`. */
export type DetectOptions = {
  minItems?: number;
  threshold?: number;
  topK?: number;
  llm?: LlmBackend;
  /** Candidates sent to the LLM (default 5). */
  llmTopK?: number;
  /** Skeleton budget (default 12000). */
  maxSkeletonChars?: number;
  signal?: AbortSignal;
  onLlmError?: (e: FeedgrabError) => void;
};

/** Tuning for the LLM text classifier. */
export type ClassifierOptions = {
  batchSize: number;
  batchDelayMs: number;
  maxConcurrent: number;
  maxItemChars: number;
  minConfidence: number;
};

/** Options for `openFeed`. */
export type FeedOptions = {
  llm?: LlmBackend;
  /** Built-in exclusion rules (default true). */
  builtinExclusions?: boolean;
  /** Default: false for `parseHtml` documents, true otherwise. */
  live?: boolean;
  /** Minimum text length for items without a permalink (default 10). */
  minItemTextLength?: number;
  /** Time a removed container may take to re-mount before `feed:lost` (default 2000). */
  lostTimeoutMs?: number;
  classifier?: Partial<ClassifierOptions>;
  /** Base URL for permalinks (default `doc.baseURI`). */
  baseUrl?: string;
};

/** Filter for `items()`. */
export type ItemsOptions = { status?: ItemStatus | ItemStatus[]; includePending?: boolean };

/** Options for `iterate()`. */
export type IterateOptions = ItemsOptions & { live?: boolean };

/** Events emitted by a `UnifiedFeed` (listener argument tuples). */
export type FeedEvents = {
  'item:added': [item: FeedItem];
  'item:updated': [item: FeedItem, prevStatus: ItemStatus];
  'item:removed': [item: FeedItem];
  'feed:lost': [info: { feedId: string }];
  'feed:error': [info: { feedId?: string; error: FeedgrabError }];
};

/** Listener for a feed event. */
export type FeedListener<E extends keyof FeedEvents> = (...args: FeedEvents[E]) => void;

/** One de-duplicated stream of items from every feed of a profile. */
export interface UnifiedFeed extends AsyncIterable<FeedItem> {
  readonly profile: SiteProfile;
  /** Synchronous snapshot in unified order. */
  items(opts?: ItemsOptions): FeedItem[];
  /** Yields current items, then new ones; each at most once. */
  iterate(opts?: IterateOptions): AsyncIterableIterator<FeedItem>;
  [Symbol.asyncIterator](): AsyncIterator<FeedItem>;
  on<E extends keyof FeedEvents>(evt: E, fn: FeedListener<E>): () => void;
  off<E extends keyof FeedEvents>(evt: E, fn: FeedListener<E>): void;
  once<E extends keyof FeedEvents>(evt: E, fn: FeedListener<E>): () => void;
  /** Runs the descriptors against a follow-up document; returns the newly added items. */
  ingest(input: Document | string, opts?: { url?: string }): FeedItem[];
  /** Stops observers and LLM work; `restore` undoes removals. */
  dispose(opts?: { restore?: boolean }): void;
}

/** Heuristic features, each normalized to [0, 1]. */
export type Features = {
  count: number;
  coverage: number;
  text: number;
  links: number;
  media: number;
  shape: number;
  depth: number;
  navPenalty: number;
  area?: number;
};

/** A heuristic feed candidate. */
export type Candidate = {
  container: Element;
  items: Element[];
  signature: string;
  score: number;
  features: Features;
};

/** Bounding box (viewport coordinates). */
export type Box = { x: number; y: number; width: number; height: number };

/** Result of `matchSelector`. `boxes` is present only when layout is available. */
export type MatchResult = { elements: Element[]; boxes?: Box[] };
