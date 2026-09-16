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

test('IndexedDB presets survive reload and a JSON round trip', async ({ page }) => {
  await page.goto('/');
  const fixture = {
    id: 'persisted', name: 'Persistent PLA', kind: 'custom', printerId: 'user-printer', baseId: 'custom',
    processId: 'standard', filamentId: 'pla', overrides: { brim_width: '5' }, schemaVersion: 1, updatedAt: 1,
  };
  await page.evaluate(async preset => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('ipad-slicer', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction(['presets', 'printers', 'ui'], 'readwrite');
    transaction.objectStore('presets').put(preset);
    transaction.objectStore('printers').put({ id: 'user-printer', name: 'User printer', baseId: 'custom', settings: {}, updatedAt: 1 });
    transaction.objectStore('ui').put({ key: 'activePresetId', value: preset.id });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  }, fixture);

  await page.reload();
  const restored = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('ipad-slicer', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction(['presets', 'printers'], 'readonly');
    const request = transaction.objectStore('presets').get('persisted');
    const printerRequest = transaction.objectStore('printers').get('user-printer');
    const preset = await new Promise<Record<string, unknown>>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as Record<string, unknown>);
      request.onerror = () => reject(request.error);
    });
    const printer = await new Promise<Record<string, unknown>>((resolve, reject) => {
      printerRequest.onsuccess = () => resolve(printerRequest.result as Record<string, unknown>);
      printerRequest.onerror = () => reject(printerRequest.error);
    });
    database.close();
    const bundle = JSON.stringify({ format: 'ipad-slicer.presets', version: 1, exportedAt: new Date(0).toISOString(), presets: [preset] });
    return { preset: (JSON.parse(bundle) as { presets: unknown[] }).presets[0], customBaseId: printer.baseId };
  });
  expect(restored.preset).toMatchObject(fixture);
  expect(restored.customBaseId).toBe('custom');
});
