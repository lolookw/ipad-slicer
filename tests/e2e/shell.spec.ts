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

async function openPreferences(page: import('@playwright/test').Page) {
  const menu = page.locator('.preferences-menu');
  if (!(await menu.evaluate((el) => (el as HTMLDetailsElement).open))) await menu.locator('summary').click();
}

async function selectedMeshPoint(page: import('@playwright/test').Page, objectName: string) {
  const object = page.getByRole('button', { name: objectName, exact: true });
  const canvas = page.getByTestId('viewer-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Viewer canvas has no bounding box');
  const fractions = [[.55, .49], [.53, .49], [.57, .49], [.55, .47], [.55, .51]];
  for (const [xFraction, yFraction] of fractions) {
    await object.click();
    const point = { x: box.x + box.width * xFraction!, y: box.y + box.height * yFraction! };
    await page.mouse.click(point.x, point.y);
    if (await object.getAttribute('aria-pressed') === 'true') return point;
  }
  throw new Error('Could not locate the selected mesh on the rendered canvas');
}

function binaryBoxStl(): Buffer {
  const vertices = [[0, 0, 0], [20, 0, 0], [20, 20, 0], [0, 20, 0], [0, 0, 10], [20, 0, 10], [20, 20, 10], [0, 20, 10]];
  const faces = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4],
    [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  const buffer = Buffer.alloc(84 + faces.length * 50); buffer.writeUInt32LE(faces.length, 80);
  faces.forEach((face, index) => face.forEach((vertex, vertexIndex) => vertices[vertex]!.forEach((value, axis) =>
    buffer.writeFloatLE(value!, 84 + index * 50 + 12 + vertexIndex * 12 + axis * 4))));
  return buffer;
}

async function configureEngine(page: import('@playwright/test').Page) {
  await page.getByLabel('Printer', { exact: true }).selectOption('creality-ender3-v2-04');
  await expect(page.getByLabel('Filament')).toBeEnabled();
  await page.getByLabel('Filament').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Standard', exact: true }).click();
}

test('the app shell loads cross-origin isolated', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.title')).toHaveText('SliceAr');
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
    await openPreferences(page);
    await page.locator('select').filter({ has: page.locator('option[value="es"]') }).selectOption(locale);
    for (const control of await page.locator('button:visible, select:visible, input:visible, textarea:visible, summary:visible').all()) {
      const box = await control.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    }
  }
});

test('Spanish persists and visible errors translate without changing user data', async ({ page }) => {
  await page.goto('/');
  await openPreferences(page);
  await page.getByLabel('Language').selectOption('es');
  await expect(page.getByRole('alert')).toContainText('Importa un modelo');
  await page.reload();
  await openPreferences(page);
  await expect(page.getByLabel('Idioma')).toHaveValue('es');
  await expect(page.getByRole('navigation', { name: 'Pasos de laminado' })).toBeVisible();
  await page.getByLabel('Importar STL').setInputFiles({ name: 'roto.stl', mimeType: 'model/stl', buffer: Buffer.from([1, 2, 3]) });
  await expect(page.getByRole('alert').filter({ hasText: 'El archivo STL está vacío' })).toBeVisible();
});

