import { Readability } from '@mozilla/readability';
import type { Article } from '../types';
import { toIsoDate } from './fields';

/**
 * The main article of a page (title, byline, content HTML and text) with Mozilla's Readability,
 * an optional peer dependency. Works on a copy, so the given document is never changed. `html` is
 * not sanitized: sanitize it before rendering. Null when the page has no readable article.
 */
export function extractArticle(doc: Document): Article | null {
  let parsed: ReturnType<Readability['parse']>;
  try {
    parsed = new Readability(doc.cloneNode(true) as Document).parse();
  } catch {
    return null;
  }
  if (!parsed?.content) return null;
  const clean = (s: string | null | undefined) => s?.replace(/\s+/g, ' ').trim() || undefined;
  const out: Article = {
    html: parsed.content,
    text: (parsed.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim(),
  };
  const title = clean(parsed.title);
  if (title) out.title = title;
  const byline = clean(parsed.byline);
  if (byline) out.byline = byline;
  const site = clean(parsed.siteName);
  if (site) out.siteName = site;
  const excerpt = clean(parsed.excerpt);
  if (excerpt) out.excerpt = excerpt;
  const published = toIsoDate(parsed.publishedTime);
  if (published) out.publishedAt = published;
  return out;
}
