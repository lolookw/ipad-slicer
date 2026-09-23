import { Show } from 'solid-js';
import type { PlateObject } from '../../app/stores/plate';
import { Button } from '../../ui/Button';
import type { ObjectTransform } from '../transforms';
import { ScaleSheet, type ScaleSheetLabels } from './ScaleSheet';
import './viewer-components.css';

export interface TransformToolbarLabels extends ScaleSheetLabels {
  toolbar: string;
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
      <Button variant="secondary" icon={<Svg d={ICONS.snap} />} aria-pressed={props.snapEnabled}
        onClick={props.onSnapToggle}>{props.labels.snap}</Button>
      <Button variant="secondary" icon={<Svg d={ICONS.flat} />} onClick={props.onLayFlat}>{props.labels.layFlat}</Button>
      <Button variant="secondary" icon={<Svg d={ICONS.autoOrient} />} onClick={props.onAutoOrient}>{props.labels.autoOrient}</Button>
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
