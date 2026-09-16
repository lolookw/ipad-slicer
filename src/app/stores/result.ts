import { createStore } from 'solid-js/store';
import type { SliceSummary } from '../../slice/summary';

export type ResultStatus = 'idle' | 'slicing' | 'success' | 'error' | 'canceled';
export interface SliceMetric { variant: 'st' | 'mt'; loadMs: number; sliceMs: number; peakHeapBytes: number; at: number }
export interface ResultState {
  status: ResultStatus;
  attempt: number;
  summary?: SliceSummary;
  error?: string;
  stale: boolean;
  finishingPreviousSlice: boolean;
  metrics: SliceMetric[];
}

const [state, setState] = createStore<ResultState>({ status: 'idle', attempt: 0, stale: false, finishingPreviousSlice: false, metrics: [] });

export function sliceInputFingerprint(settings: unknown, objects: readonly { id: string; transform: unknown }[]): string {
  return JSON.stringify({ settings, objects: objects.map(({ id, transform }) => ({ id, transform })) });
}

export const result = {
  state,
  start(): number {
    const attempt = state.attempt + 1;
    setState({ status: 'slicing', attempt, summary: undefined, error: undefined, stale: false, finishingPreviousSlice: state.finishingPreviousSlice });
    return attempt;
  },
  succeed(attempt: number, summary: SliceSummary, metric: SliceMetric): void {
    if (attempt !== state.attempt) return;
    setState({ status: 'success', summary, error: undefined, stale: false, finishingPreviousSlice: false });
    setState('metrics', values => [...values.slice(-49), metric]);
  },
  fail(attempt: number, error: string): void {
    if (attempt === state.attempt) setState({ status: 'error', summary: undefined, error, stale: false, finishingPreviousSlice: false });
  },
  cancel(finishingPreviousSlice: boolean): void {
    setState({ status: 'canceled', summary: undefined, error: undefined, stale: false, finishingPreviousSlice });
  },
  finishedPrevious(): void { setState('finishingPreviousSlice', false); },
  markStale(): void { if (state.status === 'success') setState('stale', true); },
  reset(): void { setState({ status: 'idle', summary: undefined, error: undefined, stale: false, finishingPreviousSlice: false }); },
};
