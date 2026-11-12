import { expect, type Page, test } from '@playwright/test';
import { openFixture, type PageGlobal } from './helpers';

type Outcome = { ok: true; json: string } | { ok: false; code: string };

async function startOverlay(page: Page, opts: Record<string, unknown> = {}) {
  await openFixture(page, 'social-feed');
  await page.evaluate(async (opts) => {
    const g = globalThis as unknown as PageGlobal;
    const FD = g.Feedgrab;
    g.__before = document.documentElement.outerHTML;
    const proposals = await FD.detectFeeds(document);
    g.__outcome = FD.openOverlay(document, proposals, opts).then(
      (p) => ({ ok: true, json: FD.serializeProfile(p) }),
      (e: { code: string }) => ({ ok: false, code: e.code }),
    );
  }, opts);
}

const outcome = (page: Page) =>
  page.evaluate(() => (globalThis as unknown as { __outcome: Promise<Outcome> }).__outcome);

const action = (page: Page, name: string) =>
  page.locator(`[data-feedgrab-overlay] [data-fd-action="${name}"]`);

test('confirm a feed with an exclude rule; the page DOM is unchanged', async ({ page }) => {
  await startOverlay(page);
  await expect(page.locator('[data-feedgrab-overlay]')).toHaveCount(1);
  await expect(page.locator('[data-feedgrab-overlay] .fd-box.fd-feed').first()).toBeAttached();
  await expect(page.locator('[data-feedgrab-overlay] .fd-box.fd-item').first()).toBeAttached();
  await expect(page.locator('[data-feedgrab-overlay] .fd-box.fd-excluded')).toHaveCount(2);

  await action(page, 'toggle-accept').first().check();
  await action(page, 'exclude-input').fill('.post.promoted');
  await action(page, 'exclude-scope').selectOption('item');
  await action(page, 'add-exclude').click();
  await expect(page.locator('[data-feedgrab-overlay] [data-fd-action="remove-rule"]')).toHaveCount(
    1,
  );
  await action(page, 'save').click();

  const result = await outcome(page);
  expect(result.ok).toBe(true);
  const profile = JSON.parse((result as { json: string }).json);
  expect(profile.feeds.length).toBe(1);
  expect(profile.feeds[0].confirmed).toBe(true);
  expect(profile.feeds[0].container).toEqual({ type: 'css', value: '.timeline' });
  expect(profile.feeds[0].exclude).toEqual([
    expect.objectContaining({
      kind: 'selector',
      selector: { type: 'css', value: '.post.promoted' },
      scope: 'item',
    }),
  ]);
  await expect(page.locator('[data-feedgrab-overlay]')).toHaveCount(0);
  const same = await page.evaluate(
    () =>
      document.documentElement.outerHTML ===
      (globalThis as unknown as { __before: string }).__before,
  );
  expect(same).toBe(true);
});

test('cancel rejects with OVERLAY_CANCELLED and cleans up', async ({ page }) => {
  await startOverlay(page);
  await action(page, 'cancel').click();
  expect(await outcome(page)).toEqual({ ok: false, code: 'OVERLAY_CANCELLED' });
  await expect(page.locator('[data-feedgrab-overlay]')).toHaveCount(0);
});

test('the panel drags, collapses, and Feed N scrolls below a fixed header', async ({ page }) => {
  await openFixture(page, 'social-feed');
  await page.evaluate(async () => {
    const g = globalThis as unknown as PageGlobal;
    const header = Object.assign(document.createElement('header'), { id: 'fixed-top' });
    header.style.cssText = 'position:fixed;top:0;left:0;right:0;height:60px;background:#eee';
    const spacer = Object.assign(document.createElement('div'), { id: 'spacer' });
    spacer.style.height = '2000px';
    document.body.prepend(header, spacer);
    const after = Object.assign(document.createElement('div'), { id: 'after' });
    after.style.height = '2000px';
    document.body.append(after);
    const moves: unknown[] = [];
    g.__moves = moves;
    const proposals = await g.Feedgrab.detectFeeds(document);
    void g.Feedgrab.openOverlay(document, proposals, {
      title: 'Step 1 of 4 · Feeds',
      position: { left: 20, top: 40 },
      onMove: (p: unknown) => moves.push(p),
    }).catch(() => {});
  });
  const panel = page.locator('[data-feedgrab-overlay] .fd-panel');
  const bar = page.locator('[data-feedgrab-overlay] .fd-bar');
  await expect(bar).toContainText('Step 1 of 4 · Feeds');
  expect(await panel.boundingBox()).toMatchObject({ x: 20, y: 40 });

  const b = (await bar.boundingBox())!;
  await page.mouse.move(b.x + 20, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + 220, b.y + b.height / 2 + 100, { steps: 5 });
  await page.mouse.up();
  expect(await panel.boundingBox()).toMatchObject({ x: 220, y: 140 });
  expect(await page.evaluate(() => (globalThis as unknown as PageGlobal).__moves)).toEqual([
    { left: 220, top: 140 },
  ]);

  const full = (await panel.boundingBox())!.height;
  await action(page, 'collapse').click();
  expect((await panel.boundingBox())!.height).toBeLessThan(Math.min(full, 50));
  await action(page, 'collapse').click();

  await action(page, 'select').first().click();
  const top = await page.evaluate(
    () => document.querySelector('.timeline > article')!.getBoundingClientRect().top,
  );
  expect(top).toBeCloseTo(68, 0);
  await expect(page.locator('[data-feedgrab-overlay] .fd-box.fd-hover')).toHaveCount(1);
});
