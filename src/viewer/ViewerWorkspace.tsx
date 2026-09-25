import { Show, createEffect, createSignal, on, onCleanup, onMount, type Accessor, type JSX } from 'solid-js';
import type { TierDecision } from '../app/tier/decide';
import { binaries, flow } from '../app/stores';
import { plate } from '../app/stores/plate';
import { canRedo, canUndo, record, recordAsync } from '../app/stores/history';
import { Vector3 } from 'three';
import { attachCameraControls, type ViewerCameraControls } from './camera';
import { ModelsList, type ModelsListLabels } from './components/ModelsList';
import { ViewPresets, type ViewCommand } from './components/ViewPresets';
import { ViewerToolbarContainer } from './components/ViewerToolbarContainer';
import { duplicateMeshBuffers, releaseMesh } from './geometry-cache';
import { createGizmo } from './gizmo';
import type { GizmoMode } from './gizmo-handles';
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
  /** Select/Move/Rotate mode toolbar: which gizmo handle kind (if any) is drawn and hit-testable. */
  const [mode, setMode] = createSignal<GizmoMode>('select');
  /**
   * Wide/desktop only (narrow always shows the models strip inline, see viewer-components.css):
   * whether the Models drawer is open. Defaults open: the drawer is an absolute overlay (it never
   * changes the stage's own computed size — see workspace.css), so opening it by default costs
   * nothing toward the "bigger viewer" fix, while defaulting it CLOSED would hide the object's own
   * name button (the plate's primary select/rename/duplicate/delete surface) behind an extra tap on
   * every wide layout, which is a functional regression, not just a cosmetic default.
   */
  const [modelsOpen, setModelsOpen] = createSignal(true);
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
      activeViewer.gizmo.setMode(mode());
      applyPivot();
      sync(); viewer.start(); setViewerReady(true);
    } catch (reason) {
      setStartError(reason instanceof Error && reason.message ? reason.message : 'viewer-start-failed');
    }
  });

  // The pivot follows selection changes; drags and fits re-apply it when they finish.
  createEffect(on(() => plate.state.selectedId, () => applyPivot(), { defer: true }));

  // The mode toolbar (Select/Move/Rotate) only changes which handles gizmo-handles.ts draws and
  // hit-tests; it never touches gestures.ts's own priority (handle > body > camera), so direct body
  // drag-to-move and click-to-select keep working in every mode, exactly as before this toolbar existed.
  createEffect(on(mode, (next) => { viewer?.gizmo.setMode(next); viewer?.requestRender(); }, { defer: true }));

  // Opening the preview frees the plate meshes' GPU buffers (CPU arrays stay cached); returning re-uploads them.
  createEffect(on([viewerReady, () => props.previewOpen?.() ?? false], ([ready, open], previous) => {
    if (!ready || !viewer) return;
    if (open) viewer.suspend();
    else if (previous?.[1]) { viewer.resume(); sync(); }
  }));

  onCleanup(() => { gestures?.dispose(); controls?.dispose(); viewer?.dispose(); });

  const importFiles = async (files: FileList | null) => {
    // One "Import model" file-picker action counts as one history entry, however many files/objects it adds.
    await recordAsync(() => importSession.importFiles(files ? Array.from(files) : [], props.tierDecision().limits));
    sync();
  };

  const objectCount = () => app.t('viewer.objectCount').replace('{count}', String(plate.state.objects.length))
    .replace('{limit}', String(props.tierDecision().limits.objects));

  const modelsListLabels = (): ModelsListLabels => ({
    hide: name => app.t('viewer.modelsHide').replace('{name}', name),
    show: name => app.t('viewer.modelsShow').replace('{name}', name),
    menu: name => app.t('viewer.modelsMenu').replace('{name}', name),
    duplicate: name => app.t('viewer.modelsDuplicate').replace('{name}', name),
    delete: name => app.t('viewer.modelsDelete').replace('{name}', name),
    rename: name => app.t('viewer.modelsRename').replace('{name}', name),
    renamePrompt: app.t('viewer.modelsRenamePrompt'),
  });

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
      {/* Undo can be the only way back after deleting the plate's last object, and Redo must stay
       * reachable even after undoing every last one of those objects away, so this stays mounted
       * whenever there is either a live object OR history in EITHER direction to act on — not gated
       * on object count alone like the camera-view/Models-drawer controls just below, which have
       * nothing meaningful to do on a truly empty plate. */}
      <Show when={(plate.state.objects.length || canUndo() || canRedo()) && !props.previewOpen?.()}>
        <ViewerToolbarContainer readout={readout()} snapEnabled={snapEnabled()} onSnapToggle={() => setSnapEnabled(value => !value)}
          mode={mode()} onModeChange={setMode} />
      </Show>
      <Show when={plate.state.objects.length && !props.previewOpen?.()}>
        <ViewPresets labels={{ group: app.t('viewer.viewPresets'), fit: app.t('viewer.viewFit'), top: app.t('viewer.viewTop'), front: app.t('viewer.viewFront'), iso: app.t('viewer.viewIso') }}
          onView={command => void runView(command)} />
        {/* Wide layout only (viewer-components.css hides this under 1000px, where the list below is
         * always shown inline instead): toggles the Models drawer without permanently narrowing the
         * viewer's own sizing (see workspace.css). */}
        <button type="button" class="viewer-models-toggle" aria-pressed={modelsOpen()} aria-expanded={modelsOpen()}
          onClick={() => setModelsOpen(value => !value)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" /></svg>
          <span>{app.t('viewer.models')}</span>
        </button>
      </Show>
      {props.preview}
    </div>
    <Show when={plate.state.objects.length}>
      <ModelsList objects={plate.state.objects} selectedId={plate.state.selectedId} label={app.t('viewer.plateObjects')}
        labels={modelsListLabels()} open={modelsOpen()}
        onSelect={id => plate.select(id)}
        onToggleVisible={id => {
          const current = plate.state.objects.find(object => object.id === id);
          if (current) record(() => plate.setVisible(id, current.visible === false));
        }}
        onDuplicate={id => {
          const newId = globalThis.crypto.randomUUID();
          record(() => {
            duplicateMeshBuffers(id, newId); // mesh data must exist before the store's syncObjects effect looks for it
            plate.duplicateObject(id, newId);
          });
        }}
        onDelete={id => record(() => plate.removeObject(id))}
        onRename={(id, name) => record(() => plate.renameObject(id, name))} />
    </Show>
  </section>;
}
