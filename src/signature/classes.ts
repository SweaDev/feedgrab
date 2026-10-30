const UNSTABLE_PATTERNS = [
  /^(css|sc|jsx|emotion|styled|chakra|mui|tw)-[a-z0-9]+$/i,
  /^[a-z]+-[a-f0-9]{5,}$/i,
  /[0-9]{3,}/,
  /^[a-zA-Z]{1,3}[0-9][a-zA-Z0-9]{3,}$/,
  /[:[\]/()!]/,
];

// `__` followed by a hash of ≥ 5 characters that contains a digit.
const BEM_HASH = /__([a-z0-9_-]{5,})$/i;
// CSS-modules style `_name_1x9ab_12`: a `_`/`-` separated segment of ≥ 5 chars mixing letters and digits.
const HASH_SEGMENT = /^(?=.*[a-z])(?=.*[0-9])[a-z0-9]{5,}$/i;

const STATE_CLASS =
  /^(is|has)-|^(active|selected|hover|focus|open|visible|hidden|show|collapsed|expanded)$/;

/** False for generated/hashed tokens (CSS-in-JS, CSS modules, Tailwind variants, ids with numbers). */
export function isStableToken(t: string): boolean {
  if (t.length > 40 || t.length < 2) return false;
  if (UNSTABLE_PATTERNS.some((re) => re.test(t))) return false;
  const bem = BEM_HASH.exec(t);
  if (bem && /[0-9]/.test(bem[1] ?? '')) return false;
  if (t.split(/[_-]/).some((seg) => HASH_SEGMENT.test(seg))) return false;
  return true;
}

/** A stable token that is not a state class (`is-active`, `selected`, …). */
export function isStableClass(c: string): boolean {
  return isStableToken(c) && !STATE_CLASS.test(c);
}

/** Sorted, unique stable classes of an element. */
export function stableClasses(el: Element): string[] {
  const out = new Set<string>();
  for (const c of Array.from(el.classList)) if (isStableClass(c)) out.add(c);
  return [...out].sort();
}
