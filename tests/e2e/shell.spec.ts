import { expect, test } from '@playwright/test';

test('the app shell loads cross-origin isolated', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.title')).toHaveText('iPad Slicer');
  expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(true);
});

test('locked steps stay disabled and Configure is the default', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.step[aria-current="step"]')).toHaveText('Configure');
  await expect(page.getByRole('button', { name: 'Preview' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
});

test('every step control meets the 44pt touch target', async ({ page }) => {
  await page.goto('/');
  for (const button of await page.locator('.step').all()) {
    const box = await button.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  }
});

test('the layout switches between regular and compact widths', async ({ page }) => {
  await page.goto('/');
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.locator('.layout')).toHaveAttribute('data-layout', 'regular');
  await page.setViewportSize({ width: 480, height: 900 });
  await expect(page.locator('.layout')).toHaveAttribute('data-layout', 'compact');
});

test('the spike harness is still reachable until slice 5b', async ({ page }) => {
  await page.goto('/harness.html');
  await expect(page.locator('#engine-status')).toBeVisible();
});
