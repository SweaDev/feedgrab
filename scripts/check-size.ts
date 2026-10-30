import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const LIMIT_KB = 120;
const file = join(import.meta.dir, '..', 'dist', 'browser.global.js');
const kb = statSync(file).size / 1024;
if (kb > LIMIT_KB) {
  console.error(`browser.global.js is ${kb.toFixed(1)} KB (limit ${LIMIT_KB} KB)`);
  process.exit(1);
}
// Chrome refuses extension/injected files with noncharacters or lone surrogates.
if (
  /[￾￿]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(
    readFileSync(file, 'utf8'),
  )
) {
  console.error('browser.global.js contains noncharacters or lone surrogates');
  process.exit(1);
}
console.log(`browser.global.js: ${kb.toFixed(1)} KB (limit ${LIMIT_KB} KB)`);
