/** Serialized DOM without the overlay host, for read-only checks. */
export function domSnapshot(doc: Document): string {
  const clone = doc.documentElement.cloneNode(true) as Element;
  for (const host of Array.from(clone.querySelectorAll('[data-feed-detector-overlay]'))) {
    host.remove();
  }
  return clone.outerHTML;
}
