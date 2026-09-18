import { For, Show, type JSX } from 'solid-js';
import { AppProvider, useApp } from './AppProvider';
import { Layout } from './layout/Layout';
import type { Step, Tier } from './stores';
import type { Locale, TranslationKey } from '../i18n';
import type { Theme } from './theme';
import { ConfigurationContainer } from './ConfigurationContainer';
import { ViewerWorkspace } from '../viewer/ViewerWorkspace';
import { SliceActivity, SliceResults, type SliceResultLabels } from '../slice/components/SliceResults';

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
  const resultLabels = (): SliceResultLabels => ({ time: app.t('results.time'), mass: app.t('results.mass'), cost: app.t('results.cost'), layers: app.t('results.layers'),
    unavailable: app.t('results.unavailable'), priceBasis: app.t('results.priceBasis'), requested: app.t('results.requested'), effective: app.t('results.effective'),
    stale: app.t('results.stale'), slicing: app.t('results.slicing'), preparing: app.t('results.preparing'), ready: app.t('results.ready'),
    finishing: app.t('configuration.finishing'), save: app.t('results.save') });
  const results = () => <Show when={app.result.state.summary}>{summary => <SliceResults summary={summary()} stale={app.result.state.stale} currency={app.prefs.currency.get()} labels={resultLabels()} onSave={app.saveResult} />}</Show>;
  return (
    <section class="pane" aria-live="polite">
      <SliceActivity active={app.result.state.status === 'slicing'} variant={app.engine.variant.get()} finishing={app.result.state.finishingPreviousSlice} labels={resultLabels()} />
      <Show when={app.flow.step.get() === 'import'}>
        <p>{app.t('panes.import')}</p>
      </Show>
      <Show when={app.flow.step.get() === 'configure'}>
        <p>{app.t('panes.configure')}</p>
        <Show when={!app.flow.hasModel.get()}><p class="configuration-error" role="alert">{app.t('app.modelRequired')}</p></Show>
        <Show when={app.flow.hasModel.get() && !app.resolvedSettings()}><p class="configuration-error" role="alert">{app.t('app.configurationRequired')}</p></Show>
        <ConfigurationContainer />
      </Show>
      <Show when={app.result.state.status === 'error' && (app.sliceFailure() ?? app.result.state.error)}>{failure =>
        <p class="slice-error" role="alert">{app.translateError(failure())}</p>}
      </Show>
      <Show when={app.flow.step.get() === 'preview'}>
        <p>{app.t('panes.preview')}</p>
        {results()}
      </Show>
      <Show when={app.flow.step.get() === 'save'}>
        <p>{app.t('panes.save')}</p>
        {results()}
      </Show>
    </section>
  );
}

function Preferences(): JSX.Element {
  const app = useApp();
  return (
    <details class="preferences-menu">
    <summary aria-label={app.t('preferences.heading')}><span aria-hidden="true">⚙</span></summary>
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
    </details>
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
          <ViewerWorkspace tierDecision={app.tierDecision} />
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
