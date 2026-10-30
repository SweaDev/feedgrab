const SKIP = new Set(['SCRIPT', 'STYLE']);

function collectText(el: Element): string {
  const doc = el.ownerDocument;
  const walker = doc.createTreeWalker(el, 4);
  let out = '';
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    let skip = false;
    for (let p = n.parentNode; p && p !== el.parentNode; p = p.parentNode) {
      if (p.nodeType === 1 && SKIP.has((p as Element).tagName.toUpperCase())) {
        skip = true;
        break;
      }
    }
    if (!skip) out += ` ${n.nodeValue ?? ''}`;
  }
  return out;
}

/** Text content without scripts/styles, whitespace collapsed, trimmed and truncated to `max`. */
export function normalizeText(el: Element, max = 2000): string {
  const text = collectText(el).replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max) : text;
}

/** Length of the normalized text (untruncated). */
export function textLength(el: Element): number {
  return normalizeText(el, Number.POSITIVE_INFINITY).length;
}
