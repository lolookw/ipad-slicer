import { expect, test } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';

function binaryTriangleStl(): Buffer {
  const buffer = Buffer.alloc(134);
  buffer.writeUInt32LE(1, 80);
  buffer.writeFloatLE(1, 92);
  const vertices = [[0, 0, 0], [20, 0, 0], [0, 20, 10]];
  vertices.forEach((vertex, vertexIndex) => vertex.forEach((value, axis) => buffer.writeFloatLE(value, 96 + vertexIndex * 12 + axis * 4)));
  return buffer;
}

async function importStl(page: import('@playwright/test').Page, name: string, buffer = binaryTriangleStl()) {
  await page.getByLabel('Import model').setInputFiles({ name, mimeType: 'model/stl', buffer });
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
}

async function openPreferences(page: import('@playwright/test').Page) {
  const menu = page.locator('.preferences-menu');
  if (!(await menu.evaluate((el) => (el as HTMLDetailsElement).open))) await menu.locator('summary').click();
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

/** A thin 30x2x40 fin, imported standing tall on its narrow edge — an obviously bad default orientation. */
function binaryFinStl(): Buffer {
  const vertices = [[0, 0, 0], [30, 0, 0], [30, 2, 0], [0, 2, 0], [0, 0, 40], [30, 0, 40], [30, 2, 40], [0, 2, 40]];
  const faces = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4],
    [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  const buffer = Buffer.alloc(84 + faces.length * 50); buffer.writeUInt32LE(faces.length, 80);
  faces.forEach((face, index) => face.forEach((vertex, vertexIndex) => vertices[vertex]!.forEach((value, axis) =>
    buffer.writeFloatLE(value!, 84 + index * 50 + 12 + vertexIndex * 12 + axis * 4))));
  return buffer;
}
const FIN_BOUNDS = { min: [0, 0, 0], max: [30, 2, 40] };

/** Rotated world-space AABB Z extent, mirroring src/viewer/transforms.ts's transformedSize — kept local so this spec has no src import. */
function boundingHeightMm(bounds: typeof FIN_BOUNDS, rotation: number[]): number {
  const matrix = new Matrix4().compose(new Vector3(), new Quaternion().setFromEuler(new Euler(rotation[0]!, rotation[1]!, rotation[2]!)), new Vector3(1, 1, 1));
  let minZ = Infinity; let maxZ = -Infinity;
  for (const x of [bounds.min[0], bounds.max[0]]) for (const y of [bounds.min[1], bounds.max[1]]) for (const z of [bounds.min[2], bounds.max[2]]) {
    const projected = new Vector3(x, y, z).applyMatrix4(matrix).z;
    minZ = Math.min(minZ, projected); maxZ = Math.max(maxZ, projected);
  }
  return maxZ - minZ;
}

/** The lowest world-space Z of the object's transformed bounds — mirrors dropToBed's own invariant: this should sit at ~0. */
function worldMinZ(bounds: typeof FIN_BOUNDS, transform: { position: number[]; rotation: number[]; scale: number[]; mirror: boolean[] }): number {
  const matrix = new Matrix4().compose(
    new Vector3(transform.position[0]!, transform.position[1]!, transform.position[2]!),
    new Quaternion().setFromEuler(new Euler(transform.rotation[0]!, transform.rotation[1]!, transform.rotation[2]!)),
    new Vector3(...(transform.scale.map((value, index) => (transform.mirror[index] ? -value : value)) as [number, number, number])),
  );
  let minZ = Infinity;
  for (const x of [bounds.min[0], bounds.max[0]]) for (const y of [bounds.min[1], bounds.max[1]]) for (const z of [bounds.min[2], bounds.max[2]]) {
    minZ = Math.min(minZ, new Vector3(x, y, z).applyMatrix4(matrix).z);
  }
  return minZ;
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
  await page.getByLabel('Importar modelo').setInputFiles({ name: 'roto.stl', mimeType: 'model/stl', buffer: Buffer.from([1, 2, 3]) });
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

// The Models list nav now also carries a visibility eye-toggle and a "..." menu per row (task 3), so
// `getByRole('button')` inside it would match more than one element per object; these tests scope to
// the name button specifically via its stable class, which keeps the exact same role/accessible-name/
// aria-pressed/data-transform contract the old bare chip row used.
const modelsItemNames = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: 'Plate objects' }).locator('.models-item-name');

