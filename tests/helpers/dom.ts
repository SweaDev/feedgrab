import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseHtml } from '../../src/server';

export const FIXTURES = join(import.meta.dir, '..', 'fixtures');

/** Parses `tests/fixtures/<name>.html`. */
export function loadFixture(name: string, url = `https://fixture.test/${name}`): Document {
  return parseHtml(readFileSync(join(FIXTURES, `${name}.html`), 'utf8'), url);
}

/** Raw fixture HTML. */
export function fixtureHtml(name: string): string {
  return readFileSync(join(FIXTURES, `${name}.html`), 'utf8');
}

export type FixtureTruth = {
  feeds: Map<string, Element>;
  items: Element[];
  excluded: Map<string, Element[]>;
  parts: Element[];
};

/** Reads the `data-fixture-*` ground truth. */
export function fixtureTruth(doc: Document): FixtureTruth {
  const feeds = new Map<string, Element>();
  for (const el of doc.querySelectorAll('[data-fixture-feed]')) {
    feeds.set(el.getAttribute('data-fixture-feed') ?? '', el);
  }
  const excluded = new Map<string, Element[]>();
  for (const el of doc.querySelectorAll('[data-fixture-excluded]')) {
    const kind = el.getAttribute('data-fixture-excluded') ?? '';
    excluded.set(kind, [...(excluded.get(kind) ?? []), el]);
  }
  return {
    feeds,
    items: Array.from(doc.querySelectorAll('[data-fixture-item]')),
    excluded,
    parts: Array.from(doc.querySelectorAll('[data-fixture-part]')),
  };
}

/** Appends an HTML fragment to `container` (parsed in a scratch document, then imported). */
export function appendFragment(container: Element, html: string): Element[] {
  const doc = container.ownerDocument;
  const scratch = doc.implementation.createHTMLDocument('');
  scratch.body.innerHTML = html;
  const added: Element[] = [];
  for (const child of Array.from(scratch.body.children)) {
    const node = doc.importNode(child, true);
    container.appendChild(node);
    added.push(node);
  }
  return added;
}
