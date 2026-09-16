import { createSignal } from 'solid-js';
import { useApp } from '../../app/AppProvider';
import { plate, selectedObject } from '../../app/stores/plate';
import { configuration } from '../../app/stores/configuration';
import { TransformToolbar, type TransformToolbarLabels } from './TransformToolbar';
import { prepareCurrentPlate } from '../gizmo';

export function PlateObjectToolbar(props: { labels: TransformToolbarLabels; onPrepareError?: (message: string) => void }) {
  const [scaleOpen, setScaleOpen] = createSignal(false);
  const object = () => selectedObject();
  return <TransformToolbar object={object()} scaleOpen={scaleOpen()} labels={props.labels}
    onScaleOpen={() => setScaleOpen(true)} onScaleClose={() => setScaleOpen(false)}
    onRotate={axis => { const selected = object(); if (selected) plate.rotate90(selected.id, axis); }}
    onDuplicate={() => { const selected = object(); if (selected) plate.duplicateObject(selected.id, globalThis.crypto.randomUUID()); }}
    onDelete={() => { const selected = object(); if (selected) { plate.removeObject(selected.id); setScaleOpen(false); } }}
    onReset={() => { const selected = object(); if (selected) plate.resetTransform(selected.id); }}
    onTransform={transform => { const selected = object(); if (selected) plate.updateTransform(selected.id, transform); }}
    onDeselect={() => plate.select(undefined)}
    onLayFlat={() => void prepareCurrentPlate(1).catch(error => props.onPrepareError?.(error instanceof Error ? error.message : String(error)))} />;
}

export function ViewerToolbarContainer() {
  const { t } = useApp();
  const labels = (): TransformToolbarLabels => ({
    toolbar: t('viewer.toolbar'), deselect: t('viewer.deselect'), layFlat: t('viewer.layFlat'),
    rotateX: t('viewer.rotateX'), rotateY: t('viewer.rotateY'), scale: t('viewer.scale'), duplicate: t('viewer.duplicate'),
    delete: t('viewer.delete'), reset: t('viewer.reset'), title: t('viewer.scaleTitle'), close: t('viewer.close'), size: t('viewer.size'),
    unit: t('viewer.unit'), suspicious: t('viewer.suspiciousSize'), multiply25_4: t('viewer.multiply25_4'),
    multiply1000: t('viewer.multiply1000'), divide10: t('viewer.divide10'), keep: t('viewer.keepEntered'), resize: t('viewer.resizeSheet'),
  });
  return <PlateObjectToolbar labels={labels()} onPrepareError={message => configuration.notice.set(message)} />;
}
