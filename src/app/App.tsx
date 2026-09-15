import { For, Show, type JSX } from 'solid-js';
import { AppProvider, useApp } from './AppProvider';
import { Layout } from './layout/Layout';
import type { Step } from './stores';

const STEPS: { id: Step; label: string }[] = [
  { id: 'import', label: 'Import' },
  { id: 'configure', label: 'Configure' },
  { id: 'preview', label: 'Preview' },
  { id: 'save', label: 'Save' },
];

function StepBar(): JSX.Element {
  const app = useApp();
  return (
    <nav class="step-bar" aria-label="Slicing steps">
      <For each={STEPS}>
        {(step) => {
          const reachable = () => app.reachableSteps().includes(step.id);
          return (
            <button
              type="button"
              class="step"
              aria-current={app.flow.step.get() === step.id ? 'step' : undefined}
              disabled={!reachable()}
              onClick={() => app.goTo(step.id)}
            >
              {step.label}
            </button>
          );
        }}
      </For>
    </nav>
  );
}

function StepPane(): JSX.Element {
  const app = useApp();
  return (
    <section class="pane" aria-live="polite">
      <Show when={app.flow.step.get() === 'import'}>
        <p>Import a model to start. Slice settings stay available while you choose.</p>
      </Show>
      <Show when={app.flow.step.get() === 'configure'}>
        <p>Printer, material and quality live here. Simple mode is the default.</p>
      </Show>
      <Show when={app.flow.step.get() === 'preview'}>
        <p>The plate and, after slicing, the toolpath preview appear here.</p>
      </Show>
      <Show when={app.flow.step.get() === 'save'}>
        <p>Save the G-code to Files or share it.</p>
      </Show>
    </section>
  );
}

function Shell(): JSX.Element {
  const app = useApp();
  return (
    <Layout
      sidebar={
        <>
          <h1 class="title">iPad Slicer</h1>
          <StepBar />
        </>
      }
      canvas={
        <>
          <StepPane />
          <p class="engine-state">Engine: {app.engine.state.get()}</p>
        </>
      }
    />
  );
}

export function App(): JSX.Element {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
