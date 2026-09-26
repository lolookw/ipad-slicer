import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';

/**
 * A line with a real, consistent pixel width at any camera angle or device pixel ratio — unlike
 * THREE.Line/LineSegments, whose `gl.LINES` primitive is clamped to 1px on almost every WebGL
 * driver/platform, which is what made the bed grid and axes look aliased/jagged as the camera
 * orbited. `positions` is a flat xyz-per-vertex array, consecutive pairs forming one segment each.
 * LineSegments2.onBeforeRender keeps the material's `resolution` uniform in sync with the
 * renderer's actual viewport on every frame, so no manual resize wiring is needed here.
 */
export function createFatLine(positions: readonly number[], color: number, widthPx: number): LineSegments2 {
  const geometry = new LineSegmentsGeometry().setPositions(positions as number[]);
  const material = new LineMaterial({ color, linewidth: widthPx });
  return new LineSegments2(geometry, material);
}
