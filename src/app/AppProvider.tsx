import { createContext, createEffect, createMemo, createSignal, on, onCleanup, onMount, useContext, type JSX } from 'solid-js';
import { createI18n, LOCALE_STORAGE_KEY, resolveLocale, type Locale } from '../i18n';
import { ERROR_CODES, type CodedError, type ErrorCode } from '../i18n/en';
import { binaries, configuration, engine, flow, prefs, reachableSteps, resolvedSettings, result, settingsIssues, type Step } from './stores';
import { sliceInputFingerprint } from './stores/result';
import { browserThemeEnvironment, createThemeController, resolveTheme, THEME_STORAGE_KEY, type Theme } from './theme';
import { decideTier, resolveTier, TIER_STORAGE_KEY } from './tier/decide';
import { browserTierSignals, CRASH_MARKER_STORAGE_KEY, type TierSignals } from './tier/signals';
import { openSettingsDatabase } from '../storage/db';
import { hasBlockingIssues } from '../settings/validate';
import { plate } from './stores/plate';
import { encodeEngineTransforms, toEngineTransform } from '../viewer/transforms';
import { engineClient } from '../engine/client';
import { EngineClientError } from '../engine/client';
import { summarizeSlice } from '../slice/summary';
import { diagnosticsLog } from '../instrumentation/log';
import { sanitizeStack, summarizePlateObjects } from '../diagnostics/context';
import { gcodeFileName, saveGcode } from '../export/save-gcode';
import { bindConnectivityEvents, connectivity } from './stores/connectivity';
import { registerServiceWorker, requestPersistentStorage, type RegistrationHandle } from '../pwa/register';

/** iPad regular width (sidebar + canvas) versus compact width (stacked with sheets). */
const REGULAR_WIDTH = '(min-width: 700px)';

/**
 * Extra context attached to every 'engine-error' diagnostics entry, built only from what the
 * failing call site already has in scope (no new state introduced): which models were on the
 * plate, the active printer/quality selection, the loaded engine variant, and a short, redacted
 * slice of the error's own stack. This is what let a crash like yesterday's "Maximum call stack
 * size exceeded" be root-caused straight from an exported diagnostics JSON.
 */
