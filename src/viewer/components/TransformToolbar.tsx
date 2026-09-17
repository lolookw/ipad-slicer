import { Show } from 'solid-js';
import type { PlateObject } from '../../app/stores/plate';
import { Button } from '../../ui/Button';
import type { ObjectTransform } from '../transforms';
import type { TransformGestureMode } from '../gestures';
import { ScaleSheet, type ScaleSheetLabels } from './ScaleSheet';
import './viewer-components.css';

export interface TransformToolbarLabels extends ScaleSheetLabels {
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

export function TransformToolbar(props: TransformToolbarProps) {
  return <Show when={props.object}>{object => <>
    <div class="viewer-transform-toolbar" role="toolbar" aria-label={props.labels.toolbar}>
      <span class="viewer-transform-modes" role="group" aria-label={props.labels.interactionMode}>
        <Button variant={props.transformMode === 'move' ? 'primary' : 'secondary'} aria-pressed={props.transformMode === 'move'}
          onClick={() => props.onTransformMode('move')}>{props.labels.moveMode}</Button>
        <Button variant={props.transformMode === 'rotate' ? 'primary' : 'secondary'} aria-pressed={props.transformMode === 'rotate'}
          onClick={() => props.onTransformMode('rotate')}>{props.labels.rotateMode}</Button>
      </span>
      <Button onClick={props.onLayFlat}>{props.labels.layFlat}</Button>
      <Button variant="secondary" onClick={() => props.onRotate('x')}>{props.labels.rotateX}</Button>
      <Button variant="secondary" onClick={() => props.onRotate('y')}>{props.labels.rotateY}</Button>
      <Button variant="secondary" onClick={props.onScaleOpen}>{props.labels.scale}</Button>
      <Button variant="secondary" onClick={props.onDuplicate}>{props.labels.duplicate}</Button>
      <Button variant="danger" onClick={props.onDelete}>{props.labels.delete}</Button>
      <Button variant="secondary" onClick={props.onReset}>{props.labels.reset}</Button>
      <Button variant="secondary" onClick={props.onDeselect} aria-label={props.labels.deselect}>✕</Button>
    </div>
    <ScaleSheet open={props.scaleOpen} object={object()} labels={props.labels} onClose={props.onScaleClose} onTransform={props.onTransform} />
  </>}</Show>;
}
