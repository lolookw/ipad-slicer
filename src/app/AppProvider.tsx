import { createContext, createEffect, createMemo, createSignal, onCleanup, onMount, useContext, type JSX } from 'solid-js';
import { createI18n, LOCALE_STORAGE_KEY, resolveLocale, type Locale } from '../i18n';
import { binaries, engine, flow, prefs, reachableSteps, type Step } from './stores';
import { browserThemeEnvironment, createThemeController, resolveTheme, THEME_STORAGE_KEY, type Theme } from './theme';
import { decideTier, resolveTier, TIER_STORAGE_KEY } from './tier/decide';
import { browserTierSignals, type TierSignals } from './tier/signals';
import { openSettingsDatabase } from '../storage/db';

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
  const storage = typeof localStorage === 'undefined' ? undefined : localStorage;
  const languages = typeof navigator === 'undefined' ? [] : navigator.languages;
  prefs.locale.set(resolveLocale(storage?.getItem(LOCALE_STORAGE_KEY) ?? null, languages));
  prefs.theme.set(resolveTheme(storage?.getItem(THEME_STORAGE_KEY) ?? null));
  prefs.tier.set(resolveTier(storage?.getItem(TIER_STORAGE_KEY) ?? null));

  const i18n = createI18n(prefs.locale.get);
  const themeEnvironment = browserThemeEnvironment();
  const themeController = themeEnvironment ? createThemeController(themeEnvironment) : undefined;
  const [tierSignals] = createSignal<TierSignals>(browserTierSignals());
  const tierDecision = createMemo(() => decideTier(prefs.tier.get(), tierSignals()));

  createEffect(() => {
    const locale = prefs.locale.get();
    storage?.setItem(LOCALE_STORAGE_KEY, locale);
    if (typeof document !== 'undefined') document.documentElement.lang = locale;
  });
  createEffect(() => themeController?.apply(prefs.theme.get()));
  createEffect(() => storage?.setItem(TIER_STORAGE_KEY, prefs.tier.get()));
  onMount(() => { void openSettingsDatabase().then(database => database.close()).catch(() => undefined); });
  onCleanup(() => themeController?.dispose());

  return {
    prefs,
    flow,
    engine,
    binaries,
    isRegular,
    t: i18n.t,
    tierDecision,
    setLocale(locale: Locale): void { prefs.locale.set(locale); },
    setTheme(theme: Theme): void { prefs.theme.set(theme); },
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
