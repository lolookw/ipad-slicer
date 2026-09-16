import { WebGLRenderer } from 'three';
import type { TierDecision } from '../app/tier/decide';

export interface RendererLimits { dprCap: number; antialias: boolean; webgpuOptIn: boolean }

/** design.md §8: Standard gets a 1.5 DPR cap and no antialiasing; Full gets 2 and antialiasing,
 * plus the option to try WebGPU. This is pure and unit-tested; the actual renderer construction
 * below needs a real canvas and is covered by the WebKit e2e suite instead. */
export function rendererLimits(tier: TierDecision['tier']): RendererLimits {
  return tier === 'full' ? { dprCap: 2, antialias: true, webgpuOptIn: true } : { dprCap: 1.5, antialias: false, webgpuOptIn: false };
}

export interface ViewerRenderer {
  kind: 'webgpu' | 'webgl2';
  domElement: HTMLCanvasElement;
  setSize(width: number, height: number): void;
  render(sceneAndCamera: Parameters<WebGLRenderer['render']>): void;
  dispose(): void;
}

/**
 * WebGPU is a Full-tier-only, best-effort opt-in (design.md §8/§9): if the dynamic import or
 * async init fails for any reason, this falls back to WebGL2 rather than leaving the viewer
 * blank. The WebGPU path is genuinely unverified — treat any failure here as expected, not a bug.
 */
export async function createRenderer(canvas: HTMLCanvasElement, limits: RendererLimits): Promise<ViewerRenderer> {
  if (limits.webgpuOptIn) {
    try {
      const webgpu = (await import(/* @vite-ignore */ 'three/webgpu')) as typeof import('three/webgpu');
      const renderer = new webgpu.WebGPURenderer({ canvas, antialias: limits.antialias });
      await renderer.init();
      renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, limits.dprCap));
      return {
        kind: 'webgpu', domElement: canvas,
        setSize: (width, height) => renderer.setSize(width, height, false),
        render: ([scene, camera]) => renderer.render(scene, camera),
        dispose: () => renderer.dispose(),
      };
    } catch (error) {
      console.warn('WebGPU renderer unavailable, falling back to WebGL2.', error);
    }
  }
  const renderer = new WebGLRenderer({ canvas, antialias: limits.antialias, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, limits.dprCap));
  return {
    kind: 'webgl2', domElement: canvas,
    setSize: (width, height) => renderer.setSize(width, height, false),
    render: ([scene, camera]) => renderer.render(scene, camera),
    dispose: () => renderer.dispose(),
  };
}
