import { createSignal, For } from 'solid-js';
import type { PlateObject } from '../../app/stores/plate';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { restsOnPlate, settleAfterRotate } from '../drag-math';
import { AXIS_INDEX, AXIS_NAMES, keepAbovePlate, withPositionAxis, withRotationAxis, withScaleAxis, withUniformScale, type AxisName } from '../axis';
import {
  parseBoundedNumber, POSITION_BOUNDS_MM, ROTATION_BOUNDS_DEG, SCALE_BOUNDS_PERCENT, toDegrees, toRadians,
  transformedSize, type ObjectTransform,
} from '../transforms';
import './viewer-components.css';

export interface TransformFieldsLabels {
  close: string;
  reset: string;
  editValues: string;
  transformTitle: string;
  positionHeading: string; positionX: string; positionY: string; positionZ: string;
  rotationHeading: string; rotationX: string; rotationY: string; rotationZ: string;
  scaleHeading: string; scaleX: string; scaleY: string; scaleZ: string; scaleLink: string;
  dimensionsHeading: string; dimensionX: string; dimensionY: string; dimensionZ: string;
  resizeTransformSheet: string;
}

export interface TransformFieldsProps {
  open: boolean;
  object: PlateObject;
  labels: TransformFieldsLabels;
  onClose: () => void;
  /** Scale commits: default (re-seating) path, matching how a discrete scale change already behaves elsewhere (ScaleSheet). */
  onTransform: (transform: ObjectTransform) => void;
  /** Position/Rotation commits: the { dropToBed: false } path, the same one a live gizmo drag uses — a
   * typed value is an absolute final state, not a delta, so it must not be silently re-seated. */
  onTransformNoReseat: (transform: ObjectTransform) => void;
  onReset: () => void;
}

