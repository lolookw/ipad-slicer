// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { PreviewPanel, type PreviewLabels } from './PreviewPanel';

const optionsLabels: PreviewLabels['options'] = {
  toggle: 'Preview options', colorMode: 'Color by',
  colorModeNames: { single: 'Single', feature: 'Feature', feedrate: 'Speed', layerHeight: 'Height', object: 'Object', tool: 'Tool',
    filament: 'Filament', colorChange: 'Color change', moveKind: 'Move kind', power: 'Power' },
  featureLegend: 'Legend',
  featureRoleNames: { perimeter: 'Perimeter', externalPerimeter: 'Outer perimeter', infill: 'Infill', solidInfill: 'Solid infill',
    support: 'Support', skirt: 'Skirt', brim: 'Brim', bridge: 'Bridge', travel: 'Travel', primeTower: 'Prime tower',
    wipeTower: 'Wipe tower', raft: 'Raft', purge: 'Purge' },
  declutter: 'Hide from view', travel: 'Travel moves', wipe: 'Wipe moves', retractions: 'Retractions',
  viewPresets: 'Camera views', fit: 'Fit', top: 'Top', front: 'Front', iso: 'Iso',
  saveImage: 'Save image', saveImageBusy: 'Saving…', estimatedTime: 'Estimated time', kinematicNote: 'approximate',
};
const labels: PreviewLabels = { canvas: 'Preview', layer: 'Layer', height: 'Height', previousLayer: 'Prev', nextLayer: 'Next', layerSlider: 'Layer slider',
  loading: 'Loading', tooLarge: 'Too large', webglUnavailable: 'No WebGL', loadFailed: 'Failed', reduced: 'Reduced', options: optionsLabels };
let frames: FrameRequestCallback[] = [];
const flush = () => { const queued = frames; frames = []; queued.forEach(callback => callback(0)); };
beforeEach(() => { frames = []; vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback)); vi.stubGlobal('cancelAnimationFrame', () => undefined); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const gcode = (layers: number) => new TextEncoder().encode('G90\nM83\n' + Array.from({ length: layers }, (_, n) =>
  `;LAYER_CHANGE\n;Z:${((n + 1) * 0.2).toFixed(1)}\nG1 Z${((n + 1) * 0.2).toFixed(1)}\nG1 X${n} Y${n} E.5\n`).join('') + '; EXECUTABLE_BLOCK_END\n').buffer as ArrayBuffer;

function setup(overrides: Partial<Parameters<typeof PreviewPanel>[0]> = {}) {
  const adapter = {
    setSource: vi.fn(), setLayerRange: vi.fn(), dispose: vi.fn(),
    setColorMode: vi.fn(), setHiddenFeatureRoles: vi.fn(), setShowTravel: vi.fn(), setShowWipe: vi.fn(), setShowRetractions: vi.fn(),
    setView: vi.fn(), setCameraMode: vi.fn(), frame: vi.fn(), getCameraState: vi.fn(() => null), setCameraState: vi.fn(),
    capture: vi.fn(async () => new Blob()), getState: vi.fn(() => ({}) as never), onEvent: vi.fn(() => vi.fn()),
  };
  const create = vi.fn(async () => adapter);
  const onLog = vi.fn();
  const view = render(() => <PreviewPanel gcode={gcode(50)} tier="full" orientation="horizontal" labels={labels} onLog={onLog}
    webgl={true} createAdapter={create} {...overrides} />);
  return { adapter, create, onLog, view };
}
const options = (create: ReturnType<typeof setup>['create']) =>
  (create.mock.calls[0] as unknown as [unknown, { source: Uint8Array; layerRange: [number, number] | null; onContextLost: () => void; onContextRestored: () => void }])[1];

it('starts on the top layer with the whole G-code, and the slider only moves the visible range', async () => {
  const { adapter, create } = setup();
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
  const initial = options(create);
  expect(initial.layerRange).toEqual([0, 49]);
  expect(screen.getByTestId('layer-label').textContent).toBe('Layer 50 / 50');
  expect(screen.getByTestId('layer-height').textContent).toBe('Height 10 mm');
  await Promise.resolve();
  fireEvent.input(screen.getByRole('slider', { name: 'Layer slider' }), { target: { value: '9' } });
  flush();
  expect(adapter.setLayerRange).toHaveBeenLastCalledWith([0, 9]);
  expect(adapter.setSource).not.toHaveBeenCalled();
  expect(screen.getByTestId('layer-label').textContent).toBe('Layer 10 / 50');
  expect(screen.getByTestId('layer-height').textContent).toBe('Height 2 mm');
});

it('gives the element its own bytes: the source is the G-code view, never re-encoded, and the input buffer is untouched', async () => {
  const source = gcode(5);
  const snapshot = new Uint8Array(source.slice(0));
  const { create } = setup({ gcode: source });
  await waitFor(() => expect(create).toHaveBeenCalled());
  expect(options(create).source.byteLength).toBe(source.byteLength);
  expect(new Uint8Array(source)).toEqual(snapshot);
});

it('drops one rung per context loss with smaller sources, logs each, and ends with the memory notice while Save data is untouched', async () => {
  const source = gcode(300);
  const { adapter, create, onLog } = setup({ gcode: source });
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
  await Promise.resolve();
  const lost = options(create).onContextLost;
  const before = new Uint8Array(source.slice(0));
  const sizes: number[] = [];
  const grab = () => sizes.push((adapter.setSource.mock.calls.at(-1)![0] as Uint8Array).byteLength);
  lost(); expect(onLog).toHaveBeenCalledWith('preview-context-lost', expect.objectContaining({ from: 'all-visible', to: 'window' })); grab();
  expect(screen.queryByText('Reduced')).not.toBeNull();
  lost(); grab();
  expect(sizes[0]!).toBeLessThan(source.byteLength / 10);
  expect(sizes[1]!).toBeLessThan(sizes[0]!);
  lost();
  await waitFor(() => expect(screen.queryByText('Too large')).not.toBeNull());
  expect(adapter.dispose).toHaveBeenCalled();
  expect(screen.queryByTestId('layer-slider')).toBeNull();
  expect(new Uint8Array(source)).toEqual(before);
});

it('re-pushes the current source after the context is restored', async () => {
  const { adapter, create } = setup();
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
  await Promise.resolve();
  options(create).onContextRestored();
  expect(adapter.setSource).toHaveBeenCalledOnce();
});

it('shows the WebGL fallback without loading the preview library', async () => {
  const { create } = setup({ webgl: false });
  expect(screen.getByText('No WebGL')).toBeTruthy();
  await Promise.resolve();
  expect(create).not.toHaveBeenCalled();
});

it('shows the load failure notice when the adapter cannot be created', async () => {
  setup({ createAdapter: async () => { throw new Error('offline chunk'); } });
  await waitFor(() => expect(screen.queryByText('Failed')).not.toBeNull());
});

it('uses the Standard tier window from the start for large G-code', async () => {
  const big = gcode(400);
  const { create } = setup({ gcode: big, tier: 'standard' });
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
  expect(options(create).source.byteLength).toBeLessThan(big.byteLength / 10);
  expect(options(create).layerRange).toBeNull();
  expect(screen.queryByText('Reduced')).not.toBeNull();
});

it('marks the orientation on the surface', () => {
  setup({ orientation: 'vertical' });
  expect(document.querySelector('.gcode-preview')!.getAttribute('data-orientation')).toBe('vertical');
});
