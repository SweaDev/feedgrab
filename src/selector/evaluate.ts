import { isElement } from '../env/dom';
import { FeedgrabError } from '../errors';
import type { FeedDescriptor, Selector } from '../types';
import { getXPathEngine } from './xpath';

function ownerDocument(context: Document | Element): Document {
  return context.nodeType === 9 ? (context as Document) : (context as Element).ownerDocument;
}

function evaluateXPath(value: string, context: Document | Element): Node[] {
  const doc = ownerDocument(context);
  if (typeof doc.evaluate === 'function') {
    const r = doc.evaluate(value, context, null, 7, null);
    const out: Node[] = [];
    for (let i = 0; i < r.snapshotLength; i++) {
      const n = r.snapshotItem(i);
      if (n) out.push(n);
    }
    return out;
  }
  const engine = getXPathEngine();
  if (!engine) {
    throw new FeedgrabError('XPATH_UNSUPPORTED', 'No XPath support in this document', {
      selector: value,
    });
  }
  return engine(value, context);
}

/**
 * Evaluates a CSS or XPath selector against a document or element. Returns elements only.
 * Throws `INVALID_SELECTOR` on a syntax error and `XPATH_UNSUPPORTED` when XPath is unavailable.
 */
export function evaluateSelector(sel: Selector, context: Document | Element): Element[] {
  try {
    if (sel.type === 'css') return Array.from(context.querySelectorAll(sel.value));
    return evaluateXPath(sel.value, context).filter(isElement);
  } catch (e) {
    if (e instanceof FeedgrabError) throw e;
    throw new FeedgrabError('INVALID_SELECTOR', `Invalid ${sel.type} selector: ${sel.value}`, {
      selector: sel,
      cause: e,
    });
  }
}

/** All containers of a feed (a container selector may match several elements). */
export function resolveContainers(doc: Document, d: Pick<FeedDescriptor, 'container'>): Element[] {
  return evaluateSelector(d.container, doc);
}

/** Items of one container; non-descendants of the container are dropped. */
export function resolveItems(container: Element, d: Pick<FeedDescriptor, 'item'>): Element[] {
  return evaluateSelector(d.item, container).filter(
    (el) => el !== container && container.contains(el),
  );
}
