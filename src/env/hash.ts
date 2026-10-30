/** FNV-1a 32-bit hash. */
export function fnv1a32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic short hash: FNV-1a 32 → base36, padded to 7 characters. */
export function hashString(str: string): string {
  return fnv1a32(str).toString(36).padStart(7, '0');
}
