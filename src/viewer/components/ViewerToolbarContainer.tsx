import { createSignal, Show } from 'solid-js';
import { useApp } from '../../app/AppProvider';
import { plate, selectedObject } from '../../app/stores/plate';
import { resolvedSettings } from '../../app/stores/configuration';
import { TransformToolbar, type TransformToolbarLabels } from './TransformToolbar';
import { prepareCurrentPlate } from '../gizmo';
import { findBestOrientation, resolveAutoOrientPlacement } from '../auto-orient';
import { bedSizeFromSettings } from '../bed';
import { getMeshBuffers } from '../geometry-cache';
import { EngineClientError } from '../../engine/client';
import type { CodedError } from '../../i18n/en';

/**
 * Matches ViewerWorkspace.tsx's own hardcoded default bed (the 3D viewer does not yet size its bed
 * from the configured printer). Used only to bound the auto-orient free-position search; when a
 * printer profile is configured, its real printable_area is used instead via bedSizeFromSettings.
 */
const DEFAULT_BED_FOOTPRINT = { widthMm: 220, depthMm: 220 };

export function PlateObjectToolbar(props: {
  labels: TransformToolbarLabels;
  onPrepareError?: (message: string) => void;
  /** Auto orient found no fully free spot for the object and fell back to centering it on the plate. */
  onAutoOrientNoFreeSpot?: () => void;
  translateError?: (error: string | CodedError) => string;
  readout?: string;
  snapEnabled?: boolean;
  onSnapToggle?: () => void;
}) {
  const [scaleOpen, setScaleOpen] = createSignal(false);
  const object = () => selectedObject();
  const translate = (error: unknown): string => {
    const coded = error instanceof EngineClientError ? { code: error.code, values: error.values }
      : error instanceof Error ? error.message : String(error);
    return props.translateError ? props.translateError(coded) : typeof coded === 'string' ? coded : coded.code;
  };
  return <TransformToolbar object={object()} scaleOpen={scaleOpen()} labels={props.labels}
    readout={props.readout} snapEnabled={props.snapEnabled ?? true} onSnapToggle={props.onSnapToggle ?? (() => undefined)}
    onScaleOpen={() => setScaleOpen(true)} onScaleClose={() => setScaleOpen(false)}
    onRotate={axis => { const selected = object(); if (selected) plate.rotate90(selected.id, axis); }}
    onDuplicate={() => { const selected = object(); if (selected) plate.duplicateObject(selected.id, globalThis.crypto.randomUUID()); }}
    onDelete={() => { const selected = object(); if (selected) { plate.removeObject(selected.id); setScaleOpen(false); } }}
    onReset={() => { const selected = object(); if (selected) plate.resetTransform(selected.id); }}
    onTransform={transform => { const selected = object(); if (selected) plate.updateTransform(selected.id, transform); }}
    onDeselect={() => plate.select(undefined)}
    onLayFlat={() => void prepareCurrentPlate(1).catch(error => props.onPrepareError?.(translate(error)))}
    onAutoOrient={() => {
      const selected = object();
      if (!selected) return;
      const mesh = getMeshBuffers(selected.id);
      if (!mesh) return; // import still in flight — same guard scene.ts's syncObjects uses for an unready mesh
      const oriented = findBestOrientation({ positions: mesh.positions, triangleCount: mesh.triangleCount }, selected.bounds, selected.transform);
      const others = plate.state.objects.filter(candidate => candidate.id !== selected.id);
      const bed = (() => { const settings = resolvedSettings(); return settings ? bedSizeFromSettings(settings) : DEFAULT_BED_FOOTPRINT; })();
      const placed = resolveAutoOrientPlacement({ bounds: selected.bounds, transform: oriented.transform }, others, bed);
      plate.updateTransform(selected.id, placed.transform, { dropToBed: false });
      if (!placed.freeSpotFound) props.onAutoOrientNoFreeSpot?.();
    }} />;
}

export function ViewerToolbarContainer(props: { readout?: string; snapEnabled: boolean; onSnapToggle: () => void }) {
  const app = useApp();
  const { t } = app;
  // configuration.notice only renders inside ConfigurationContainer, which is unmounted while this
  // step (import/viewer) is active — setting it here from Lay flat or Auto orient would silently do
  // nothing visible. This toolbar owns its own notice instead, so a prepare failure or a "no free
  // spot" placement warning is always shown wherever the user actually triggered it.
  const [notice, setNotice] = createSignal<string>();
  const labels = (): TransformToolbarLabels => ({
    toolbar: t('viewer.toolbar'), snap: t('viewer.snap'),
    deselect: t('viewer.deselect'), layFlat: t('viewer.layFlat'), autoOrient: t('viewer.autoOrient'),
    rotateX: t('viewer.rotateX'), rotateY: t('viewer.rotateY'), scale: t('viewer.scale'), duplicate: t('viewer.duplicate'),
    delete: t('viewer.delete'), reset: t('viewer.reset'), title: t('viewer.scaleTitle'), close: t('viewer.close'), size: t('viewer.size'),
    unit: t('viewer.unit'), suspicious: t('viewer.suspiciousSize'), multiply25_4: t('viewer.multiply25_4'),
    multiply1000: t('viewer.multiply1000'), divide10: t('viewer.divide10'), keep: t('viewer.keepEntered'), resize: t('viewer.resizeSheet'),
  });
  return <>
    <Show when={notice()}>{message => <p class="viewer-toolbar-notice" role="alert">{message()}</p>}</Show>
    <PlateObjectToolbar labels={labels()} readout={props.readout} snapEnabled={props.snapEnabled} onSnapToggle={props.onSnapToggle}
      translateError={app.translateError} onPrepareError={message => setNotice(message)}
      onAutoOrientNoFreeSpot={() => setNotice(t('viewer.autoOrientNoFreeSpot'))} />
  </>;
}
