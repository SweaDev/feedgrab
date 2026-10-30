import { Window } from 'happy-dom';
import * as xpath from 'xpath';
import { PARSED_DOCUMENT } from './env/dom';
import { getXPathEngine, registerXPathEngine, type XPathEngine } from './selector/xpath';

const xpathEngine: XPathEngine = (expr, contextNode) => {
  // isHtml: match HTML element names case-insensitively, ignoring the XHTML namespace.
  return xpath
    .parse(expr)
    .select({ node: contextNode as never, isHtml: true }) as unknown as Node[];
};

function nativeXPathWorks(doc: Document): boolean {
  if (typeof doc.evaluate !== 'function') return false;
  try {
    const r = doc.evaluate('//body', doc, null, 7, null);
    return r.snapshotLength === 1;
  } catch {
    return false;
  }
}

/**
 * Parses HTML into a standalone `Document` (happy-dom), without running scripts or loading resources.
 * The document is tagged so `openFeed` defaults to `live: false`.
 * @example
 * const doc = parseHtml(await (await fetch(url)).text(), url);
 */
export function parseHtml(html: string, url = 'about:blank'): Document {
  const window = new Window({
    url,
    settings: {
      disableJavaScriptFileLoading: true,
      disableComputedStyleRendering: true,
      navigator: { userAgent: 'feed-detector' },
    },
  });
  const doc = window.document as unknown as Document;
  doc.write(html);
  (doc as unknown as Record<symbol, unknown>)[PARSED_DOCUMENT] = true;
  if (!getXPathEngine() && !nativeXPathWorks(doc)) registerXPathEngine(xpathEngine);
  return doc;
}

/** Closes the happy-dom window behind a parsed document. Errors are swallowed. */
export function disposeDocument(doc: Document): void {
  try {
    const win = doc.defaultView as unknown as { happyDOM?: { close(): Promise<void> } } | null;
    void win?.happyDOM?.close().catch(() => {});
  } catch {
    // ignore
  }
}