test('an imported model without a printer gets configuration guidance', async ({ page }) => {
  await page.goto('/'); await importStl(page, 'needs-profile.stl');
  await expect(page.getByRole('alert').filter({ hasText: 'compatible printer' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Slice', exact: true })).toBeDisabled();
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
  await openPreferences(page);
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

test('the spike harness is gone after slice 5b', async ({ request }) => {
  const response = await request.get('/harness.html');
  expect(response.status()).toBe(404);
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
  await expect(page.getByRole('alert').filter({ hasText: /STL/i })).toBeVisible();
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

test('selected-object taps, move drags, and rotate-mode drags commit through real pointer events', async ({ page }) => {
  await page.goto('/');
  await importStl(page, 'touch-transform.stl', binaryBoxStl());
  const object = page.getByRole('button', { name: 'touch-transform.stl', exact: true });
  const canvas = page.getByTestId('viewer-canvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  const selectedPoint = await selectedMeshPoint(page, 'touch-transform.stl');
  await page.getByRole('button', { name: 'Deselect', exact: true }).click();
  await expect(object).toHaveAttribute('aria-pressed', 'false');

  const moveStart = await selectedMeshPoint(page, 'touch-transform.stl');
  const beforeMove = await object.getAttribute('data-transform');
  const moveDirection = moveStart.x < box!.x + box!.width * .65 ? 36 : -36;
  await page.mouse.move(moveStart.x, moveStart.y);
  await page.mouse.down();
  await page.mouse.move(moveStart.x + Math.sign(moveDirection) * 12, moveStart.y);
  await page.mouse.move(moveStart.x + moveDirection, moveStart.y);
  await page.mouse.up();
  await expect.poll(() => object.getAttribute('data-transform')).not.toBe(beforeMove);
  const afterMove = await object.getAttribute('data-transform');

  const axisLock = page.getByRole('group', { name: 'Axis lock', exact: true });
  await expect(axisLock.getByRole('button', { name: 'Free', exact: true })).toHaveAttribute('aria-pressed', 'true');
  for (const control of await axisLock.getByRole('button').all()) {
    const target = await control.boundingBox();
    expect(target!.width).toBeGreaterThanOrEqual(44);
    expect(target!.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await axisLock.getByRole('button', { name: 'X', exact: true }).click();
  await expect(axisLock.getByRole('button', { name: 'X', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const lockedStart = await selectedMeshPoint(page, 'touch-transform.stl');
  const beforeLockedMove = JSON.parse((await object.getAttribute('data-transform'))!);
  await page.mouse.move(lockedStart.x, lockedStart.y);
  await page.mouse.down();
  await page.mouse.move(lockedStart.x + 12, lockedStart.y);
  await page.mouse.move(lockedStart.x + 36, lockedStart.y + 18);
  await page.mouse.up();
  await expect.poll(async () => JSON.parse((await object.getAttribute('data-transform'))!).position[0]).not.toBeCloseTo(beforeLockedMove.position[0]);
  const afterLockedMove = JSON.parse((await object.getAttribute('data-transform'))!);
  expect(afterLockedMove.position.slice(1)).toEqual(beforeLockedMove.position.slice(1));
  expect(afterLockedMove.rotation).toEqual(beforeLockedMove.rotation);
  expect(afterLockedMove.scale).toEqual(beforeLockedMove.scale);

  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.getByRole('button', { name: 'Rotate', exact: true }).click();
  await axisLock.getByRole('button', { name: 'Z', exact: true }).click();
  await expect(axisLock.getByRole('button', { name: 'Z', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Rotate', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const rotateStart = await selectedMeshPoint(page, 'touch-transform.stl');
  const beforeRotate = JSON.parse((await object.getAttribute('data-transform'))!);
  const rotateDirection = rotateStart.x < box!.x + box!.width * .65 ? 42 : -42;
  await page.mouse.move(rotateStart.x, rotateStart.y);
  await page.mouse.down();
  await page.mouse.move(rotateStart.x + Math.sign(rotateDirection) * 12, rotateStart.y);
  await page.mouse.move(rotateStart.x + rotateDirection, rotateStart.y);
  await page.mouse.up();
  await expect.poll(async () => JSON.parse((await object.getAttribute('data-transform'))!).rotation[2]).not.toBeCloseTo(beforeRotate.rotation[2]);
  const afterRotate = JSON.parse((await object.getAttribute('data-transform'))!);
  expect(afterRotate.rotation.slice(0, 2)).toEqual(beforeRotate.rotation.slice(0, 2));
  expect(afterRotate.position).toEqual(beforeRotate.position);
  expect(afterRotate.scale).toEqual(beforeRotate.scale);
  expect(afterRotate.rotation[2] / (Math.PI / 2)).not.toBeCloseTo(Math.round(afterRotate.rotation[2] / (Math.PI / 2)));
  expect(await object.getAttribute('data-transform')).not.toBe(afterMove);
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

test('two imported objects round-trip through real engine orient and arrange', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/'); await configureEngine(page);
  await importStl(page, 'prepare-a.stl', binaryBoxStl());
  await importStl(page, 'prepare-b.stl', binaryBoxStl());
  const objects = page.getByRole('navigation', { name: 'Plate objects' }).getByRole('button');
  const before = await objects.evaluateAll(items => items.map(item => item.getAttribute('data-transform')));
  await page.getByRole('button', { name: 'Orient and arrange' }).click();
  await expect(page.locator('.configuration-ui p[role="status"]')).toHaveText('Plate orientation and arrangement updated.', { timeout: 45_000 });
  const after = await objects.evaluateAll(items => items.map(item => item.getAttribute('data-transform')));
  expect(after).not.toEqual(before);
  expect(after.every(value => value && !value.includes('null'))).toBe(true);
});

test('prepare failure preserves every prior object transform', async ({ page }) => {
  test.setTimeout(60_000);
  await page.route('**/engine/wasm-v2.4.2-patch19*/**', route => route.abort('failed'));
  await page.goto('/'); await configureEngine(page);
  await importStl(page, 'failure-a.stl', binaryBoxStl());
  await importStl(page, 'failure-b.stl', binaryBoxStl());
  const objects = page.getByRole('navigation', { name: 'Plate objects' }).getByRole('button');
  const before = await objects.evaluateAll(items => items.map(item => item.getAttribute('data-transform')));
  await page.getByRole('button', { name: 'Orient and arrange' }).click();
  await expect(page.locator('.configuration-ui p[role="status"]')).toContainText(/failed|error|fetch|engine/i, { timeout: 20_000 });
  expect(await objects.evaluateAll(items => items.map(item => item.getAttribute('data-transform')))).toEqual(before);
});

test('a slice engine failure is visible in the main flow', async ({ page }) => {
  test.setTimeout(60_000);
  await page.route('**/engine/wasm-v2.4.2-patch19*/**', route => route.abort('failed'));
  await page.goto('/'); await configureEngine(page); await importStl(page, 'slice-failure.stl', binaryBoxStl());
  await page.getByRole('button', { name: 'Slice', exact: true }).click();
  await expect(page.locator('.slice-error[role="alert"]')).toContainText(/failed|error|fetch|engine/i, { timeout: 20_000 });
});

test('Advanced diagnostics exposes multithread retry and clears the sticky marker', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8 });
    Object.defineProperty(navigator, 'gpu', { value: {} });
    localStorage.setItem('ipad-slicer:mt-failed:wasm-v2.4.2-patch19', '1');
    localStorage.setItem('ipad-slicer:crash-marker', '1');
  });
  await page.goto('/'); await expect(page.locator('.active-tier')).toContainText('Standard');
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Diagnostics' }).click();
  await page.getByRole('button', { name: 'Retry multithread', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Multithread retry enabled' })).toBeVisible();
  expect(await page.evaluate(() => [localStorage.getItem('ipad-slicer:mt-failed:wasm-v2.4.2-patch19'), localStorage.getItem('ipad-slicer:crash-marker')])).toEqual([null, null]);
  await expect(page.locator('.active-tier')).toContainText('Full');
});

test('a configured imported plate slices, shows estimates and downloads G-code', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/'); await configureEngine(page); await importStl(page, 'slice-round-trip.stl', binaryBoxStl());
  await page.getByRole('button', { name: 'Slice', exact: true }).click();
  await expect(page.getByTestId('slice-result')).toContainText('Print time', { timeout: 45_000 });
  await expect(page.getByTestId('slice-result')).toContainText('Filament mass');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save G-code', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('slice-round-trip.gcode');
  await expect(page.locator('.diagnostics-sheet')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
});

test('canceling an active slice never unlocks a stale result', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/'); await configureEngine(page); await importStl(page, 'cancel-slice.stl', binaryBoxStl());
  await page.getByRole('button', { name: 'Slice', exact: true }).click();
  const cancel = page.getByRole('button', { name: 'Cancel slice', exact: true });
  await expect(cancel).toBeVisible(); await cancel.click();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await expect(page.getByTestId('slice-result')).toHaveCount(0);
});
