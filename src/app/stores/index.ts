import { createSignal, type Accessor, type Setter } from 'solid-js';

/**
 * Domain stores for the app shell. Large binary values (meshes, G-code, Three.js objects)
 * are kept in id-keyed plain Maps, never inside reactive proxies, so Solid never walks them.
 */

export type Step = 'import' | 'configure' | 'preview' | 'save';
export type Tier = 'auto' | 'standard' | 'full';
export type EngineState = 'idle' | 'loading' | 'ready' | 'slicing' | 'error';

export interface Signal<T> {
  get: Accessor<T>;
  set: Setter<T>;
}

function signal<T>(initial: T): Signal<T> {
  const [get, set] = createSignal(initial);
  return { get, set };
}

/** User preferences that survive reloads (persisted by later slices). */
export const prefs = {
  locale: signal<'en' | 'es'>('en'),
  theme: signal<'system' | 'light' | 'dark'>('system'),
  tier: signal<Tier>('auto'),
  currency: signal('USD'),
};

/** Where the user is in the guided flow, and which steps are reachable. */
export const flow = {
  step: signal<Step>('configure'),
  hasModel: signal(false),
  hasResult: signal(false),
};

/** Engine lifecycle as reported by the worker. */
export const engine = {
  state: signal<EngineState>('idle'),
  variant: signal<'st' | 'mt' | undefined>(undefined),
  message: signal<string | undefined>(undefined),
};

/** Binary payloads live outside the reactive graph, addressed by id. */
const meshes = new Map<string, Blob>();
const results = new Map<string, ArrayBuffer>();

export const binaries = {
  putMesh(id: string, blob: Blob): void {
    meshes.set(id, blob);
  },
  getMesh(id: string): Blob | undefined {
    return meshes.get(id);
  },
  putResult(id: string, gcode: ArrayBuffer): void {
    results.set(id, gcode);
  },
  getResult(id: string): ArrayBuffer | undefined {
    return results.get(id);
  },
  deleteResult(id: string): void { results.delete(id); },
  /** Frees a model and its slice output together, so nothing outlives the plate entry. */
  release(id: string): void {
    meshes.delete(id);
    results.delete(id);
  },
  clear(): void {
    meshes.clear();
    results.clear();
  },
  get size(): { meshes: number; results: number } {
    return { meshes: meshes.size, results: results.size };
  },
};

/** Steps the user may open right now; the shell disables the rest. */
export function reachableSteps(): Step[] {
  const steps: Step[] = ['import', 'configure'];
  if (flow.hasModel.get()) steps.push('preview');
  if (flow.hasResult.get()) steps.push('save');
  return steps;
}

export * from './configuration';
export { result } from './result';
