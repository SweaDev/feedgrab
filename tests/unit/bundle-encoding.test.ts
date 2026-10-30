import { expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Chrome rejects extension scripts containing noncharacters or lone surrogates ("isn't UTF-8
// encoded"), and minifiers emit regex range ends like U+FFFF as raw characters.
const ESCAPED = /\\u(ffff|fffe|d[89a-f][0-9a-f]{2})/i;
const RAW = /[￾￿]/;

test('sources contain no noncharacters (raw or escaped)', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
    );
  const hits = walk(join(import.meta.dir, '..', '..', 'src')).filter((file) => {
    const text = readFileSync(file, 'utf8');
    return ESCAPED.test(text) || RAW.test(text);
  });
  expect(hits).toEqual([]);
});
