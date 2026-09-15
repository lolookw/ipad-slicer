import { createContext, createSignal, onCleanup, useContext, type JSX } from 'solid-js';
import { binaries, engine, flow, prefs, reachableSteps, type Step } from './stores';

/** iPad regular width (sidebar + canvas) versus compact width (stacked with sheets). */
const REGULAR_WIDTH = '(min-width: 700px)';

function createLayoutSignal() {
  const query = globalThis.matchMedia?.(REGULAR_WIDTH);
  const [isRegular, setIsRegular] = createSignal(query?.matches ?? true);
  if (query) {
    const update = (event: MediaQueryListEvent) => setIsRegular(event.matches);
    query.addEventListener('change', update);
    onCleanup(() => query.removeEventListener('change', update));
  }
  return isRegular;
}

function createAppValue() {
  const isRegular = createLayoutSignal();
  return {
    prefs,
    flow,
    engine,
    binaries,
    isRegular,
    reachableSteps,
    /** Navigation is refused for steps the flow has not unlocked yet. */
    goTo(step: Step): boolean {
      if (!reachableSteps().includes(step)) return false;
      flow.step.set(step);
      return true;
    },
  };
}

export type AppValue = ReturnType<typeof createAppValue>;

const AppContext = createContext<AppValue>();

export function AppProvider(props: { children: JSX.Element }): JSX.Element {
  return <AppContext.Provider value={createAppValue()}>{props.children}</AppContext.Provider>;
}

export function useApp(): AppValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider');
  return value;
}
