import { For, Show, createEffect, createSignal, on, onCleanup, onMount, type Accessor, type JSX } from 'solid-js';
import type { TierDecision } from '../app/tier/decide';
import { binaries, flow } from '../app/stores';
import { plate } from '../app/stores/plate';
import { attachCameraControls, type ViewerCameraControls } from './camera';
import { ViewerToolbarContainer } from './components/ViewerToolbarContainer';
import { releaseMesh } from './geometry-cache';
import type { AxisLock } from './axis';
import { createGizmo } from './gizmo';
import { createViewerGestures, type TransformGestureMode, type ViewerGestures } from './gestures';
import { importSession } from './import-session';
import { createViewer, type Viewer } from './scene';
import { engineClient } from '../engine/client';
import { useApp } from '../app/AppProvider';
import './workspace.css';

export function ViewerWorkspace(props: {
  tierDecision: Accessor<TierDecision>;
  /** True while the G-code preview owns the stage: plate GPU buffers are released and rendering pauses. */
  previewOpen?: Accessor<boolean>;
  /** The preview surface, rendered over the canvas inside the stage. */
  preview?: JSX.Element;
}): JSX.Element {
  const app = useApp();
  let canvas!: HTMLCanvasElement;
  let viewer: Viewer | undefined;
  let controls: ViewerCameraControls | undefined;
  let gestures: ViewerGestures | undefined;
  const [readout, setReadout] = createSignal<string>();
  const [axisLock, setAxisLock] = createSignal<AxisLock>('free');
  const gizmo = createGizmo(setReadout);
  const [startError, setStartError] = createSignal<string>();
  const [viewerReady, setViewerReady] = createSignal(false);
  const error = () => startError() ?? (flow.step.get() !== 'import' ? importSession.error() : undefined);
  const busy = importSession.busy;
  const [transformMode, setTransformMode] = createSignal<TransformGestureMode>('move');
  const knownIds = new Set<string>();

  const sync = () => {
    const currentIds = new Set(plate.state.objects.map(object => object.id));
    for (const id of knownIds) if (!currentIds.has(id)) {
      releaseMesh(id); binaries.release(id); void engineClient.releaseMesh(id); knownIds.delete(id);
    }
    for (const id of currentIds) knownIds.add(id);
    viewer?.syncObjects(plate.state.objects, plate.state.selectedId);
    flow.hasModel.set(plate.state.objects.length > 0);
  };

  createEffect(() => {
    plate.state.objects.map(object => `${object.id}:${JSON.stringify(object.transform)}`).join('|');
    plate.state.selectedId;
    sync();
  });

  onMount(async () => {
    try {
      viewer = await createViewer(canvas, { widthMm: 220, depthMm: 220, heightMm: 250 }, props.tierDecision().tier);
      controls = attachCameraControls(viewer);
      gestures = createViewerGestures({
        canvas, camera: viewer.camera, controls, gizmo,
        selectedMesh: () => viewer?.meshFor(plate.state.selectedId ?? ''),
        selectedObject: () => plate.state.objects.find(object => object.id === plate.state.selectedId),
        transformMode, axisLock,
        meshAt: (x, y) => viewer?.meshAt(x, y),
        onSelect: id => plate.select(id),
        onFit: () => { if (viewer && controls && plate.state.objects.length) void controls.fit(viewer.objectRoot); },
      });
      sync(); viewer.start(); setViewerReady(true);
    } catch (reason) {
      setStartError(reason instanceof Error && reason.message ? reason.message : 'viewer-start-failed');
    }
  });

  // Opening the preview frees the plate meshes' GPU buffers (CPU arrays stay cached); returning re-uploads them.
  createEffect(on([viewerReady, () => props.previewOpen?.() ?? false], ([ready, open], previous) => {
    if (!ready || !viewer) return;
    if (open) viewer.suspend();
    else if (previous?.[1]) { viewer.resume(); sync(); }
  }));

  onCleanup(() => { gestures?.dispose(); controls?.dispose(); viewer?.dispose(); });

  const importFiles = async (files: FileList | null) => {
    await importSession.importFiles(files ? Array.from(files) : [], props.tierDecision().limits);
    sync();
  };

  const objectCount = () => app.t('viewer.objectCount').replace('{count}', String(plate.state.objects.length))
    .replace('{limit}', String(props.tierDecision().limits.objects));

  return <section class="viewer-workspace" aria-label={app.t('viewer.workspace')}>
    <header class="viewer-import">
      <label class="viewer-import-button"><span>{app.t('viewer.importModel')}</span>
        <input aria-label={app.t('viewer.importModel')} type="file" multiple
          disabled={busy()} onChange={event => { void importFiles(event.currentTarget.files); event.currentTarget.value = ''; }} />
      </label>
      <span>{objectCount()}</span>
    </header>
    <Show when={error()}>{failure => <p class="viewer-error" role="alert">{app.translateError(failure())}</p>}</Show>
    <div class="viewer-stage" style={{ position: 'relative' }}>
      <canvas ref={canvas} data-testid="viewer-canvas" aria-label={app.t('viewer.buildPlate')} />
      <Show when={plate.state.objects.length && !props.previewOpen?.()}>
        <ViewerToolbarContainer axisLock={axisLock()} onAxisLock={setAxisLock} readout={readout()} transformMode={transformMode()} onTransformMode={setTransformMode} />
      </Show>
      {props.preview}
    </div>
    <Show when={plate.state.objects.length}>
      <nav class="viewer-objects" aria-label={app.t('viewer.plateObjects')}>
        <For each={plate.state.objects}>{object =>
          <button type="button" aria-pressed={plate.state.selectedId === object.id}
            data-transform={JSON.stringify(object.transform)} onClick={() => plate.select(object.id)}>{object.name}</button>}
        </For>
      </nav>
    </Show>
  </section>;
}
