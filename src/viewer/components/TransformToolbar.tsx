import { For, Show } from 'solid-js';
import type { PlateObject } from '../../app/stores/plate';
import { Button } from '../../ui/Button';
import type { AxisLock } from '../axis';
import type { ObjectTransform } from '../transforms';
import type { TransformGestureMode } from '../gestures';
import { ScaleSheet, type ScaleSheetLabels } from './ScaleSheet';
import './viewer-components.css';

export interface TransformToolbarLabels extends ScaleSheetLabels {
  axisLock: string;
  axisFree: string;
  axisX: string;
  axisY: string;
  axisZ: string;
  toolbar: string;
  interactionMode: string;
  moveMode: string;
  rotateMode: string;
  deselect: string;
  layFlat: string;
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
  axisLock: AxisLock;
  onAxisLock: (axis: AxisLock) => void;
  readout?: string;
  transformMode: TransformGestureMode;
  onTransformMode: (mode: TransformGestureMode) => void;
  onScaleOpen: () => void;
  onScaleClose: () => void;
  onRotate: (axis: 'x' | 'y') => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onReset: () => void;
  onTransform: (transform: ObjectTransform) => void;
  onDeselect: () => void;
  onLayFlat: () => void;
}

const Svg = (props: { d: string }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={props.d} /></svg>;
const ICONS = {
  move: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
  rotate: 'M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5',
  flat: 'M4 19h16M7 15h10V9H7z',
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
      <span class="viewer-transform-modes" role="group" aria-label={props.labels.interactionMode}>
        <Button icon={<Svg d={ICONS.move} />} variant={props.transformMode === 'move' ? 'primary' : 'secondary'} aria-pressed={props.transformMode === 'move'}
          onClick={() => props.onTransformMode('move')}>{props.labels.moveMode}</Button>
        <Button icon={<Svg d={ICONS.rotate} />} variant={props.transformMode === 'rotate' ? 'primary' : 'secondary'} aria-pressed={props.transformMode === 'rotate'}
          onClick={() => props.onTransformMode('rotate')}>{props.labels.rotateMode}</Button>
      </span>
      <span class="viewer-axis-lock" role="group" aria-label={props.labels.axisLock}>
        <For each={['free', 'x', 'y', 'z'] as const}>{axis =>
          <Button variant="secondary" data-axis={axis} aria-pressed={props.axisLock === axis}
            onClick={() => props.onAxisLock(axis)}>{({ free: props.labels.axisFree, x: props.labels.axisX, y: props.labels.axisY, z: props.labels.axisZ })[axis]}</Button>
        }</For>
      </span>
      <Button variant="secondary" icon={<Svg d={ICONS.flat} />} onClick={props.onLayFlat}>{props.labels.layFlat}</Button>
      <Button variant="secondary" icon={<Svg d={ICONS.rotX} />} onClick={() => props.onRotate('x')}>{props.labels.rotateX}</Button>
      <Button variant="secondary" icon={<Svg d={ICONS.rotY} />} onClick={() => props.onRotate('y')}>{props.labels.rotateY}</Button>
      <Button variant="secondary" icon={<Svg d={ICONS.scale} />} onClick={props.onScaleOpen}>{props.labels.scale}</Button>
      <Button variant="secondary" icon={<Svg d={ICONS.duplicate} />} onClick={props.onDuplicate}>{props.labels.duplicate}</Button>
      <Button variant="danger" icon={<Svg d={ICONS.delete} />} onClick={props.onDelete}>{props.labels.delete}</Button>
      <Button variant="secondary" icon={<Svg d={ICONS.reset} />} onClick={props.onReset}>{props.labels.reset}</Button>
      <Button variant="secondary" onClick={props.onDeselect} aria-label={props.labels.deselect} icon={<Svg d={ICONS.close} />} />
    </div>
    <Show when={props.readout}>{value => <output class="viewer-transform-readout">{value()}</output>}</Show>
    <ScaleSheet open={props.scaleOpen} object={object()} labels={props.labels} onClose={props.onScaleClose} onTransform={props.onTransform} />
  </>}</Show>;
}
