import { For, Show, createEffect, createSignal, on, onCleanup, onMount, type Accessor, type JSX } from 'solid-js';
import type { TierDecision } from '../app/tier/decide';
import { binaries, flow } from '../app/stores';
import { plate } from '../app/stores/plate';
import { Vector3 } from 'three';
import { attachCameraControls, type ViewerCameraControls } from './camera';
import { ViewPresets, type ViewCommand } from './components/ViewPresets';
import { ViewerToolbarContainer } from './components/ViewerToolbarContainer';
import { releaseMesh } from './geometry-cache';
import { createGizmo } from './gizmo';
import { objectCenter, orbitPivot } from './drag-math';
import { createViewerGestures, type ViewerGestures } from './gestures';
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
  const [snapEnabled, setSnapEnabled] = createSignal(true);
  const gizmo = createGizmo(setReadout);
  const [startError, setStartError] = createSignal<string>();
  const [viewerReady, setViewerReady] = createSignal(false);
  const error = () => startError() ?? (flow.step.get() !== 'import' ? importSession.error() : undefined);
  const busy = importSession.busy;
  const knownIds = new Set<string>();

  const BED = { widthMm: 220, depthMm: 220, heightMm: 250 };
  const PLATE_CENTER = new Vector3(0, 0, 0);

  /** Orbit pivot rule: the selected object's center, else the plate center. */
  const applyPivot = () => {
    const selected = plate.state.objects.find(object => object.id === plate.state.selectedId);
    const pivot = orbitPivot(selected ? objectCenter(selected.bounds, selected.transform) : undefined, PLATE_CENTER);
    controls?.setPivot(pivot.x, pivot.y, pivot.z);
  };
  const runView = async (command: ViewCommand) => {
    if (!viewer || !controls) return;
    await controls.fit(viewer.boundsFor(undefined), command === 'fit' ? undefined : command);
    applyPivot();
  };

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
      viewer = await createViewer(canvas, BED, props.tierDecision().tier);
      controls = attachCameraControls(viewer, { center: [0, 0, BED.heightMm / 2], radius: Math.hypot(BED.widthMm, BED.depthMm, BED.heightMm) / 2 });
      const activeViewer = viewer;
      gestures = createViewerGestures({
        canvas, camera: viewer.camera, controls, gizmo, handles: viewer.gizmo,
        selectedId: () => plate.state.selectedId,
        objectById: id => plate.state.objects.find(object => object.id === id),
        pickAt: (x, y, radius) => activeViewer.pickAt(x, y, radius),
        snapEnabled,
        onSelect: id => plate.select(id),
        onFit: () => { if (plate.state.objects.length) void runView('fit'); },
        onVisualChange: () => activeViewer.requestRender(),
        onTransformEnd: applyPivot,
      });
      applyPivot();
      sync(); viewer.start(); setViewerReady(true);
    } catch (reason) {
      setStartError(reason instanceof Error && reason.message ? reason.message : 'viewer-start-failed');
    }
  });

  // The pivot follows selection changes; drags and fits re-apply it when they finish.
  createEffect(on(() => plate.state.selectedId, () => applyPivot(), { defer: true }));

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
        <ViewerToolbarContainer readout={readout()} snapEnabled={snapEnabled()} onSnapToggle={() => setSnapEnabled(value => !value)} />
        <ViewPresets labels={{ group: app.t('viewer.viewPresets'), fit: app.t('viewer.viewFit'), top: app.t('viewer.viewTop'), front: app.t('viewer.viewFront'), iso: app.t('viewer.viewIso') }}
          onView={command => void runView(command)} />
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