test('STL imports remain independently selectable and an invalid file preserves the plate', async ({ page }) => {
  await page.goto('/');
  await importStl(page, 'first.stl');
  await importStl(page, 'second.stl');
  await expect(modelsItemNames(page)).toHaveCount(2);
  await page.getByRole('button', { name: 'first.stl', exact: true }).click();
  await expect(page.getByRole('button', { name: 'first.stl', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Import model').setInputFiles({ name: 'broken.stl', mimeType: 'model/stl', buffer: Buffer.from([1, 2, 3]) });
  await expect(page.getByRole('alert').filter({ hasText: /STL/i })).toBeVisible();
  await expect(modelsItemNames(page)).toHaveCount(2);
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

type Page = import('@playwright/test').Page;
type Point = { x: number; y: number };
interface GizmoScreen { center: Point; arrows: Record<'x' | 'y' | 'z', Point>; rings: Record<'x' | 'y' | 'z', Point> }

/** Screen layout of the on-canvas gizmo in page coordinates (the viewer publishes it canvas-relative on `data-gizmo`). */
async function gizmoScreen(page: Page): Promise<GizmoScreen> {
  const canvas = page.getByTestId('viewer-canvas');
  await expect(canvas).toHaveAttribute('data-gizmo', /.+/);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Viewer canvas has no bounding box');
  const raw = JSON.parse((await canvas.getAttribute('data-gizmo'))!) as Record<string, any>;
  const at = (pair: number[]): Point => ({ x: box.x + pair[0]!, y: box.y + pair[1]! });
  return { center: at(raw.center), arrows: { x: at(raw.arrows.x), y: at(raw.arrows.y), z: at(raw.arrows.z) }, rings: { x: at(raw.rings.x), y: at(raw.rings.y), z: at(raw.rings.z) } };
}
const along = (from: Point, to: Point, fraction: number): Point => ({ x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction });
const readTransform = async (page: Page, name: string) => JSON.parse((await page.getByRole('button', { name, exact: true }).getAttribute('data-transform'))!) as
  { position: number[]; rotation: number[]; scale: number[]; mirror: boolean[] };

async function dragTo(page: Page, from: Point, to: Point) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const steps = 10;
  for (let i = 1; i <= steps; i += 1) await page.mouse.move(from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps);
  await page.mouse.up();
}

test('dragging an unselected object selects it and moves it on the plate in one gesture', async ({ page }) => {
  await page.goto('/');
  await importStl(page, 'direct-drag.stl', binaryBoxStl());
  const chip = page.getByRole('button', { name: 'direct-drag.stl', exact: true });
  const { center } = await gizmoScreen(page);
  await page.getByRole('button', { name: 'Deselect', exact: true }).click();
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  const before = await readTransform(page, 'direct-drag.stl');

  await dragTo(page, center, { x: center.x + 60, y: center.y + 20 });

  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  const after = await readTransform(page, 'direct-drag.stl');
  expect(Math.hypot(after.position[0]! - before.position[0]!, after.position[1]! - before.position[1]!)).toBeGreaterThan(5);
  expect(after.position[2]).toBe(before.position[2]);
  expect(after.rotation).toEqual(before.rotation);
  expect(after.scale).toEqual(before.scale);
});

test('the X arrow moves only along world X, snapped to whole millimeters', async ({ page }) => {
  await page.goto('/');
  await importStl(page, 'arrow-x.stl', binaryBoxStl());
  // Arrows only exist (are drawn/hit-testable) in Move mode: Select is the default now, per the
  // Select/Move/Rotate mode toolbar (task 2) that replaced the old unlabeled "Ajuste" button.
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  const gizmo = await gizmoScreen(page);
  const before = await readTransform(page, 'arrow-x.stl');
  const grab = along(gizmo.center, gizmo.arrows.x, 0.45);
  const direction = { x: gizmo.arrows.x.x - gizmo.center.x, y: gizmo.arrows.x.y - gizmo.center.y };

  await dragTo(page, grab, { x: grab.x + direction.x * 0.6, y: grab.y + direction.y * 0.6 });

  await expect.poll(async () => (await readTransform(page, 'arrow-x.stl')).position[0]).not.toBeCloseTo(before.position[0]!, 1);
  const after = await readTransform(page, 'arrow-x.stl');
  expect(Number.isInteger(after.position[0])).toBe(true);
  expect(after.position[1]).toBe(before.position[1]);
  expect(after.position[2]).toBe(before.position[2]);
  expect(after.rotation).toEqual(before.rotation);
  expect(after.scale).toEqual(before.scale);
  await expect(page.getByRole('button', { name: 'Snap', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('the Z arrow is the only way to lift and never sinks below the plate', async ({ page }) => {
  await page.goto('/');
  await importStl(page, 'arrow-z.stl', binaryBoxStl());
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  const gizmo = await gizmoScreen(page);
  const before = await readTransform(page, 'arrow-z.stl');
  const grab = along(gizmo.center, gizmo.arrows.z, 0.45);
  const up = { x: gizmo.arrows.z.x - gizmo.center.x, y: gizmo.arrows.z.y - gizmo.center.y };

  await dragTo(page, grab, { x: grab.x + up.x * 0.5, y: grab.y + up.y * 0.5 });
  await expect.poll(async () => (await readTransform(page, 'arrow-z.stl')).position[2]).toBeGreaterThan(before.position[2]! + 3);
  const lifted = await readTransform(page, 'arrow-z.stl');
  expect(lifted.position[0]).toBe(before.position[0]);
  expect(lifted.position[1]).toBe(before.position[1]);

  const raised = await gizmoScreen(page);
  const handle = along(raised.center, raised.arrows.z, 0.45);
  await dragTo(page, handle, { x: handle.x - up.x * 4, y: handle.y - up.y * 4 });
  await expect.poll(async () => (await readTransform(page, 'arrow-z.stl')).position[2]).toBeCloseTo(before.position[2]!, 5);
});

test('the Z ring rotates only about world Z in 15 degree steps', async ({ page }) => {
  await page.goto('/');
  await importStl(page, 'ring-z.stl', binaryBoxStl());
  // Rings only exist (are drawn/hit-testable) in Rotate mode; see the Move-mode comment above.
  await page.getByRole('button', { name: 'Rotate', exact: true }).click();
  const gizmo = await gizmoScreen(page);
  const before = await readTransform(page, 'ring-z.stl');
  const grab = gizmo.rings.z;
  const radial = { x: grab.x - gizmo.center.x, y: grab.y - gizmo.center.y };
  const turn = (degrees: number): Point => {
    const angle = degrees * Math.PI / 180;
    return { x: gizmo.center.x + radial.x * Math.cos(angle) - radial.y * Math.sin(angle), y: gizmo.center.y + radial.x * Math.sin(angle) + radial.y * Math.cos(angle) };
  };

  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  for (const degrees of [15, 40, 70, 100]) await page.mouse.move(turn(degrees).x, turn(degrees).y);
  await page.mouse.up();

  await expect.poll(async () => Math.abs((await readTransform(page, 'ring-z.stl')).rotation[2]!)).toBeGreaterThan(0.1);
  const after = await readTransform(page, 'ring-z.stl');
  expect(after.rotation[0]).toBeCloseTo(0, 6);
  expect(after.rotation[1]).toBeCloseTo(0, 6);
  const steps = after.rotation[2]! / (Math.PI / 12);
  expect(steps).toBeCloseTo(Math.round(steps), 4);
  expect(after.position[2]).toBe(before.position[2]);
  expect(after.scale).toEqual(before.scale);
});

test('a continuous ring drag sweeping past 180 degrees keeps the live angle readout climbing, never flipping sign', async ({ page }) => {
  await page.goto('/');
  await importStl(page, 'ring-continuous.stl', binaryBoxStl());
  await page.getByRole('button', { name: 'Rotate', exact: true }).click();
  const gizmo = await gizmoScreen(page);
  const grab = gizmo.rings.z;
  const radial = { x: grab.x - gizmo.center.x, y: grab.y - gizmo.center.y };
  const turn = (degrees: number): Point => {
    const angle = degrees * Math.PI / 180;
    return { x: gizmo.center.x + radial.x * Math.cos(angle) - radial.y * Math.sin(angle), y: gizmo.center.y + radial.x * Math.sin(angle) + radial.y * Math.cos(angle) };
  };
  const readout = page.locator('.viewer-transform-readout');

  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  // One continuous drag whose checkpoints straddle the 180deg wraparound in `signedAngleAbout`. (The
  // screen-space "degrees" here are only nominal steps for a continuous sweep: at this camera's oblique
  // isometric angle the ring's on-screen projection is an ellipse, not a circle, so they do not translate
  // 1:1 to the true swept ring angle -- only the readout's always-climbing sign is asserted below.)
  const sweep = [20, 60, 100, 140, 170, 190, 220, 250];
  const readings: number[] = [];
  for (const degrees of sweep) {
    await page.mouse.move(turn(degrees).x, turn(degrees).y);
    const text = (await readout.textContent())!;
    readings.push(Number(/(-?[\d.]+)/.exec(text)![1]));
  }
  await page.mouse.up();

  // Old (buggy) code recomputed an ABSOLUTE angle from the fixed drag-start vector every frame, wrapped to
  // (-180, 180]: continuing the same physical sweep past 180deg flipped the readout's sign (e.g. "170.0°"
  // -> "-170.0°" while still turning the same way) instead of climbing past it. The fix accumulates
  // instead, so every step keeps the same sign as the first one (whichever direction this camera's ring
  // sweep happens to read as -- only the absence of a sign flip mid-drag is asserted, not which sign).
  const deltas = readings.slice(1).map((value, index) => value - readings[index]!);
  const direction = Math.sign(deltas[0]!);
  expect(direction).not.toBe(0);
  for (const delta of deltas) expect(Math.sign(delta)).toBe(direction);
});

test('Select is the default mode: an arrow drag does nothing until Move is chosen', async ({ page }) => {
  await page.goto('/');
  await importStl(page, 'select-default.stl', binaryBoxStl());
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const before = await readTransform(page, 'select-default.stl');
  let gizmo = await gizmoScreen(page);
  const grab1 = along(gizmo.center, gizmo.arrows.x, 0.45);

  // Dragging exactly where the X arrow would be, in Select mode, is empty canvas (no handle exists
  // yet): it must never move the object, whether the drag pans the camera or no-ops.
  await dragTo(page, grab1, { x: grab1.x + 40, y: grab1.y + 20 });
  expect((await readTransform(page, 'select-default.stl')).position).toEqual(before.position);

  await page.getByRole('button', { name: 'Move', exact: true }).click();
  gizmo = await gizmoScreen(page); // re-read: the Select-mode drag above may have orbited the camera
  const grab2 = along(gizmo.center, gizmo.arrows.x, 0.45);
  await dragTo(page, grab2, { x: grab2.x + 40, y: grab2.y + 20 });
  await expect.poll(async () => (await readTransform(page, 'select-default.stl')).position).not.toEqual(before.position);
});

test('the Models list eye toggle hides an object from both the viewport and picking, and shows it again', async ({ page }) => {
  await page.goto('/');
  await importStl(page, 'hideable.stl', binaryBoxStl());
  const { center } = await gizmoScreen(page);
  await page.getByRole('button', { name: 'Deselect', exact: true }).click();

  const hide = page.getByRole('button', { name: 'Hide hideable.stl', exact: true });
  await expect(hide).toHaveAttribute('aria-pressed', 'true');
  await hide.click();
  await expect(hide).toHaveCount(0);
  const show = page.getByRole('button', { name: 'Show hideable.stl', exact: true });
  await expect(show).toHaveAttribute('aria-pressed', 'false');

  // Clicking where the (now hidden) object sits must not pick/select it.
  await page.mouse.click(center.x, center.y);
  await expect(page.getByRole('button', { name: 'hideable.stl', exact: true })).toHaveAttribute('aria-pressed', 'false');

  await show.click();
  await page.mouse.click(center.x, center.y);
  await expect(page.getByRole('button', { name: 'hideable.stl', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('the Models list "..." menu duplicates, renames and deletes an object', async ({ page }) => {
  await page.goto('/');
  await importStl(page, 'menu-target.stl', binaryBoxStl());
  // The "..." trigger is a native <summary> (a details/summary disclosure, the same pattern the
  // Preferences popover already uses elsewhere in this app, see openPreferences() above): it
  // opens/closes without needing a role, so this locates and opens it the same defensive way
  // openPreferences() does, rather than betting on a browser's implicit ARIA role for <summary>.
  const openMenu = async (name: string) => {
    const details = page.locator('.models-item-menu').filter({ has: page.locator(`summary[aria-label="More actions for ${name}"]`) });
    if (!(await details.evaluate(element => (element as HTMLDetailsElement).open))) await details.locator('summary').click();
  };

  await openMenu('menu-target.stl');
  await page.getByRole('button', { name: 'Duplicate menu-target.stl', exact: true }).click();
  await expect(page.getByRole('button', { name: 'menu-target.stl copy', exact: true })).toBeVisible();

  page.once('dialog', dialog => void dialog.accept('Renamed model'));
  await openMenu('menu-target.stl');
  await page.getByRole('button', { name: 'Rename menu-target.stl', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Renamed model', exact: true })).toBeVisible();

  await openMenu('menu-target.stl copy');
  await page.getByRole('button', { name: 'Delete menu-target.stl copy', exact: true }).click();
  await expect(page.getByRole('button', { name: 'menu-target.stl copy', exact: true })).toHaveCount(0);
});

test('the Models list shows every object with five or more on the plate', async ({ page }) => {
  await page.goto('/');
  for (let i = 1; i <= 5; i += 1) await importStl(page, `bulk-${i}.stl`, binaryBoxStl());
  await expect(modelsItemNames(page)).toHaveCount(5);
  for (let i = 1; i <= 5; i += 1) await expect(page.getByRole('button', { name: `bulk-${i}.stl`, exact: true })).toBeVisible();
});

test('a two-finger touch gesture goes to the camera, cancels a one-finger move and never edits the object', async ({ page }) => {
  await page.goto('/');
  await importStl(page, 'two-finger.stl', binaryBoxStl());
  const canvas = page.getByTestId('viewer-canvas');
  const { center } = await gizmoScreen(page);
  await page.getByRole('button', { name: 'Deselect', exact: true }).click();
  const before = JSON.stringify(await readTransform(page, 'two-finger.stl'));

  const touch = (type: string, id: number, x: number, y: number) => canvas.evaluate((element, args) => {
    element.dispatchEvent(new PointerEvent(args.type, { pointerId: args.id, pointerType: 'touch', isPrimary: args.id === 71, bubbles: true, cancelable: true,
      clientX: args.x, clientY: args.y, buttons: args.type === 'pointerup' ? 0 : 1 }));
  }, { type, id, x, y });

  await touch('pointerdown', 71, center.x, center.y);
  await expect(page.getByRole('button', { name: 'two-finger.stl', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const layoutBefore = await canvas.getAttribute('data-gizmo');
  await touch('pointermove', 71, center.x + 20, center.y + 5);
  await touch('pointermove', 71, center.x + 40, center.y + 10);
  await expect.poll(async () => JSON.stringify(await readTransform(page, 'two-finger.stl'))).not.toBe(before);

  await touch('pointerdown', 72, center.x - 120, center.y - 80);
  await expect.poll(async () => JSON.stringify(await readTransform(page, 'two-finger.stl'))).toBe(before);
  for (let step = 1; step <= 6; step += 1) {
    await touch('pointermove', 71, center.x + 40 + step * 8, center.y + 10 + step * 6);
    await touch('pointermove', 72, center.x - 120 - step * 10, center.y - 80 - step * 4);
  }
  await touch('pointerup', 71, center.x + 88, center.y + 46);
  await touch('pointerup', 72, center.x - 180, center.y - 104);

  expect(JSON.stringify(await readTransform(page, 'two-finger.stl'))).toBe(before);
  await expect.poll(() => canvas.getAttribute('data-gizmo')).not.toBe(layoutBefore);
});

test('Auto orient lays a standing-on-edge object flat and keeps it seated on the plate', async ({ page }) => {
  await page.goto('/');
  await importStl(page, 'fin.stl', binaryFinStl());
  const before = await readTransform(page, 'fin.stl');
  expect(before.rotation).toEqual([0, 0, 0]);
  expect(boundingHeightMm(FIN_BOUNDS, before.rotation)).toBeCloseTo(40, 1);

  await page.getByRole('button', { name: 'Auto orient', exact: true }).click();

  await expect.poll(async () => (await readTransform(page, 'fin.stl')).rotation).not.toEqual([0, 0, 0]);
  const after = await readTransform(page, 'fin.stl');
  expect(boundingHeightMm(FIN_BOUNDS, after.rotation)).toBeLessThan(10); // was 40mm standing on edge; lying flat is ~2mm
  expect(worldMinZ(FIN_BOUNDS, after)).toBeCloseTo(0, 1); // still seated on the plate, same invariant dropToBed keeps everywhere else
});

test('an object stays draggable and correctly seated right after Auto orient', async ({ page }) => {
  // Regression test: Auto orient must leave the object in a state where it can still be picked up
  // and dragged normally afterward (the gizmo's published screen layout must reflect the NEW
  // rotated pose, not a stale pre-rotation one, and the object must not have moved off the plate).
  // A fin standing on its edge (not a box already resting on its best face) is used so Auto orient
  // actually has a better orientation to switch to, the same fixture the dedicated Auto orient test
  // above already confirms reliably rotates.
  await page.goto('/');
  await importStl(page, 'move-after-orient.stl', binaryFinStl());
  await page.getByRole('button', { name: 'Auto orient', exact: true }).click();
  await expect.poll(async () => (await readTransform(page, 'move-after-orient.stl')).rotation).not.toEqual([0, 0, 0]);
  const seated = await readTransform(page, 'move-after-orient.stl');
  expect(worldMinZ(FIN_BOUNDS, seated)).toBeCloseTo(0, 1);

  const { center } = await gizmoScreen(page); // read fresh, AFTER the rotation
  await page.getByRole('button', { name: 'Deselect', exact: true }).click();
  await dragTo(page, center, { x: center.x + 60, y: center.y + 20 });

  const chip = page.getByRole('button', { name: 'move-after-orient.stl', exact: true });
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  const moved = await readTransform(page, 'move-after-orient.stl');
  expect(Math.hypot(moved.position[0]! - seated.position[0]!, moved.position[1]! - seated.position[1]!)).toBeGreaterThan(5);
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
  const objects = modelsItemNames(page);
  const before = await objects.evaluateAll(items => items.map(item => item.getAttribute('data-transform')));
  await page.getByRole('button', { name: 'Orient and arrange' }).click();
  await expect(page.locator('.configuration-ui p[role="status"]')).toHaveText('Plate orientation and arrangement updated.', { timeout: 45_000 });
  const after = await objects.evaluateAll(items => items.map(item => item.getAttribute('data-transform')));
  expect(after).not.toEqual(before);
  expect(after.every(value => value && !value.includes('null'))).toBe(true);
});

// `page.route()` only sees requests made directly by the page; it never sees a request re-issued
// from inside a Service Worker's own fetch handler (a documented Playwright limitation). Since the
// service worker now intercepts and re-fetches `/engine/**` itself (lazy cache-first), these two
// pre-existing failure-simulation tests need the service worker out of the picture entirely so the
// abort actually reaches the (now real, unintercepted) engine request.
test.describe('engine failure simulation (service worker disabled)', () => {
  test.use({ serviceWorkers: 'block' });

  test('prepare failure preserves every prior object transform', async ({ page }) => {
    test.setTimeout(60_000);
    await page.route('**/engine/wasm-v2.4.2-patch19*/**', route => route.abort('failed'));
    await page.goto('/'); await configureEngine(page);
    await importStl(page, 'failure-a.stl', binaryBoxStl());
    await importStl(page, 'failure-b.stl', binaryBoxStl());
    const objects = modelsItemNames(page);
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
    // The recorded diagnostics entry must carry enough context to root-cause the crash later
    // (product-owner ask: which model, which printer/process, which engine variant) without
    // having to correlate it against a separate entry by timestamp.
    const entries = await page.evaluate(() => JSON.parse(localStorage.getItem('ipad-slicer:log') ?? '[]') as { type: string; data?: Record<string, unknown> }[]);
    const engineError = entries.filter(entry => entry.type === 'engine-error').at(-1);
    expect(engineError?.data?.stage).toBe('slice');
    expect(engineError?.data?.models).toEqual(['slice-failure.stl']);
    expect(engineError?.data?.printerId).toBe('creality-ender3-v2-04');
  });
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

test('the Preview step shows the toolpath canvas and the slider changes the visible layer while Save keeps working', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/'); await configureEngine(page); await importStl(page, 'preview-flow.stl', binaryBoxStl());
  await page.getByRole('button', { name: 'Slice', exact: true }).click();
  await expect(page.getByTestId('slice-result')).toContainText('Print time', { timeout: 45_000 });
  await expect(page.locator('.step[aria-current="step"]')).toHaveText('Preview');
  await expect(page.locator('gcode-preview canvas')).toBeAttached({ timeout: 30_000 });
  const label = page.getByTestId('layer-label');
  await expect(label).toContainText('Layer');
  const before = (await label.textContent())!;
  await page.getByRole('button', { name: 'Previous layer', exact: true }).click();
  await expect(label).not.toHaveText(before);
  await expect(page.getByTestId('layer-height')).toContainText('mm');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save G-code', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('preview-flow.gcode');
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

async function openImportStep(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.locator('.step[aria-current="step"]')).toHaveText('Import');
}

function threeMfWithTwoObjects(): Buffer {
  const mesh = '<mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="20" y="0" z="0"/><vertex x="0" y="20" z="0"/><vertex x="0" y="0" z="10"/></vertices>'
    + '<triangles><triangle v1="0" v2="2" v3="1"/><triangle v1="0" v2="1" v3="3"/><triangle v1="1" v2="2" v3="3"/><triangle v1="2" v2="0" v3="3"/></triangles></mesh>';
  const model = '<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>'
    + `<object id="1" type="model" name="Left wedge">${mesh}</object><object id="2" type="model" name="Right wedge">${mesh}</object></resources>`
    + '<build><item objectid="1" transform="1 0 0 0 1 0 0 0 1 60 60 0"/><item objectid="2" transform="1 0 0 0 1 0 0 0 1 120 60 0"/></build></model>';
  const rels = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>';
  return Buffer.from(zipSync({ '_rels/.rels': strToU8(rels), '3D/3dmodel.model': strToU8(model) }));
}

test('the Import step uploads an STL and continues to Configure', async ({ page }) => {
  await page.goto('/');
  await openImportStep(page);
  await expect(page.getByRole('button', { name: 'Upload from device' })).toBeVisible();
  await expect(page.getByText('Accepted formats: STL and 3MF.')).toBeVisible();
  await expect(page.getByRole('link', { name: /Printables/ })).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.getByRole('button', { name: 'Continue to Configure' })).toHaveCount(0);
  await page.getByTestId('import-file-input').setInputFiles({ name: 'import-step.stl', mimeType: 'model/stl', buffer: binaryTriangleStl() });
  await expect(page.getByText('Model added to the plate.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'import-step.stl', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continue to Configure' }).click();
  await expect(page.locator('.step[aria-current="step"]')).toHaveText('Configure');
});

// NOTE (e2e-unverifiable on this machine): any page.goto()/page.reload() while
// `context.setOffline(true)` is active fails with "WebKit encountered an internal error" in this
// Playwright WebKit build (1.55.1) on Windows, even against a page with no service worker at all
// (confirmed with a throwaway control test against `about:blank` -> setOffline -> goto). This is a
// driver-level limitation, not an application bug: `installShellVersioned`'s cache population was
// independently verified (a debug harness confirmed `index.html`, all JS/CSS chunks, the catalog
// entry points, manifest and icons land in `ipad-slicer-app-<buildId>` after `serviceWorker.controller`
// becomes non-null), and the navigate/shell/engine/catalog routing itself is fully covered by
// `src/pwa/sw-runtime.test.ts`. These two scenarios stay as fixme so the intent is not lost.
test.fixme('a fully cached reload stays cross-origin isolated while offline', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 30_000 });
  await context.setOffline(true);
  await page.reload();
  expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(true);
  await context.setOffline(false);
});

test.fixme('a printer and engine used online once keep slicing fully offline after reload', async ({ page, context }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 30_000 });
  await configureEngine(page);
  await importStl(page, 'offline-first.stl', binaryBoxStl());
  await page.getByRole('button', { name: 'Slice', exact: true }).click();
  await expect(page.getByTestId('slice-result')).toContainText('Print time', { timeout: 45_000 });

  await context.setOffline(true);
  await page.reload();
  expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(true);
  await configureEngine(page);
  await importStl(page, 'offline-second.stl', binaryBoxStl());
  await page.getByRole('button', { name: 'Slice', exact: true }).click();
  await expect(page.getByTestId('slice-result')).toContainText('Print time', { timeout: 45_000 });
  await context.setOffline(false);
});

test('an uncached printer selected while offline explains it needs a connection, not an engine crash', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByLabel('Printer', { exact: true })).toBeEnabled();
  await context.setOffline(true);
  await page.getByLabel('Printer', { exact: true }).selectOption('prusa-mk4-04');
  await expect(page.getByRole('alert').filter({ hasText: /connection/i })).toBeVisible();
  await context.setOffline(false);
});

test('losing and regaining connectivity updates the visible offline status without disabling cached operations', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('.connectivity-offline')).toHaveCount(0);
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.locator('.connectivity-offline')).toBeVisible();
  await expect(page.getByLabel('Printer', { exact: true })).toBeEnabled();
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('.connectivity-offline')).toHaveCount(0);
});

test('the Import step reads a 3MF into one plate object per build item', async ({ page }) => {
  await page.goto('/');
  await openImportStep(page);
  await page.getByTestId('import-file-input').setInputFiles({ name: 'pair.3mf', mimeType: 'model/3mf', buffer: threeMfWithTwoObjects() });
  await expect(page.getByText('2 models added to the plate.')).toBeVisible();
  const objects = modelsItemNames(page);
  await expect(objects).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Left wedge', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Right wedge', exact: true })).toBeVisible();
  await page.getByTestId('import-file-input').setInputFiles({ name: 'broken.3mf', mimeType: 'model/3mf', buffer: Buffer.from('not a zip') });
  await expect(page.getByRole('alert')).toContainText('not a valid 3MF archive');
  await expect(objects).toHaveCount(2);
});
