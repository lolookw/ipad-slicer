// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createSignal } from 'solid-js';
import { cleanup, render, waitFor } from '@solidjs/testing-library';
import { GcodePreview } from './GcodePreview';
import { webglAvailable } from './webgl';
import type { PreviewSource } from './layer-filter';
import type { FeatureRoleValue } from './adapter';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function fakeAdapter() {
  const adapter = {
    setSource: vi.fn(), setLayerRange: vi.fn(), dispose: vi.fn(),
    setColorMode: vi.fn(), setHiddenFeatureRoles: vi.fn(), setShowTravel: vi.fn(), setShowWipe: vi.fn(), setShowRetractions: vi.fn(),
    setBuildVolume: vi.fn(),
    setView: vi.fn(), setCameraMode: vi.fn(), frame: vi.fn(), getCameraState: vi.fn(() => null), setCameraState: vi.fn(),
    capture: vi.fn(async () => new Blob()), getState: vi.fn(() => ({}) as never), onEvent: vi.fn(() => vi.fn()),
  };
  const create = vi.fn(async () => adapter);
  return { adapter, create };
}
const bytes = (n: number) => new Uint8Array(n);

it('creates the element once through the adapter with the initial source and disposes on cleanup', async () => {
  const { adapter, create } = fakeAdapter();
  const source: PreviewSource = { bytes: bytes(4), layerRange: [0, 2] };
  const view = render(() => <GcodePreview source={source} createAdapter={create} />);
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
  const [host, options] = create.mock.calls[0] as unknown as [HTMLElement, { source: Uint8Array; layerRange: [number, number] }];
  expect(host.classList.contains('gcode-preview__host')).toBe(true);
  expect(options.source).toBe(source.bytes);
  expect(options.layerRange).toEqual([0, 2]);
  view.unmount();
  expect(adapter.dispose).toHaveBeenCalledOnce();
});

it('pushes only a range update when the bytes are unchanged and a new source when they change', async () => {
  const { adapter, create } = fakeAdapter();
  const full = bytes(10);
  const [source, setSource] = createSignal<PreviewSource | null>({ bytes: full, layerRange: [0, 1] });
  render(() => <GcodePreview source={source()} createAdapter={create} />);
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
  await Promise.resolve();
  setSource({ bytes: full, layerRange: [0, 5] });
  expect(adapter.setLayerRange).toHaveBeenLastCalledWith([0, 5]);
  expect(adapter.setSource).not.toHaveBeenCalled();
  const smaller = bytes(3);
  setSource({ bytes: smaller, layerRange: null });
  expect(adapter.setSource).toHaveBeenLastCalledWith(smaller, null);
});

it('disposes an adapter that resolves after the component was unmounted', async () => {
  let resolve!: (value: ReturnType<typeof fakeAdapter>['adapter']) => void;
  const late = {
    setSource: vi.fn(), setLayerRange: vi.fn(), dispose: vi.fn(),
    setColorMode: vi.fn(), setHiddenFeatureRoles: vi.fn(), setShowTravel: vi.fn(), setShowWipe: vi.fn(), setShowRetractions: vi.fn(),
    setBuildVolume: vi.fn(),
    setView: vi.fn(), setCameraMode: vi.fn(), frame: vi.fn(), getCameraState: vi.fn(() => null), setCameraState: vi.fn(),
    capture: vi.fn(async () => new Blob()), getState: vi.fn(() => ({}) as never), onEvent: vi.fn(() => vi.fn()),
  };
  const create = vi.fn(() => new Promise<typeof late>(done => { resolve = done; }));
  const view = render(() => <GcodePreview source={{ bytes: bytes(1), layerRange: null }} createAdapter={create} />);
  view.unmount();
  resolve(late);
  await waitFor(() => expect(late.dispose).toHaveBeenCalledOnce());
});

it('reports adapter failures instead of throwing', async () => {
  const onError = vi.fn();
  render(() => <GcodePreview source={null} onError={onError} createAdapter={async () => { throw new Error('chunk failed'); }} />);
  await waitFor(() => expect(onError).toHaveBeenCalledOnce());
});

