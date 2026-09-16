import { For, Show, type JSX } from 'solid-js';
import { AppProvider, useApp } from './AppProvider';
import { Layout } from './layout/Layout';
import type { Step, Tier } from './stores';
import type { Locale, TranslationKey } from '../i18n';
import type { Theme } from './theme';

const STEPS: { id: Step; label: TranslationKey }[] = [
  { id: 'import', label: 'steps.import' },
  { id: 'configure', label: 'steps.configure' },
  { id: 'preview', label: 'steps.preview' },
  { id: 'save', label: 'steps.save' },
];
const TIER_LABELS: Record<'standard' | 'full', TranslationKey> = {
  standard: 'preferences.standard',
  full: 'preferences.full',
};

function StepBar(): JSX.Element {
  const app = useApp();
  return (
    <nav class="step-bar" aria-label={app.t('app.stepsLabel')}>
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
              {app.t(step.label)}
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
        <p>{app.t('panes.import')}</p>
      </Show>
      <Show when={app.flow.step.get() === 'configure'}>
        <p>{app.t('panes.configure')}</p>
        <p class="configuration-error" role="alert">{app.t('app.configurationError')}</p>
      </Show>
      <Show when={app.flow.step.get() === 'preview'}>
        <p>{app.t('panes.preview')}</p>
      </Show>
      <Show when={app.flow.step.get() === 'save'}>
        <p>{app.t('panes.save')}</p>
      </Show>
    </section>
  );
}

function Preferences(): JSX.Element {
  const app = useApp();
  return (
    <fieldset class="preferences">
      <legend>{app.t('preferences.heading')}</legend>
      <label>{app.t('preferences.language')}
        <select aria-label={app.t('preferences.language')} value={app.prefs.locale.get()}
          onChange={(event) => app.setLocale(event.currentTarget.value as Locale)}>
          <option value="en">{app.t('preferences.english')}</option>
          <option value="es">{app.t('preferences.spanish')}</option>
        </select>
      </label>
      <label>{app.t('preferences.theme')}
        <select aria-label={app.t('preferences.theme')} value={app.prefs.theme.get()}
          onChange={(event) => app.setTheme(event.currentTarget.value as Theme)}>
          <option value="system">{app.t('preferences.system')}</option>
          <option value="light">{app.t('preferences.light')}</option>
          <option value="dark">{app.t('preferences.dark')}</option>
        </select>
      </label>
      <label>{app.t('preferences.performance')}
        <select aria-label={app.t('preferences.performance')} value={app.prefs.tier.get()}
          onChange={(event) => app.prefs.tier.set(event.currentTarget.value as Tier)}>
          <option value="auto">{app.t('preferences.auto')}</option>
          <option value="standard">{app.t('preferences.standard')}</option>
          <option value="full">{app.t('preferences.full')}</option>
        </select>
      </label>
      <output class="active-tier">{app.t('preferences.activeTier')}: {app.t(TIER_LABELS[app.tierDecision().tier])}</output>
    </fieldset>
  );
}

function Shell(): JSX.Element {
  const app = useApp();
  return (
    <Layout
      sidebar={
        <>
          <h1 class="title">{app.t('app.title')}</h1>
          <StepBar />
          <Preferences />
        </>
      }
      canvas={
        <>
          <StepPane />
          <p class="engine-state">{app.t('app.engine')}: <code>{app.engine.state.get()}</code></p>
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
