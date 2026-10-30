import { expect, type Page, test } from '@playwright/test';
import { openFixture, type PageGlobal } from './helpers';

type Outcome = { ok: true; json: string } | { ok: false; code: string };

async function startOverlay(page: Page, opts: Record<string, unknown> = {}) {
  await openFixture(page, 'social-feed');
  await page.evaluate(async (opts) => {
    const g = globalThis as unknown as PageGlobal;
    const FD = g.FeedDetector;
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
  page.locator(`[data-feed-detector-overlay] [data-fd-action="${name}"]`);

test('confirm a feed with an exclude rule; the page DOM is unchanged', async ({ page }) => {
  await startOverlay(page);
  await expect(page.locator('[data-feed-detector-overlay]')).toHaveCount(1);
  await expect(page.locator('[data-feed-detector-overlay] .fd-box.fd-feed').first()).toBeAttached();
  await expect(page.locator('[data-feed-detector-overlay] .fd-box.fd-item').first()).toBeAttached();
  await expect(page.locator('[data-feed-detector-overlay] .fd-box.fd-excluded')).toHaveCount(2);

  await action(page, 'toggle-accept').first().check();
  await action(page, 'exclude-input').fill('.post.promoted');
  await action(page, 'exclude-scope').selectOption('item');
  await action(page, 'add-exclude').click();
  await expect(
    page.locator('[data-feed-detector-overlay] [data-fd-action="remove-rule"]'),
  ).toHaveCount(1);
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
  await expect(page.locator('[data-feed-detector-overlay]')).toHaveCount(0);
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
  await expect(page.locator('[data-feed-detector-overlay]')).toHaveCount(0);
});
