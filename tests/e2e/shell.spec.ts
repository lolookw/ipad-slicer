import { expect, test } from '@playwright/test';

function binaryTriangleStl(): Buffer {
  const buffer = Buffer.alloc(134);
  buffer.writeUInt32LE(1, 80);
  buffer.writeFloatLE(1, 92);
  const vertices = [[0, 0, 0], [20, 0, 0], [0, 20, 10]];
  vertices.forEach((vertex, vertexIndex) => vertex.forEach((value, axis) => buffer.writeFloatLE(value, 96 + vertexIndex * 12 + axis * 4)));
  return buffer;
}

async function importStl(page: import('@playwright/test').Page, name: string, buffer = binaryTriangleStl()) {
  await page.getByLabel('Import STL').setInputFiles({ name, mimeType: 'model/stl', buffer });
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
}

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

test('every visible English and Spanish control meets the 44pt touch target', async ({ page }) => {
  await page.goto('/');
  for (const locale of ['en', 'es']) {
    await page.locator('select').filter({ has: page.locator('option[value="es"]') }).selectOption(locale);
    for (const control of await page.locator('button:visible, select:visible, input:visible, textarea:visible').all()) {
      const box = await control.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    }
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

test('configuration stays bounded and rejects unsafe imports without replacing edits', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Printer', { exact: true }).selectOption('creality-ender3-v2-04');
  await expect(page.getByLabel('Filament')).toBeEnabled();
  await page.getByLabel('Filament').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Standard', exact: true }).click();
  const supports = page.getByLabel('Supports');
  if (!(await supports.isChecked())) await supports.check();
  await expect(page.locator('[data-simple-entry]:visible')).toHaveCount(9);
  const brim = page.getByLabel('Brim width'); const before = await brim.inputValue();
  const ids = await page.evaluate(() => ({
    printerId: (document.querySelector('select[aria-label="Printer"]') as HTMLSelectElement).value,
    filamentId: (document.querySelector('select[aria-label="Filament"]') as HTMLSelectElement).value,
  }));
  const processId = 'standard';
  const bad = JSON.stringify({ format: 'ipad-slicer.presets', version: 1, exportedAt: new Date(0).toISOString(), presets: [{ id: 'bad', name: 'Unsafe', kind: 'catalog', printerId: ids.printerId, baseId: ids.printerId, processId, filamentId: ids.filamentId, overrides: { brim_width: '101', support_type: 'tree' }, schemaVersion: 1, updatedAt: 1 }] });
  await page.locator('summary').filter({ hasText: 'Preset transfer' }).click();
  await page.getByLabel('Preset JSON').fill(bad); await page.getByRole('button', { name: 'Import preset' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'current settings were kept' })).toBeVisible();
  await expect(brim).toHaveValue(before);
  await brim.fill('101'); await brim.blur(); await expect(page.getByRole('alert').filter({ hasText: 'brim_width' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Slice' })).toBeDisabled();
});

test('custom printer form rejects invalid dimensions and labels a valid printer as untested', async ({ page }) => {
  await page.goto('/'); await page.locator('summary').filter({ hasText: 'Custom printer' }).click();
  await page.getByLabel('Name').fill('Workshop printer'); const width = page.getByLabel('Bed width (mm)');
  await width.fill('0'); await page.getByRole('button', { name: 'Save custom printer' }).click(); expect(await width.evaluate(input => !(input as HTMLInputElement).checkValidity())).toBe(true);
  await width.fill('235'); await page.getByRole('button', { name: 'Save custom printer' }).click();
  await expect(page.getByText('Custom printer saved', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Printer', { exact: true })).toContainText('not individually smoke-tested');
});

test('STL imports remain independently selectable and an invalid file preserves the plate', async ({ page }) => {
  await page.goto('/');
  await importStl(page, 'first.stl');
  await importStl(page, 'second.stl');
  await expect(page.getByRole('navigation', { name: 'Plate objects' }).getByRole('button')).toHaveCount(2);
  await page.getByRole('button', { name: 'first.stl', exact: true }).click();
  await expect(page.getByRole('button', { name: 'first.stl', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Import STL').setInputFiles({ name: 'broken.stl', mimeType: 'model/stl', buffer: Buffer.from([1, 2, 3]) });
  await expect(page.getByRole('alert')).toContainText(/STL/i);
  await expect(page.getByRole('navigation', { name: 'Plate objects' }).getByRole('button')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'first.stl', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('camera navigation changes the view without changing model transforms', async ({ page }) => {
  await page.goto('/');
  await importStl(page, 'camera-check.stl');
  const object = page.getByRole('button', { name: 'camera-check.stl', exact: true });
  const before = await object.getAttribute('data-transform');
  const canvas = page.getByTestId('viewer-canvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width * .8, box!.y + box!.height * .2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * .55, box!.y + box!.height * .35, { steps: 8 });
  await page.mouse.up();
  await expect(object).toHaveAttribute('data-transform', before!);
});

test('changing scale display units preserves the physical millimeter size', async ({ page }) => {
  await page.goto('/');
  await importStl(page, 'units.stl');
  await page.getByRole('button', { name: 'Scale', exact: true }).click();
  await page.getByRole('radio', { name: 'in', exact: true }).click();
  const dimension = page.getByLabel('Largest dimension');
  await dimension.fill('1'); await dimension.blur();
  await page.getByRole('radio', { name: 'mm', exact: true }).click();
  await expect(dimension).toHaveValue('25.4');
});
