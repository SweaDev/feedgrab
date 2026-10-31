import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { type BrowserContext, chromium, expect, test } from '@playwright/test';
import { ROOT } from './helpers';

const EXT = join(ROOT, 'examples/extension/.output/chrome-mv3');

let context: BrowserContext;

test.beforeAll(async () => {
  const build = spawnSync('bun', ['run', '--filter', 'feedgrab-example-extension', 'build'], {
    cwd: ROOT,
    env: { ...process.env, FD_E2E: '1' },
    encoding: 'utf8',
  });
  if (build.status !== 0)
    throw new Error(`extension build failed:\n${build.stdout}\n${build.stderr}`);
  // Recent Chromium ignores --load-extension; load the unpacked build through CDP instead
  // (and drop Playwright's default --disable-extensions).
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });
  const cdp = await context.browser()!.newBrowserCDPSession();
  await cdp.send('Extensions.loadUnpacked' as never, { path: EXT } as never);
});

test.afterAll(async () => {
  await context?.close();
});

test('detect → overlay → save → reload hides the builtin-excluded posts', async ({ baseURL }) => {
  const page = await context.newPage();
  await page.goto(`${baseURL}/social-feed.html`);
  const host = page.locator('[data-feedgrab-overlay]');
  // The content script loads at document_idle; post until it answers with the overlay.
  await expect
    .poll(
      async () => {
        await page.evaluate(() =>
          window.postMessage({ source: 'fd-e2e', type: 'start-detect' }, '*'),
        );
        return host.count();
      },
      { timeout: 15000 },
    )
    .toBeGreaterThan(0);
  await host.locator('[data-fd-action="toggle-accept"]').first().check();
  await host.locator('[data-fd-action="save"]').click();
  await expect(host).toHaveCount(0);

  await page.reload();
  const removed = page.locator('article.post[data-fd-removed="item"]');
  await expect(removed).toHaveCount(2);
  const indexes = await page.evaluate(() =>
    Array.from(document.querySelectorAll('article.post'))
      .map((el, i) => (el.getAttribute('data-fd-removed') === 'item' ? i + 1 : 0))
      .filter(Boolean),
  );
  expect(indexes).toEqual([4, 8]);
  await page.close();
});
