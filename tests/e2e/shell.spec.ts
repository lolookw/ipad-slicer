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
  for (const control of await page.locator('button, select').all()) {
    const box = await control.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  }
});

test('Spanish persists and visible errors translate without changing user data', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Language').selectOption('es');
  await expect(page.getByRole('alert')).toContainText('Importa un modelo');
  await page.reload();
  await expect(page.getByLabel('Idioma')).toHaveValue('es');
  await expect(page.getByRole('navigation', { name: 'Pasos de laminado' })).toBeVisible();
});

test('a stored dark preference is applied during first paint', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ipad-slicer:theme', 'dark'));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', 'dark');
  await expect(page.getByLabel('Appearance')).toHaveValue('dark');
});

test('Full selection falls back when feature signals are insufficient', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'hardwareConcurrency', { value: 2 }));
  await page.goto('/');
  await page.getByLabel('Performance').selectOption('full');
  await expect(page.locator('.active-tier')).toContainText('Standard');
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
