import type { Selector } from '../types';

/** `[ids, classes/attributes/pseudo-classes, types/pseudo-elements]`. */
export type Specificity = [number, number, number];

const LEGACY_PSEUDO_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter']);

function splitTopLevel(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === sep && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out.map((x) => x.trim()).filter(Boolean);
}

// Non-ASCII counts as an identifier character. Checked by code unit: a regex range ending in the
// U+FFFF noncharacter ends up raw in bundles, which Chrome rejects as non-UTF-8 in extension files.
const isIdentChar = (ch: string) => /[-\w]/.test(ch) || ch.charCodeAt(0) >= 0x80;

function readIdent(s: string, i: number): number {
  while (i < s.length) {
    const ch = s[i] as string;
    if (ch === '\\') i += 2;
    else if (isIdentChar(ch)) i++;
    else break;
  }
  return i;
}

function closing(s: string, i: number, open: string, close: string): number {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === open) depth++;
    else if (s[j] === close && --depth === 0) return j;
  }
  return s.length - 1;
}

function add(a: Specificity, b: Specificity): Specificity {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function complexSpecificity(s: string): Specificity {
  let spec: Specificity = [0, 0, 0];
  let i = 0;
  while (i < s.length) {
    const ch = s[i] as string;
    if (ch === '#') {
      spec[0]++;
      i = readIdent(s, i + 1);
    } else if (ch === '.') {
      spec[1]++;
      i = readIdent(s, i + 1);
    } else if (ch === '[') {
      spec[1]++;
      i = closing(s, i, '[', ']') + 1;
    } else if (ch === ':') {
      const element = s[i + 1] === ':';
      const start = i + (element ? 2 : 1);
      const end = readIdent(s, start);
      const name = s.slice(start, end).toLowerCase();
      let arg = '';
      i = end;
      if (s[i] === '(') {
        const close = closing(s, i, '(', ')');
        arg = s.slice(i + 1, close);
        i = close + 1;
      }
      if (element || LEGACY_PSEUDO_ELEMENTS.has(name)) spec[2]++;
      else if (name === 'where') {
        // zero specificity
      } else if (name === 'is' || name === 'not' || name === 'has' || name === 'matches') {
        spec = add(spec, cssSpecificity(arg));
      } else spec[1]++;
    } else if (/[a-zA-Z_-]/.test(ch) || ch.charCodeAt(0) >= 0x80) {
      spec[2]++;
      i = readIdent(s, i);
    } else i++;
  }
  return spec;
}

/** Specificity of a CSS selector; selector lists take the max. */
export function cssSpecificity(selector: string): Specificity {
  let best: Specificity = [0, 0, 0];
  for (const part of splitTopLevel(selector, ',')) {
    const s = complexSpecificity(part);
    if (compareSpecificity(s, best) > 0) best = s;
  }
  return best;
}

/** `[0, predicates + attribute tests, steps]` for an XPath expression. */
export function xpathSpecificity(expr: string): Specificity {
  const predicates = (expr.match(/\[/g) ?? []).length;
  const attrs = (expr.match(/@/g) ?? []).length;
  let outer = '';
  let depth = 0;
  for (const ch of expr) {
    if (ch === '[') depth++;
    else if (ch === ']') depth--;
    else if (depth === 0) outer += ch;
  }
  const steps = outer.split('/').filter((s) => s.trim() && s.trim() !== '.').length;
  return [0, predicates + attrs, steps];
}

/** Specificity of a `Selector`. */
export function selectorSpecificity(sel: Selector): Specificity {
  return sel.type === 'css' ? cssSpecificity(sel.value) : xpathSpecificity(sel.value);
}

/** Lexicographic comparison (> 0 when `a` is more specific). */
export function compareSpecificity(a: Specificity, b: Specificity): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}
