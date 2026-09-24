import { Show } from 'solid-js';
import type { PlateObject } from '../../app/stores/plate';
import { Button } from '../../ui/Button';
import type { GizmoMode } from '../gizmo-handles';
import type { ObjectTransform } from '../transforms';
import { ScaleSheet, type ScaleSheetLabels } from './ScaleSheet';
import './viewer-components.css';

export interface TransformToolbarLabels extends ScaleSheetLabels {
  toolbar: string;
  mode: string;
  select: string;
  move: string;
  rotate: string;
  snap: string;
  deselect: string;
  layFlat: string;
  autoOrient: string;
  rotateX: string;
  rotateY: string;
  scale: string;
  duplicate: string;
  delete: string;
  reset: string;
}

export interface TransformToolbarProps {
  object?: PlateObject;
  scaleOpen: boolean;
  labels: TransformToolbarLabels;
  readout?: string;
  snapEnabled: boolean;
  onSnapToggle: () => void;
  /** Select/Move/Rotate: which gizmo handle kind (if any) is drawn and hit-testable (gizmo-handles.ts's GizmoMode). */
  mode: GizmoMode;
  onModeChange: (mode: 'select' | 'move' | 'rotate') => void;
  onScaleOpen: () => void;
  onScaleClose: () => void;
  onRotate: (axis: 'x' | 'y') => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onReset: () => void;
  onTransform: (transform: ObjectTransform) => void;
  onDeselect: () => void;
  onLayFlat: () => void;
  onAutoOrient: () => void;
}

const Svg = (props: { d: string }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={props.d} /></svg>;
const ICONS = {
  select: 'M4 3l16 6-6.2 2.1L12 17z',
  move: 'M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3 3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l3 3',
  rotate: 'M3 12a9 9 0 1 0 3-6.7M3 3v6h6',
  snap: 'M6 4v7a6 6 0 0 0 12 0V4M6 8h4M14 8h4',
  flat: 'M4 19h16M7 15h10V9H7z',
  autoOrient: 'M12 2v4M12 18v4M2 12h4M18 12h4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  rotX: 'M4 12h16M15 7l5 5-5 5',
  rotY: 'M12 4v16M7 9l5-5 5 5',
  scale: 'M15 4h5v5M9 20H4v-5M20 4l-6 6M4 20l6-6',
  duplicate: 'M9 9h11v11H9zM5 15V5h10',
  delete: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  reset: 'M4 12a8 8 0 1 0 2.5-5.8M4 4v5h5',
  close: 'M6 6l12 12M18 6L6 18',
};

export function TransformToolbar(props: TransformToolbarProps) {
  return <Show when={props.object}>{object => <>
    <div class="viewer-transform-toolbar" role="toolbar" aria-label={props.labels.toolbar}>
      {/* Primary mode group: Select (direct manipulation only) / Move (arrows only) / Rotate (rings
       * only) — radio-button semantics via aria-pressed, one active at a time. This is the toolbar
       * the mockup's clear "Move"/"Rotate" text labels replace the old ambiguous single "Ajuste"
       * button with, and it is what lets gizmo-handles.ts draw/hit-test only one handle kind at a
       * time instead of arrows and rings always competing for the same small viewport. */}
      <div class="viewer-mode-group" role="group" aria-label={props.labels.mode}>
        <Button variant="secondary" icon={<Svg d={ICONS.select} />} aria-pressed={props.mode === 'select'}
          onClick={() => props.onModeChange('select')}>{props.labels.select}</Button>
        <Button variant="secondary" icon={<Svg d={ICONS.move} />} aria-pressed={props.mode === 'move'}
          onClick={() => props.onModeChange('move')}>{props.labels.move}</Button>
        <Button variant="secondary" icon={<Svg d={ICONS.rotate} />} aria-pressed={props.mode === 'rotate'}
          onClick={() => props.onModeChange('rotate')}>{props.labels.rotate}</Button>
      </div>
      <div class="viewer-toolbar-divider" aria-hidden="true" />
      {/* Frequent actions. */}
      <div class="viewer-secondary-actions">
        <Button variant="secondary" icon={<Svg d={ICONS.scale} />} onClick={props.onScaleOpen}>{props.labels.scale}</Button>
        <Button variant="secondary" icon={<Svg d={ICONS.duplicate} />} onClick={props.onDuplicate}>{props.labels.duplicate}</Button>
        <Button variant="danger" icon={<Svg d={ICONS.delete} />} onClick={props.onDelete}>{props.labels.delete}</Button>
        <Button variant="secondary" icon={<Svg d={ICONS.reset} />} onClick={props.onReset}>{props.labels.reset}</Button>
      </div>
      <div class="viewer-toolbar-divider" aria-hidden="true" />
      {/* Less frequent actions, kept out of the primary rail so they don't compete with Move/Rotate for space. */}
      <div class="viewer-tertiary-actions">
        <Button variant="secondary" icon={<Svg d={ICONS.snap} />} aria-pressed={props.snapEnabled}
          onClick={props.onSnapToggle}>{props.labels.snap}</Button>
        <Button variant="secondary" icon={<Svg d={ICONS.flat} />} onClick={props.onLayFlat}>{props.labels.layFlat}</Button>
        <Button variant="secondary" icon={<Svg d={ICONS.autoOrient} />} onClick={props.onAutoOrient}>{props.labels.autoOrient}</Button>
        <Button variant="secondary" icon={<Svg d={ICONS.rotX} />} onClick={() => props.onRotate('x')}>{props.labels.rotateX}</Button>
        <Button variant="secondary" icon={<Svg d={ICONS.rotY} />} onClick={() => props.onRotate('y')}>{props.labels.rotateY}</Button>
      </div>
      <Button variant="secondary" onClick={props.onDeselect} aria-label={props.labels.deselect} icon={<Svg d={ICONS.close} />} />
    </div>
    <Show when={props.readout}>{value => <output class="viewer-transform-readout">{value()}</output>}</Show>
    <ScaleSheet open={props.scaleOpen} object={object()} labels={props.labels} onClose={props.onScaleClose} onTransform={props.onTransform} />
  </>}</Show>;
}