function engineErrorContext(error: unknown) {
  return {
    ...summarizePlateObjects(plate.state.objects),
    printerId: configuration.printerId.get(),
    processId: configuration.processId.get(),
    variant: engine.variant.get(),
    stack: sanitizeStack(error instanceof Error ? error.stack : undefined),
  };
}

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
  const [sliceFailure, setSliceFailure] = createSignal<string | CodedError>();
  const [tierRevision, setTierRevision] = createSignal(0);
  const [updateDismissed, setUpdateDismissed] = createSignal(false);
  let swRegistration: RegistrationHandle | undefined;
  let persistRequested = false;
  async function maybePersist(): Promise<void> {
    if (persistRequested) return;
    persistRequested = true;
    connectivity.setPersisted(await requestPersistentStorage());
  }
  const translateError = (error: string | CodedError): string => {
    const coded = typeof error === 'string'
      ? (ERROR_CODES.includes(error as ErrorCode) ? { code: error as ErrorCode } : undefined)
      : error;
    if (!coded) return error as string;
    let message = i18n.t(`errors.${coded.code}`);
    for (const [key, value] of Object.entries(coded.values ?? {})) message = message.replace(`{${key}}`,
      typeof value === 'number' ? value.toLocaleString(prefs.locale.get()) : value);
    return message;
  };
  const themeEnvironment = browserThemeEnvironment();
  const themeController = themeEnvironment ? createThemeController(themeEnvironment) : undefined;
  const [initialTierSignals] = createSignal<TierSignals>(browserTierSignals());
  const tierDecision = createMemo(() => {
    engine.state.get(); engine.variant.get(); tierRevision();
    const crashMarker = storage?.getItem(CRASH_MARKER_STORAGE_KEY) === '1';
    return decideTier(prefs.tier.get(), { ...initialTierSignals(), crashMarker });
  });

  createEffect(() => {
    const locale = prefs.locale.get();
    storage?.setItem(LOCALE_STORAGE_KEY, locale);
    if (typeof document !== 'undefined') document.documentElement.lang = locale;
  });
  createEffect(() => themeController?.apply(prefs.theme.get()));
  createEffect(() => storage?.setItem(TIER_STORAGE_KEY, prefs.tier.get()));
  createEffect(on(() => sliceInputFingerprint(resolvedSettings(), plate.state.objects),
    () => result.markStale(), { defer: true }));
  createEffect(on(() => result.state.status, status => { if (status !== 'error') setSliceFailure(undefined); }, { defer: true }));
  createEffect(() => {
    result.state.status; result.state.finishingPreviousSlice;
    swRegistration?.notifyIdle();
  });
  onMount(() => {
    void openSettingsDatabase().then(database => database.close()).catch(() => undefined);
    void configuration.loadIndex();
    void configuration.loadCustomFilaments();
    onCleanup(bindConnectivityEvents());
    void registerServiceWorker({
      isBusy: () => result.state.status === 'slicing' || result.state.finishingPreviousSlice,
      onUpdateAvailable: () => { setUpdateDismissed(false); connectivity.setUpdateAvailable(true); },
    }).then(handle => { swRegistration = handle; });
    if (typeof window !== 'undefined') {
      const onInstalled = () => void maybePersist();
      window.addEventListener('appinstalled', onInstalled);
      onCleanup(() => window.removeEventListener('appinstalled', onInstalled));
    }
  });
  onCleanup(() => themeController?.dispose());

  return {
    prefs,
    flow,
    engine,
    binaries,
    configuration,
    resolvedSettings,
    result,
    sliceFailure,
    isRegular,
    t: i18n.t,
    translateError,
    tierDecision,
    setLocale(locale: Locale): void { prefs.locale.set(locale); },
    setTheme(theme: Theme): void { prefs.theme.set(theme); },
    retryMultithread(): void { engineClient.retryMultithread(); setTierRevision(value => value + 1); },
    async startSlice(): Promise<void> {
      const settings = resolvedSettings(); const issues = settingsIssues();
      if (!settings || hasBlockingIssues(issues) || !plate.state.objects.length) return;
      const attempt = result.start(); binaries.deleteResult('current'); flow.hasResult.set(false); engine.state.set('slicing'); engine.message.set(undefined);
      const objects = plate.state.objects.map(object => ({ meshId: object.id,
        transform: encodeEngineTransforms([toEngineTransform(object.transform)]), extruderId: 1 }));
      try {
        const sliced = await engineClient.slice(JSON.stringify(settings), objects);
        if (!sliced) { result.finishedPrevious(); if (result.state.attempt === attempt) engine.state.set('idle'); return; }
        const nativePrice = settings.filament_cost; const price = Number(Array.isArray(nativePrice) ? nativePrice[0] : nativePrice);
        const summary = summarizeSlice(sliced.gcode, sliced.statistics, settings, Number.isFinite(price) ? price : undefined, prefs.currency.get());
        binaries.putResult('current', sliced.gcode); result.succeed(attempt, summary, { variant: sliced.variant, loadMs: sliced.loadMs,
          sliceMs: sliced.sliceMs, peakHeapBytes: sliced.peakHeapBytes, at: Date.now() });
        diagnosticsLog.append('slice-done', { variant: sliced.variant, loadMs: sliced.loadMs, sliceMs: sliced.sliceMs,
          peakHeapBytes: sliced.peakHeapBytes, gcodeBytes: sliced.gcode.byteLength });
        flow.hasResult.set(true); engine.state.set('ready'); engine.variant.set(sliced.variant); flow.step.set('preview');
      } catch (error) {
        const failure = error instanceof EngineClientError ? { code: error.code, values: error.values }
          : error instanceof Error ? error.message : String(error);
        const message = error instanceof Error ? error.message : String(error);
        diagnosticsLog.append('engine-error', { stage: 'slice', message, ...engineErrorContext(error) });
        result.fail(attempt, typeof failure === 'string' ? failure : failure.code); setSliceFailure(failure);
        flow.hasResult.set(false); engine.state.set('error'); engine.message.set(message);
      }
    },
    cancelSlice(): void {
      const canceled = engineClient.cancelSlice(); result.cancel(canceled.finishingPreviousSlice);
      binaries.deleteResult('current'); flow.hasResult.set(false); engine.state.set('idle');
      diagnosticsLog.append('slice-cancel', { variant: engine.variant.get(), finishingPreviousSlice: canceled.finishingPreviousSlice });
    },
    saveResult(): void {
      const gcode = binaries.getResult('current'); if (!gcode) return;
      const fileName = gcodeFileName(plate.state.objects[0]?.name ?? 'model.stl');
      void saveGcode(gcode, fileName).then(saved => { diagnosticsLog.append('gcode-save', saved); void maybePersist(); }, error =>
        diagnosticsLog.append('engine-error', { stage: 'export', message: error instanceof Error ? error.message : String(error), ...engineErrorContext(error) }));
    },
    connectivity,
    updateToastOpen(): boolean { return connectivity.updateAvailable() && !updateDismissed(); },
    applyUpdate(): void { swRegistration?.applyUpdate(); setUpdateDismissed(true); },
    dismissUpdate(): void { setUpdateDismissed(true); },
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
  const value = createAppValue();
  return <AppContext.Provider value={value}>{props.children}</AppContext.Provider>;
}

export function useApp(): AppValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider');
  return value;
}
