import { expect, test } from '@playwright/test';
import { openFixture, type PageGlobal } from './helpers';

test('theme colors and customCss apply inside the shadow root', async ({ page }) => {
  await openFixture(page, 'social-feed');
  await page.evaluate(async () => {
    const g = globalThis as unknown as PageGlobal;
    const FD = g.FeedDetector;
    const proposals = await FD.detectFeeds(document);
    g.__outcome = FD.openOverlay(document, proposals, {
      theme: { colors: { item: '#ff00ff' } },
      customCss: '.fd-panel { border-width: 7px; }',
    }).catch((e: { code: string }) => e.code);
  });
  const box = page.locator('[data-feed-detector-overlay] .fd-box.fd-item').first();
  await expect(box).toBeAttached();
  expect(await box.evaluate((el) => getComputedStyle(el).outlineColor)).toBe('rgb(255, 0, 255)');
  const panel = page.locator('[data-feed-detector-overlay] .fd-panel');
  expect(await panel.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('7px');
  await page.locator('[data-feed-detector-overlay] [data-fd-action="cancel"]').click();
  expect(
    await page.evaluate(() => (globalThis as unknown as { __outcome: Promise<string> }).__outcome),
  ).toBe('OVERLAY_CANCELLED');
});
