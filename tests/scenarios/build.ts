import { join } from 'node:path';

const root = join(import.meta.dir, '..', '..');
const result = await Bun.build({
  entrypoints: [join(root, 'tests/scenarios/global.ts')],
  outdir: join(root, 'dist-test'),
  naming: 'scenarios.global.js',
  format: 'iife',
  target: 'browser',
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
console.log('dist-test/scenarios.global.js');
