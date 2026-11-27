import { feedType } from '../content/kind';
import { selectorCandidates } from '../detect/structure';
import { checkDescriptor } from '../feed/check';
import { generateSelector } from '../selector/generate';
import type {
  FeedDescription,
  FeedDescriptor,
  FieldCandidate,
  FieldName,
  FieldRule,
  FieldSummary,
  ItemContent,
} from '../types';
import { extractContent } from './extract';
import { AUTHOR, DESCRIPTION, HEADING, readField, URL_FIELDS } from './fields';
import { parseDuration } from './media';
import { resolveProvider } from './providers';
import { absoluteUrl } from './url';

const round = (n: number) => Math.round(n * 1e4) / 1e4;

/** Every attribute a field rule can locate, in report order. */
export const FIELD_NAMES: readonly FieldName[] = [
  'title',
  'text',
  'html',
  'author',
  'publishedAt',
  'image',
  'mediaUrl',
  'embedUrl',
  'poster',
  'duration',
];

/** The value of one attribute in an item's content, as a string (undefined when it has none). */
export function contentField(c: ItemContent, field: FieldName): string | undefined {
  switch (field) {
    case 'image':
      return c.images[0]?.src;
    case 'mediaUrl':
      return c.media?.url;
    case 'embedUrl':
      return c.media?.embedUrl;
    case 'poster':
      return c.media?.poster;
    case 'duration':
      return c.media?.duration === undefined ? undefined : String(c.media.duration);
    default:
      return c[field];
  }
}

/** Elements of an item that may hold each attribute. */
const SOURCES: Record<FieldName, string> = {
  title: `${HEADING}, [itemprop="headline"], [itemprop="name"], figcaption, a[href]`,
  text: DESCRIPTION,
  html: DESCRIPTION,
  author: `${AUTHOR.join(', ')}, a[href]`,
  publishedAt: 'time[datetime], [itemprop="datePublished"]',
  image: 'img',
  mediaUrl: 'video, audio, source[src], a[href], embed[src], object[data]',
  embedUrl: 'iframe[src], a[href]',
  poster: 'video[poster], img',
  duration: '[itemprop="duration"], time, span, div, b, small',
};

/** The rule that reads `field` from `el`: its attribute for URLs and dates, else its text. */
function ruleFor(field: FieldName, el: Element, selector: string): FieldRule {
  const sel = { type: 'css' as const, value: selector };
  if (field === 'html') return { selector: sel, source: 'html' };
  const tag = el.localName;
  const attr =
    field === 'poster' && tag === 'video'
      ? 'poster'
      : URL_FIELDS.has(field)
        ? (['src', 'href', 'data', 'content'].find((a) => el.hasAttribute(a)) ?? 'src')
        : field === 'publishedAt' || (field === 'duration' && el.hasAttribute('datetime'))
          ? el.hasAttribute('datetime')
            ? 'datetime'
            : 'content'
          : field === 'duration' && el.hasAttribute('content')
            ? 'content'
            : undefined;
  return attr ? { selector: sel, source: 'attr', attr } : { selector: sel };
}

/** Whether `el` can hold `field` at all (a link to a page is no media URL, a long text no duration). */
function plausible(field: FieldName, el: Element, base: string): boolean {
  if (field === 'mediaUrl' || field === 'embedUrl') {
    const raw = el.getAttribute('src') ?? el.getAttribute('href') ?? el.getAttribute('data');
    const url = absoluteUrl(raw, base);
    if (!url) return el.localName === 'video' || el.localName === 'audio';
    const p = resolveProvider(url);
    return field === 'mediaUrl'
      ? p?.provider === 'file' || el.localName !== 'a'
      : !!p && p.provider !== 'file';
  }
  if (field === 'duration') {
    if (el.children.length && !el.hasAttribute('datetime') && !el.hasAttribute('content'))
      return false;
    return !!parseDuration(
      el.getAttribute('datetime') ?? el.getAttribute('content') ?? el.textContent,
    );
  }
  return true;
}

function coverage(items: Element[], field: FieldName, rule: FieldRule, base: string): number {
  if (!items.length) return 0;
  return round(
    items.filter((it) => readField(it, field, rule, base) !== undefined).length / items.length,
  );
}

/**
 * The best way to read `field` from element `el` of item `root` across `items`: among the
 * selectors whose first match in `root` is `el`, the one that finds a value in the most items
 * (more specific first on ties). Null when `el` can't hold the field.
 */
