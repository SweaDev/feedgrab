import { rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { BunPlugin } from 'bun';
import pkg from '../package.json';

const root = join(import.meta.dir, '..');
const dist = join(root, 'dist');

rmSync(dist, { recursive: true, force: true });

const external = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
].flatMap((name) => [name, `${name}/*`]);

const esm = await Bun.build({
  entrypoints: [
    'src/index.ts',
    'src/overlay/index.ts',
    'src/server.ts',
    'src/llm/index.ts',
    'src/llm/providers.ts',
  ].map((p) => join(root, p)),
  outdir: dist,
  root: join(root, 'src'),
  format: 'esm',
  target: 'browser',
  splitting: true,
  sourcemap: 'linked',
  external,
});
if (!esm.success) {
  for (const log of esm.logs) console.error(log);
  process.exit(1);
}

const stubRunModel: BunPlugin = {
  name: 'stub-run-model',
  setup(build) {
    build.onResolve({ filter: /run-model$/ }, () => ({
      path: join(root, 'src/llm/run-model.stub.ts'),
    }));
  },
};

const iife = await Bun.build({
  entrypoints: [join(root, 'src/browser.ts')],
  outdir: dist,
  naming: 'browser.global.js',
  format: 'iife',
  minify: true,
  target: 'browser',
  plugins: [stubRunModel],
});
if (!iife.success) {
  for (const log of iife.logs) console.error(log);
  process.exit(1);
}

const tsc = Bun.spawnSync(['bunx', 'tsc', '-p', 'tsconfig.build.json'], {
  cwd: root,
  stdout: 'inherit',
  stderr: 'inherit',
});
if (tsc.exitCode !== 0) process.exit(tsc.exitCode ?? 1);

for (const out of [...esm.outputs, ...iife.outputs]) {
  if (out.kind === 'sourcemap') continue;
  const rel = out.path.slice(root.length + 1);
  console.log(`${rel.padEnd(36)} ${(statSync(out.path).size / 1024).toFixed(1)} KB`);
}
