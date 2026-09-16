import { Show } from 'solid-js';
import type { PlateObject } from '../../app/stores/plate';
import { Button } from '../../ui/Button';
import type { ObjectTransform } from '../transforms';
import { ScaleSheet, type ScaleSheetLabels } from './ScaleSheet';
import './viewer-components.css';

export interface TransformToolbarLabels extends ScaleSheetLabels {
  toolbar: string;
  layFlat: string;
  layFlatPending: string;
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
  onScaleOpen: () => void;
  onScaleClose: () => void;
  onRotate: (axis: 'x' | 'y') => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onReset: () => void;
  onTransform: (transform: ObjectTransform) => void;
}

export function TransformToolbar(props: TransformToolbarProps) {
  return <Show when={props.object}>{object => <>
    <div class="viewer-transform-toolbar" role="toolbar" aria-label={props.labels.toolbar}>
      <span class="viewer-disabled-action" tabindex="0" aria-describedby="viewer-lay-flat-help">
        <Button disabled>{props.labels.layFlat}</Button>
        <span id="viewer-lay-flat-help" role="tooltip">{props.labels.layFlatPending}</span>
      </span>
      <Button variant="secondary" onClick={() => props.onRotate('x')}>{props.labels.rotateX}</Button>
      <Button variant="secondary" onClick={() => props.onRotate('y')}>{props.labels.rotateY}</Button>
      <Button variant="secondary" onClick={props.onScaleOpen}>{props.labels.scale}</Button>
      <Button variant="secondary" onClick={props.onDuplicate}>{props.labels.duplicate}</Button>
      <Button variant="danger" onClick={props.onDelete}>{props.labels.delete}</Button>
      <Button variant="secondary" onClick={props.onReset}>{props.labels.reset}</Button>
    </div>
    <ScaleSheet open={props.scaleOpen} object={object()} labels={props.labels} onClose={props.onScaleClose} onTransform={props.onTransform} />
  </>}</Show>;
}
