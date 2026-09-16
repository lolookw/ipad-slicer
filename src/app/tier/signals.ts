export interface TierSignals {
  webgl2: boolean;
  maxTextureSize: number;
  hardwareConcurrency: number;
  webgpu: boolean;
  coarsePointer: boolean;
  viewportWidth: number;
  crashMarker: boolean;
}

export const CRASH_MARKER_STORAGE_KEY = 'ipad-slicer:crash-marker';

export interface SignalEnvironment {
  createCanvas: () => HTMLCanvasElement;
  hardwareConcurrency?: number;
  webgpu: boolean;
  coarsePointer: boolean;
  viewportWidth: number;
  crashMarker: boolean;
}

export function collectTierSignals(env: SignalEnvironment): TierSignals {
  const gl = env.createCanvas().getContext('webgl2');
  const maxTextureSize = gl ? Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) : 0;
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  return {
    webgl2: Boolean(gl),
    maxTextureSize,
    hardwareConcurrency: env.hardwareConcurrency ?? 1,
    webgpu: env.webgpu,
    coarsePointer: env.coarsePointer,
    viewportWidth: env.viewportWidth,
    crashMarker: env.crashMarker,
  };
}

export function browserTierSignals(crashMarker?: boolean): TierSignals {
  const navigatorWithGpu = navigator as Navigator & { gpu?: unknown };
  const coarsePointer = globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
  const suspectedCrash = crashMarker
    ?? (typeof localStorage !== 'undefined' && localStorage.getItem(CRASH_MARKER_STORAGE_KEY) === '1');
  return collectTierSignals({
    createCanvas: () => document.createElement('canvas'),
    hardwareConcurrency: navigator.hardwareConcurrency,
    webgpu: Boolean(navigatorWithGpu.gpu),
    coarsePointer,
    viewportWidth: innerWidth,
    crashMarker: suspectedCrash,
  });
}
