type Child = Node | string | number | null | undefined | false | Child[];
type Props = Record<string, unknown> | null;

function append(el: Element, child: Child): void {
  if (child === null || child === undefined || child === false) return;
  if (Array.isArray(child)) {
    for (const c of child) append(el, c);
    return;
  }
  if (typeof child === 'string' || typeof child === 'number') {
    el.appendChild(el.ownerDocument.createTextNode(String(child)));
    return;
  }
  el.appendChild(child);
}

/** Tiny hyperscript: attributes, `on<event>` listeners, `value`/`checked` properties. */
export function h<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  props?: Props,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = doc.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === 'value' || key === 'checked') {
      (el as unknown as Record<string, unknown>)[key] = value;
    } else {
      el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  for (const c of children) append(el, c);
  return el;
}
