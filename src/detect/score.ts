import { getWindow, hasLayout } from '../env/dom';
import { textLength } from '../env/text';
import { sigL2 } from '../signature/signature';
import type { Features } from '../types';

/** Feature weights (sum to 1 without layout). */
export const WEIGHTS = {
  count: 0.2,
  coverage: 0.1,
  text: 0.2,
  links: 0.15,
  media: 0.1,
  shape: 0.1,
  depth: 0.15,
  /** With layout: `score = (1 - area) * score + area * areaFeature`. */
  area: 0.15,
  /** `score *= 1 - 0.6 * navPenalty`. */
  navPenalty: 0.6,
} as const;

/** Minimum score for a candidate. */
export const THRESHOLD = 0.45;

/** Navigation-like regions whose lists are not feeds. */
export const NAV_SELECTOR =
  'nav, header, footer, [role=navigation], [role=menu], [role=menubar], [role=tablist], select, datalist';

const MEDIA_SELECTOR = 'img, picture, video, [style*="background-image"]';

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

function textScore(len: number): number {
  if (len < 15) return 0;
  if (len < 40) return (len - 15) / 25;
  if (len <= 1500) return 1;
  if (len <= 4000) return 1 - (0.5 * (len - 1500)) / 2500;
  return 0.5;
}

function links(el: Element): number {
  return (el.matches('a[href]') ? 1 : 0) + el.querySelectorAll('a[href]').length;
}

function fraction(items: Element[], pred: (el: Element) => boolean): number {
  return items.length ? items.filter(pred).length / items.length : 0;
}

/** Rounds to 4 decimals (determinism). */
export function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/** Computes the normalized features of a container + item group. */
export function computeFeatures(
  c: { container: Element; items: Element[] },
  doc: Document = c.container.ownerDocument,
): Features {
  const { container, items } = c;
  const n = items.length;
  const textLens = items.map(textLength);
  const medText = median(textLens);
  const sigs = items.map(sigL2);
  const sigCounts = new Map<string, number>();
  for (const s of sigs) sigCounts.set(s, (sigCounts.get(s) ?? 0) + 1);
  const modeCount = Math.max(0, ...sigCounts.values());

  let navPenalty = 0;
  if (container.closest(NAV_SELECTOR)) navPenalty = 1;
  else if (medText < 25 && items.every((el) => links(el) === 1)) navPenalty = 0.5;

  const f: Features = {
    count: Math.min(1, Math.log2(Math.max(n, 1)) / Math.log2(50)),
    coverage: container.children.length ? n / container.children.length : 0,
    text: textScore(medText),
    links: fraction(items, (el) => links(el) > 0),
    media: fraction(
      items,
      (el) => el.matches(MEDIA_SELECTOR) || !!el.querySelector(MEDIA_SELECTOR),
    ),
    shape: n ? modeCount / n : 0,
    depth: Math.min(1, median(items.map((el) => el.querySelectorAll('*').length)) / 8),
    navPenalty,
  };
  if (hasLayout(doc)) {
    const win = getWindow(doc);
    const viewport = (win?.innerWidth ?? 0) * (win?.innerHeight ?? 0);
    let sum = 0;
    for (const el of items) {
      const r = el.getBoundingClientRect();
      sum += r.width * r.height;
    }
    f.area = viewport > 0 ? Math.min(1, sum / viewport) : 0;
  }
  return f;
}

/** Weighted score in [0, 1], rounded to 4 decimals. */
export function scoreFeatures(f: Features, layout: boolean): number {
  let score =
    WEIGHTS.count * f.count +
    WEIGHTS.coverage * f.coverage +
    WEIGHTS.text * f.text +
    WEIGHTS.links * f.links +
    WEIGHTS.media * f.media +
    WEIGHTS.shape * f.shape +
    WEIGHTS.depth * f.depth;
  if (layout) score = (1 - WEIGHTS.area) * score + WEIGHTS.area * (f.area ?? 0);
  score *= 1 - WEIGHTS.navPenalty * f.navPenalty;
  return round4(score);
}
