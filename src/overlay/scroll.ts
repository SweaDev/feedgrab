/** Space left above an element scrolled to the top, below any fixed header. */
const GAP = 8;

/**
 * Bottom edge of fixed or sticky bars across the top of the viewport (a site's header), else 0.
 * Elements inside `ignore` (the overlay host) don't count.
 */
export function topInset(doc: Document, ignore?: Element): number {
  const win = doc.defaultView;
  if (!win || typeof doc.elementsFromPoint !== 'function') return 0;
  let bottom = 0;
  for (const f of [0.25, 0.5, 0.75]) {
    for (const hit of doc.elementsFromPoint(win.innerWidth * f, 1)) {
      if (ignore?.contains(hit)) continue;
      for (let n: Element | null = hit; n && n !== doc.body; n = n.parentElement) {
        if (n === doc.documentElement) break;
        const pos = win.getComputedStyle(n).position;
        if (pos !== 'fixed' && pos !== 'sticky') continue;
        const r = n.getBoundingClientRect();
        if (r.top <= 1 && r.height < win.innerHeight / 3) bottom = Math.max(bottom, r.bottom);
        break;
      }
    }
  }
  return bottom;
}

/** Scrolls `el` to the top of the viewport, below a fixed or sticky site header. */
export function scrollToTop(el: Element, ignore?: Element): void {
  el.scrollIntoView({ block: 'start' });
  const inset = topInset(el.ownerDocument, ignore);
  const off = el.getBoundingClientRect().top - inset - GAP;
  if (off < 0) el.ownerDocument.defaultView?.scrollBy(0, off);
}