export function fieldRuleFor(
  field: FieldName,
  el: Element,
  root: Element,
  items: Element[],
  baseUrl: string,
): FieldCandidate | null {
  if (!root.contains(el) || !plausible(field, el, baseUrl)) return null;
  const pool = items.length ? items : [root];
  const options = [...selectorCandidates(root, el), generateSelector(el, { root }).value];
  let best: FieldCandidate | null = null;
  const seen = new Set<string>();
  for (const value of options) {
    if (seen.has(value)) continue;
    seen.add(value);
    let first: Element | null = null;
    try {
      first = root.querySelector(value);
    } catch {}
    if (first !== el) continue;
    const rule = ruleFor(field, el, value);
    const read = readField(root, field, rule, baseUrl);
    if (read === undefined) continue;
    const cov = coverage(pool, field, rule, baseUrl);
    if (!best || cov > best.coverage) best = { field, rule, coverage: cov, value: read };
  }
  return best;
}

/**
 * Candidate field rules for each attribute of a reference item (default the first), ranked by
 * how many items they find a value in, then by whether they read what the heuristics read, then
 * document order. At most `max` (3) per field. For a picker that lets the user change an
 * attribute's source.
 */
export function suggestFields(
  items: Element[],
  opts: { baseUrl: string; reference?: Element; max?: number },
): Partial<Record<FieldName, FieldCandidate[]>> {
  const root = opts.reference ?? items[0];
  if (!root) return {};
  const max = opts.max ?? 3;
  const heuristic = extractContent(root, { baseUrl: opts.baseUrl });
  const out: Partial<Record<FieldName, FieldCandidate[]>> = {};
  for (const field of FIELD_NAMES) {
    if (field === 'html') continue;
    const expected = contentField(heuristic, field);
    const found: (FieldCandidate & { order: number; same: boolean })[] = [];
    const seen = new Set<string>();
    Array.from(root.querySelectorAll(SOURCES[field])).forEach((el, order) => {
      const c = fieldRuleFor(field, el, root, items, opts.baseUrl);
      if (!c || seen.has(c.rule.selector.value)) return;
      seen.add(c.rule.selector.value);
      found.push({ ...c, order, same: c.value === expected });
    });
    const ranked = found
      .sort(
        (a, b) => b.coverage - a.coverage || Number(b.same) - Number(a.same) || a.order - b.order,
      )
      .slice(0, max)
      .map(({ order: _, same: __, ...c }) => c);
    if (ranked.length) out[field] = ranked;
  }
  return out;
}

/**
 * Describes what a feed holds: its content type, the share of each kind, and per attribute the
 * reference item's value and how many items have one. The reference is `reference` when it is
 * one of the items, else the first. Read-only; for a picker showing what will be grabbed.
 */
export function describeFeed(
  doc: Document,
  descriptor: FeedDescriptor,
  opts: { baseUrl?: string; reference?: Element } = {},
): FeedDescription {
  const check = checkDescriptor(doc, descriptor, { baseUrl: opts.baseUrl ?? doc.URL });
  const contents = check.items.map((i) => i.content());
  const ref = opts.reference ? check.items.findIndex((i) => i.element === opts.reference) : -1;
  const reference = ref >= 0 ? ref : contents.length ? 0 : -1;
  const declared = descriptor.content?.type;
  // A declared single kind sets every item's kind; read the items' own signals separately.
  const own =
    declared && declared !== 'mixed' && descriptor.content
      ? checkDescriptor(
          doc,
          { ...descriptor, content: { ...descriptor.content, type: 'mixed' } },
          {
            baseUrl: opts.baseUrl ?? doc.URL,
          },
        ).items.map((i) => i.content().kind)
      : contents.map((c) => c.kind);
  const sensed = feedType(own);
  const fields: FieldSummary[] = FIELD_NAMES.map((field) => {
    const have = contents.filter((c) => contentField(c, field) !== undefined).length;
    const value =
      reference >= 0 ? contentField(contents[reference] as ItemContent, field) : undefined;
    const s: FieldSummary = {
      field,
      coverage: contents.length ? round(have / contents.length) : 0,
      ruled: !!descriptor.content?.fields?.[field],
    };
    if (value !== undefined) s.value = value;
    return s;
  });
  return {
    type: declared ?? sensed.type,
    detected: sensed.type,
    kinds: sensed.kinds,
    fields,
    items: contents.length,
    reference,
  };
}
