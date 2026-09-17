import { For, Show, createEffect, createSignal, onCleanup, onMount, type Accessor, type JSX } from 'solid-js';
import type { TierDecision } from '../app/tier/decide';
import { binaries, flow } from '../app/stores';
import { plate } from '../app/stores/plate';
import { attachCameraControls, type ViewerCameraControls } from './camera';
import { ViewerToolbarContainer } from './components/ViewerToolbarContainer';
import { releaseMesh } from './geometry-cache';
import { createGizmo } from './gizmo';
import { createViewerGestures, type TransformGestureMode, type ViewerGestures } from './gestures';
import { importFileToPlate } from './plate-import';
import { createViewer, type Viewer } from './scene';
import { engineClient } from '../engine/client';
import { useApp } from '../app/AppProvider';
import type { CodedError } from '../i18n/en';
import './workspace.css';

export function ViewerWorkspace(props: { tierDecision: Accessor<TierDecision> }): JSX.Element {
  const app = useApp();
  let canvas!: HTMLCanvasElement;
  let viewer: Viewer | undefined;
  let controls: ViewerCameraControls | undefined;
  let gestures: ViewerGestures | undefined;
  const gizmo = createGizmo();
  const [error, setError] = createSignal<string | CodedError>();
  const [busy, setBusy] = createSignal(false);
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
        transformMode,
        meshAt: (x, y) => viewer?.meshAt(x, y),
        onSelect: id => plate.select(id),
        onFit: () => { if (viewer && controls && plate.state.objects.length) void controls.fit(viewer.objectRoot); },
      });
      sync(); viewer.start();
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : 'viewer-start-failed');
    }
  });

  onCleanup(() => { gestures?.dispose(); controls?.dispose(); viewer?.dispose(); });

  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setError(undefined);
    for (const file of Array.from(files)) {
      const result = await importFileToPlate(file, props.tierDecision().limits);
      if (!result.ok) { setError(result.error); break; }
    }
    setBusy(false); sync();
  };

  const objectCount = () => app.t('viewer.objectCount').replace('{count}', String(plate.state.objects.length))
    .replace('{limit}', String(props.tierDecision().limits.objects));

  return <section class="viewer-workspace" aria-label={app.t('viewer.workspace')}>
    <header class="viewer-import">
      <label class="viewer-import-button"><span>{app.t('viewer.importStl')}</span>
        <input aria-label={app.t('viewer.importStl')} type="file" accept=".stl,model/stl,application/sla" multiple
          disabled={busy()} onChange={event => { void importFiles(event.currentTarget.files); event.currentTarget.value = ''; }} />
      </label>
      <span>{objectCount()}</span>
    </header>
    <Show when={error()}>{failure => <p class="viewer-error" role="alert">{app.translateError(failure())}</p>}</Show>
    <div class="viewer-stage" style={{ position: 'relative' }}>
      <canvas ref={canvas} data-testid="viewer-canvas" aria-label={app.t('viewer.buildPlate')} />
      <Show when={plate.state.objects.length}>
        <ViewerToolbarContainer transformMode={transformMode()} onTransformMode={setTransformMode} />
      </Show>
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