const Svg = (props: { d: string }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={props.d} /></svg>;
const LINK_ICON = 'M13.5 6.5l3 3a3.5 3.5 0 0 1-4.95 4.95l-1-1M10.5 17.5l-3-3a3.5 3.5 0 0 1 4.95-4.95l1 1';

const formatMm = (value: number) => value.toFixed(2);
const formatDeg = (value: number) => value.toFixed(1);
const formatPercent = (value: number) => value.toFixed(1);

const AXIS_LABEL: Record<AxisName, string> = { x: 'X', y: 'Y', z: 'Z' };

/**
 * Presentational: Position (mm) / Rotation (°) / Scale (%) numeric fields plus read-only computed
 * Dimensions (mm) and a Reset button, for the currently selected plate object — the numeric-entry
 * counterpart to on-canvas gizmo dragging (gizmo.ts), both editing the same ObjectTransform. Every
 * input commits on blur/Enter via the native `change` event (not per keystroke), exactly like
 * ScaleSheet's own field already does.
 */
export function TransformFields(props: TransformFieldsProps) {
  const [linked, setLinked] = createSignal(true);

  const position = (axis: AxisName) => props.object.transform.position[AXIS_INDEX[axis]];
  const rotationDeg = (axis: AxisName) => toDegrees(props.object.transform.rotation[AXIS_INDEX[axis]]);
  const scalePercent = (axis: AxisName) => props.object.transform.scale[AXIS_INDEX[axis]] * 100;
  const dimensions = () => transformedSize(props.object.bounds, props.object.transform);

  const revert = (input: HTMLInputElement, formatted: string) => { input.value = formatted; };

  const commitPosition = (axis: AxisName, event: Event & { currentTarget: HTMLInputElement }) => {
    const value = parseBoundedNumber(event.currentTarget.valueAsNumber, POSITION_BOUNDS_MM);
    if (value !== undefined) {
      const next = withPositionAxis(props.object.transform, axis, value);
      props.onTransformNoReseat(axis === 'z' ? keepAbovePlate(next, props.object.bounds) : next);
    }
    revert(event.currentTarget, formatMm(position(axis)));
  };

  const commitRotation = (axis: AxisName, event: Event & { currentTarget: HTMLInputElement }) => {
    const value = parseBoundedNumber(event.currentTarget.valueAsNumber, ROTATION_BOUNDS_DEG);
    if (value !== undefined) {
      const transform = props.object.transform;
      const wasOnPlate = restsOnPlate(props.object.bounds, transform);
      const rotated = withRotationAxis(transform, axis, toRadians(value));
      props.onTransformNoReseat(settleAfterRotate(rotated, props.object.bounds, wasOnPlate));
    }
    revert(event.currentTarget, formatDeg(rotationDeg(axis)));
  };

  const commitScale = (axis: AxisName, event: Event & { currentTarget: HTMLInputElement }) => {
    const value = parseBoundedNumber(event.currentTarget.valueAsNumber, SCALE_BOUNDS_PERCENT);
    if (value !== undefined) {
      const factor = value / 100;
      const next = linked() ? withUniformScale(props.object.transform, factor) : withScaleAxis(props.object.transform, axis, factor);
      props.onTransform(next);
    }
    revert(event.currentTarget, formatPercent(scalePercent(axis)));
  };

  const positionLabel = (axis: AxisName) => ({ x: props.labels.positionX, y: props.labels.positionY, z: props.labels.positionZ }[axis]);
  const rotationLabel = (axis: AxisName) => ({ x: props.labels.rotationX, y: props.labels.rotationY, z: props.labels.rotationZ }[axis]);
  const scaleLabel = (axis: AxisName) => ({ x: props.labels.scaleX, y: props.labels.scaleY, z: props.labels.scaleZ }[axis]);
  const dimensionLabel = (axis: AxisName) => ({ x: props.labels.dimensionX, y: props.labels.dimensionY, z: props.labels.dimensionZ }[axis]);

  return <Sheet open={props.open} onClose={props.onClose} label={props.labels.transformTitle} handleLabel={props.labels.resizeTransformSheet}>
    <div class="viewer-transform-fields">
      <header><h2>{props.labels.transformTitle}</h2><Button variant="ghost" onClick={props.onClose}>{props.labels.close}</Button></header>

      <section>
        <h3>{props.labels.positionHeading}</h3>
        <div class="viewer-transform-grid">
          <For each={AXIS_NAMES}>{axis => <label>{AXIS_LABEL[axis]}
            <input class="ui-target" type="number" inputmode="decimal" step="any"
              aria-label={positionLabel(axis)} value={formatMm(position(axis))}
              onChange={event => commitPosition(axis, event)} />
          </label>}</For>
        </div>
      </section>

      <section>
        <h3>{props.labels.rotationHeading}</h3>
        <div class="viewer-transform-grid">
          <For each={AXIS_NAMES}>{axis => <label>{AXIS_LABEL[axis]}
            <input class="ui-target" type="number" inputmode="decimal" step="any"
              aria-label={rotationLabel(axis)} value={formatDeg(rotationDeg(axis))}
              onChange={event => commitRotation(axis, event)} />
          </label>}</For>
        </div>
      </section>

      <section>
        <header class="viewer-transform-section-heading">
          <h3>{props.labels.scaleHeading}</h3>
          <Button variant="secondary" icon={<Svg d={LINK_ICON} />} aria-pressed={linked()}
            aria-label={props.labels.scaleLink} onClick={() => setLinked(value => !value)} />
        </header>
        <div class="viewer-transform-grid">
          <For each={AXIS_NAMES}>{axis => <label>{AXIS_LABEL[axis]}
            <input class="ui-target" type="number" inputmode="decimal" min="0" step="any"
              aria-label={scaleLabel(axis)} value={formatPercent(scalePercent(axis))}
              onChange={event => commitScale(axis, event)} />
          </label>}</For>
        </div>
      </section>

      <Button variant="secondary" onClick={props.onReset}>{props.labels.reset}</Button>

      <section class="viewer-transform-dimensions">
        <h3>{props.labels.dimensionsHeading}</h3>
        <div class="viewer-transform-grid">
          <For each={AXIS_NAMES}>{axis => <label>{AXIS_LABEL[axis]}
            <input class="ui-target" type="number" readonly tabindex={0}
              aria-label={dimensionLabel(axis)} value={formatMm(dimensions()[AXIS_INDEX[axis]])} />
          </label>}</For>
        </div>
      </section>
    </div>
  </Sheet>;
}
