/** Evaluates an XPath expression against a context node (fallback when `doc.evaluate` is missing). */
export type XPathEngine = (expr: string, contextNode: Node) => Node[];

let engine: XPathEngine | null = null;

/** Registers the XPath engine used when a document has no native `evaluate`. */
export function registerXPathEngine(e: XPathEngine | null): void {
  engine = e;
}

/** The registered XPath engine, if any. */
export function getXPathEngine(): XPathEngine | null {
  return engine;
}