it('forwards context loss/restore and re-pushes the source after a restore', async () => {
  const { adapter, create } = fakeAdapter();
  const onLost = vi.fn();
  const source: PreviewSource = { bytes: bytes(2), layerRange: null };
  const [key, setKey] = createSignal(0);
  render(() => <GcodePreview source={source} reloadKey={key()} onContextLost={onLost} createAdapter={create} />);
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
  await Promise.resolve();
  (create.mock.calls[0] as unknown as [unknown, { onContextLost: () => void }])[1].onContextLost();
  expect(onLost).toHaveBeenCalledOnce();
  setKey(1);
  expect(adapter.setSource).toHaveBeenCalledWith(source.bytes, null);
});

it('forwards the initial color mode / declutter / toggle props at creation', async () => {
  const { create } = fakeAdapter();
  const roles: FeatureRoleValue[] = [6, 7];
  render(() => <GcodePreview source={null} colorMode="feature" hiddenFeatureRoles={roles} showTravel={false} showWipe={false} showRetractions={true} createAdapter={create} />);
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
  const options = (create.mock.calls[0] as unknown as [unknown, { colorMode: string; hiddenFeatureRoles: number[]; showTravel: boolean; showWipe: boolean; showRetractions: boolean }])[1];
  expect(options.colorMode).toBe('feature');
  expect(options.hiddenFeatureRoles).toEqual([6, 7]);
  expect(options.showTravel).toBe(false);
  expect(options.showWipe).toBe(false);
  expect(options.showRetractions).toBe(true);
});

it('reactively re-applies color mode / declutter / toggle prop changes after mount', async () => {
  const { adapter, create } = fakeAdapter();
  const [colorMode, setColorMode] = createSignal<'single' | 'feature'>('single');
  const [roles, setRoles] = createSignal<readonly FeatureRoleValue[]>([]);
  render(() => <GcodePreview source={null} colorMode={colorMode()} hiddenFeatureRoles={roles()} showTravel={true} createAdapter={create} />);
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
  await Promise.resolve();
  setColorMode('feature');
  expect(adapter.setColorMode).toHaveBeenCalledWith('feature');
  setRoles([5, 6]);
  expect(adapter.setHiddenFeatureRoles).toHaveBeenCalledWith([5, 6]);
});

it('forwards the initial build volume at creation, and re-applies it reactively via setBuildVolume', async () => {
  const { adapter, create } = fakeAdapter();
  const [buildVolume, setBuildVolume] = createSignal({ x: 220, y: 220, z: 250 });
  render(() => <GcodePreview source={null} buildVolume={buildVolume()} createAdapter={create} />);
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
  const options = (create.mock.calls[0] as unknown as [unknown, { buildVolume: { x: number; y: number; z: number } }])[1];
  expect(options.buildVolume).toEqual({ x: 220, y: 220, z: 250 });
  await Promise.resolve();
  setBuildVolume({ x: 235, y: 235, z: 270 });
  expect(adapter.setBuildVolume).toHaveBeenCalledWith({ x: 235, y: 235, z: 270 });
});

it('hands an imperative adapter handle to onReady, and clears it on cleanup', async () => {
  const { adapter, create } = fakeAdapter();
  const onReady = vi.fn();
  const view = render(() => <GcodePreview source={null} onReady={onReady} createAdapter={create} />);
  await waitFor(() => expect(onReady).toHaveBeenCalledWith(adapter));
  view.unmount();
  expect(onReady).toHaveBeenLastCalledWith(undefined);
});

it('mirrors library state to onStateChange on creation and on every subsequent event', async () => {
  const { adapter, create } = fakeAdapter();
  let emit!: () => void;
  (adapter.onEvent as ReturnType<typeof vi.fn>).mockImplementation((cb: () => void) => { emit = cb; return vi.fn(); });
  (adapter.getState as ReturnType<typeof vi.fn>).mockReturnValueOnce({ totalTimeMs: null }).mockReturnValue({ totalTimeMs: 1234 });
  const onStateChange = vi.fn();
  render(() => <GcodePreview source={null} onStateChange={onStateChange} createAdapter={create} />);
  await waitFor(() => expect(onStateChange).toHaveBeenCalledWith({ totalTimeMs: null }));
  emit();
  expect(onStateChange).toHaveBeenLastCalledWith({ totalTimeMs: 1234 });
});

it('detects missing WebGL2', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  expect(webglAvailable()).toBe(false);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ getExtension: () => null } as never);
  expect(webglAvailable()).toBe(true);
});
