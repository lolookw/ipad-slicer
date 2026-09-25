import { expect, it, vi } from 'vitest';
import { gcodeFileName, previewImageFileName, saveFile, saveGcode, savePreviewImage, type SaveDeps } from './save-gcode';

function fakes() {
  const anchor = { download: '', href: '', rel: '', click: vi.fn(), remove: vi.fn() };
  const document = { createElement: vi.fn(() => anchor), body: { appendChild: vi.fn() } };
  const deps: SaveDeps = {
    navigator: { canShare: vi.fn(() => true), share: vi.fn(async () => {}) },
    document: document as unknown as SaveDeps['document'],
    createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn(), setTimeout: vi.fn(),
  };
  return { anchor, document, deps };
}

it('shares synchronously with only files, preserving bytes and filename', async () => {
  const { deps } = fakes();
  const pending = saveFile('G1 é', 'cube.gcode', ['text/x.gcode'], deps);
  expect(deps.navigator!.share).toHaveBeenCalledTimes(1);
  const payload = vi.mocked(deps.navigator!.share!).mock.calls[0]![0]!;
  expect(Object.keys(payload)).toEqual(['files']);
  expect(payload.files![0]).toMatchObject({ name: 'cube.gcode', type: 'text/x.gcode', size: 5 });
  expect(await payload.files![0]!.text()).toBe('G1 é');
  expect(await pending).toEqual({ method: 'share', mimeType: 'text/x.gcode', bytes: 5 });
  expect(deps.createObjectURL).not.toHaveBeenCalled();
});

it('selects the second G-code MIME when the first cannot be shared', async () => {
  const { deps } = fakes();
  vi.mocked(deps.navigator!.canShare!).mockReturnValueOnce(false);
  expect(await saveGcode(new ArrayBuffer(3), 'cube.gcode', deps)).toEqual({
    method: 'share', mimeType: 'application/octet-stream', bytes: 3,
  });
  expect(vi.mocked(deps.navigator!.canShare!).mock.calls.map(([data]) => data!.files![0]!.type))
    .toEqual(['text/x.gcode', 'application/octet-stream']);
  expect(vi.mocked(deps.navigator!.share!).mock.calls[0]![0]!.files![0]!.type).toBe('application/octet-stream');
});

it('passes engine-produced binary bytes unchanged and leaves the source buffer intact', async () => {
  const { deps } = fakes();
  const gcode = Uint8Array.from([0, 255, 10, 71, 49]).buffer;
  await saveGcode(gcode, 'exact.gcode', deps);
  const file = vi.mocked(deps.navigator!.share!).mock.calls[0]![0]!.files![0]!;
  expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([0, 255, 10, 71, 49]);
  expect([...new Uint8Array(gcode)]).toEqual([0, 255, 10, 71, 49]);
});

it('downloads the exact bytes when the share sheet is dismissed', async () => {
  const { deps, document } = fakes();
  vi.mocked(deps.navigator!.share!).mockRejectedValue({ name: 'AbortError' });
  expect(await saveGcode(new ArrayBuffer(2), 'cube.gcode', deps))
    .toEqual({ method: 'download', mimeType: 'text/x.gcode', bytes: 2, shareError: 'AbortError' });
  expect(deps.createObjectURL).toHaveBeenCalled();
  expect(document.createElement).toHaveBeenCalledWith('a');
});

it.each(['NotAllowedError', 'missing share', 'missing canShare', 'unshareable'])('downloads on %s', async (reason) => {
  const { deps, anchor, document } = fakes();
  if (reason === 'missing share') deps.navigator = { canShare: () => true };
  else if (reason === 'missing canShare') deps.navigator = { share: vi.fn() };
  else if (reason === 'unshareable') vi.mocked(deps.navigator!.canShare!).mockReturnValue(false);
  else vi.mocked(deps.navigator!.share!).mockRejectedValue({ name: reason });
  const expected = { method: 'download', mimeType: 'text/x.gcode', bytes: 2 };
  expect(await saveFile('é', 'cube.gcode', ['text/x.gcode', 'text/plain'], deps))
    .toEqual(reason === 'NotAllowedError' ? { ...expected, shareError: 'NotAllowedError' } : expected);
  expect(document.createElement).toHaveBeenCalledWith('a');
  expect(anchor).toMatchObject({ download: 'cube.gcode', href: 'blob:test', rel: 'noopener' });
  expect(document.body.appendChild).toHaveBeenCalledWith(anchor);
  expect(anchor.click).toHaveBeenCalledTimes(1);
  expect(anchor.remove).toHaveBeenCalledTimes(1);
  expect(document.body.appendChild.mock.invocationCallOrder[0]).toBeLessThan(anchor.click.mock.invocationCallOrder[0]!);
  expect(anchor.click.mock.invocationCallOrder[0]).toBeLessThan(anchor.remove.mock.invocationCallOrder[0]!);
  const blob = vi.mocked(deps.createObjectURL!).mock.calls[0]![0];
  expect(blob.type).toBe('text/x.gcode');
  expect(await blob.text()).toBe('é');
  expect(deps.setTimeout).toHaveBeenCalledWith(expect.any(Function), 60_000);
  expect(deps.revokeObjectURL).not.toHaveBeenCalled();
  vi.mocked(deps.setTimeout!).mock.calls[0]![0]();
  expect(deps.revokeObjectURL).toHaveBeenCalledWith('blob:test');
});

it.each([
  ['cube.stl', 'cube.gcode'], ['part', 'part.gcode'], ['C:\\fakepath\\Cube.STL', 'Cube.gcode'],
  ['../parts/cube.stl', 'cube.gcode'], ['bad:na?me*.stl', 'badname.gcode'], ['', 'model.gcode'],
])('names %s safely', (input, expected) => expect(gcodeFileName(input)).toBe(expected));

it.each([
  ['cube.stl', 'image/png', 'cube-preview.png'], ['cube.stl', 'image/jpeg', 'cube-preview.jpg'],
  ['cube.stl', 'image/webp', 'cube-preview.webp'], ['', 'image/png', 'model-preview.png'],
])('names a preview image %s/%s safely', (input, mime, expected) => expect(previewImageFileName(input, mime)).toBe(expected));

it('saves a captured preview image blob through the same save/share path as the G-code', async () => {
  const { deps } = fakes();
  const blob = new Blob(['fake-png-bytes'], { type: 'image/png' });
  expect(await savePreviewImage(blob, 'cube-preview.png', deps)).toEqual({ method: 'share', mimeType: 'image/png', bytes: 14 });
  const file = vi.mocked(deps.navigator!.share!).mock.calls[0]![0]!.files![0]!;
  expect(file.name).toBe('cube-preview.png');
  expect(file.type).toBe('image/png');
  expect(await file.text()).toBe('fake-png-bytes');
});
