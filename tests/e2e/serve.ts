import { join, normalize } from 'node:path';

const root = join(import.meta.dir, '..', 'fixtures');
const port = Number(process.env.FD_E2E_PORT ?? 4599);

Bun.serve({
  port,
  async fetch(req) {
    const path = normalize(decodeURIComponent(new URL(req.url).pathname)).replace(/^\/+/, '');
    if (path.includes('..')) return new Response('forbidden', { status: 403 });
    const file = Bun.file(join(root, path || 'index.html'));
    return (await file.exists()) ? new Response(file) : new Response('not found', { status: 404 });
  },
});
console.log(`fixtures on http://localhost:${port}`);
