import { createSignal } from 'solid-js';
import { loadCatalogIndex } from '../../catalog/index-client';
import { loadPrinterPack } from '../../catalog/pack-client';
import type { CatalogIndex, CatalogModel, NativeSettings, PackFilament, PrinterPack } from '../../catalog/types';
import { mergePackSelection } from '../../catalog/merge';
import { injectCustomFilaments } from '../../catalog/custom-filament';
import { availableQualityLadder, type Quality } from '../../settings/ladder';
import { mergeResolvedSettings, resetOverride, type SettingsOverrides } from '../../settings/merge';
import { validateSettings, type ValidationContext } from '../../settings/validate';
import type { SettingKey, SettingValue } from '../../settings/schema';
import { PresetRepository } from '../../storage/presets-repo';

export type SettingsMode = 'simple' | 'advanced';
export type ConfigurationError = 'profileUnavailable' | 'offlinePack' | 'invalidCustom' | 'invalidCustomFilament' | 'invalidImport';

const signal = <T,>(initial: T) => {
  const [get, set] = createSignal(initial);
  return { get, set };
};

function number(settings: NativeSettings, key: string, fallback: number): number {
  const value = settings[key];
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// filamentId defaults to the currently selected filament, but a caller validating a specific
// profile (an imported preset, a custom-printer draft) MUST pass that profile's own filament id
// explicitly — falling back to whatever happens to be selected in the live UI (or to nothing,
// which widens the safe range to a generic default) would validate against the wrong material.
export function validationContext(pack: PrinterPack, filamentId?: string): ValidationContext {
  const filament = pack.filaments.find(item => item.id === (filamentId ?? configuration.filamentId.get()));
  const settings = filament?.settings ?? {};
  return {
    nozzleDiameter: pack.nozzle,
    nozzleTemperature: [number(settings, 'nozzle_temperature_range_low', 150), number(settings, 'nozzle_temperature_range_high', 320)],
    bedTemperature: [0, 130],
    maxSpeed: number(pack.machine, 'machine_max_speed_x', 500),
    isBambu: pack.vendor === 'BBL',
  };
}

let requestGeneration = 0;
export const configuration = {
  mode: signal<SettingsMode>('simple'),
  index: signal<CatalogIndex | undefined>(undefined),
  pack: signal<PrinterPack | undefined>(undefined),
  printerId: signal<string | undefined>(undefined),
  filamentId: signal<string | undefined>(undefined),
  processId: signal<string | undefined>(undefined),
  overrides: signal<SettingsOverrides>({}),
  loading: signal(false),
  error: signal<string | undefined>(undefined),
  errorKind: signal<ConfigurationError | undefined>(undefined),
  notice: signal<string | undefined>(undefined),
  customName: signal<string | undefined>(undefined),
  /** User-defined filaments, persisted independently of any one printer. Injected into whichever
   * pack is currently loaded (see injectCustomFilaments) so they show up in the normal filament list. */
  customFilaments: signal<PackFilament[]>([]),
  async loadIndex(): Promise<void> {
    try { this.index.set(await loadCatalogIndex()); } catch (error) { this.error.set(error instanceof Error ? error.message : String(error)); this.errorKind.set('profileUnavailable'); }
  },
  async loadCustomFilaments(): Promise<void> {
    try {
      const repository = await PresetRepository.open();
      let stored: PackFilament[];
      try { stored = (await repository.listCustomFilaments()).map(item => ({ id: item.id, name: item.name, type: item.type, settings: item.settings })); }
      finally { repository.close(); }
      this.customFilaments.set(stored);
      const pack = this.pack.get();
      if (pack) this.pack.set(injectCustomFilaments(pack, stored));
    } catch { /* IndexedDB unavailable (e.g. private browsing, jsdom tests): custom filaments just won't survive a reload */ }
  },
  async selectPrinter(id: string): Promise<void> {
    const generation = ++requestGeneration;
    this.printerId.set(id || undefined);
    this.pack.set(undefined); this.filamentId.set(undefined); this.processId.set(undefined);
    this.error.set(undefined); this.errorKind.set(undefined); this.loading.set(Boolean(id)); this.customName.set(undefined);
    if (!id) return;
    const model = this.index.get()?.vendors.flatMap(vendor => vendor.models).find(candidate => candidate.id === id);
    if (!model) { this.loading.set(false); this.error.set('Printer is unavailable.'); this.errorKind.set('profileUnavailable'); return; }
    try {
      const pack = await loadPrinterPack({ url: `/catalog/${model.pack}`, bytes: model.bytes, sha256: model.sha256 });
      if (generation === requestGeneration) this.pack.set(injectCustomFilaments(pack, this.customFilaments.get()));
    } catch (error) {
      if (generation === requestGeneration) {
        this.error.set(error instanceof Error ? error.message : String(error));
        // Offline with an uncached pack reads as a connectivity issue, not an engine crash
        // (offline-pwa: "Uncached printer selection").
        this.errorKind.set(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offlinePack' : 'profileUnavailable');
      }
    } finally { if (generation === requestGeneration) this.loading.set(false); }
  },
  selectFilament(id: string): void {
    this.filamentId.set(id || undefined);
    const pack = this.pack.get();
    const current = this.processId.get();
    if (!pack || !id || !current || !pack.combos.some(([process, filament]) => process === current && filament === id)) this.processId.set(undefined);
  },
  selectQuality(quality: Quality): void {
    const pack = this.pack.get(); const filament = this.filamentId.get();
    this.processId.set(pack && filament ? availableQualityLadder(pack, filament)[quality] : undefined);
  },
  setOverride(key: SettingKey, value: SettingValue): void { this.overrides.set(current => ({ ...current, [key]: value })); },
  resetOverride(key: SettingKey): void { this.overrides.set(current => resetOverride(current, key)); },
  useCustomPrinter(id: string, name: string, pack: PrinterPack): void {
    ++requestGeneration;
    this.pack.set(injectCustomFilaments(pack, this.customFilaments.get())); this.printerId.set(id); this.filamentId.set(undefined); this.processId.set(undefined);
    this.customName.set(name); this.error.set(undefined); this.errorKind.set(undefined); this.loading.set(false);
  },
  /** Adds a user-defined filament to whichever pack is currently loaded (selectable at every quality
   * level it offers, see injectCustomFilaments) and selects it immediately. */
  useCustomFilament(filament: PackFilament): void {
    this.customFilaments.set(current => [...current, filament]);
    const pack = this.pack.get();
    if (pack) this.pack.set(injectCustomFilaments(pack, [filament]));
    this.filamentId.set(filament.id);
  },
};

export function selectedModel(): CatalogModel | undefined {
  return configuration.index.get()?.vendors.flatMap(vendor => vendor.models).find(model => model.id === configuration.printerId.get());
}
export function resolvedSettings() {
  const pack = configuration.pack.get(); const process = configuration.processId.get(); const filament = configuration.filamentId.get();
  if (!pack || !process || !filament) return undefined;
  try { return mergeResolvedSettings(mergePackSelection(pack, process, filament), configuration.overrides.get()); }
  catch { return undefined; }
}
export function settingsIssues() {
  const pack = configuration.pack.get(); const settings = resolvedSettings();
  return pack && settings ? validateSettings(settings, validationContext(pack, configuration.filamentId.get())) : [];
}

export function resetConfiguration(): void {
  ++requestGeneration;
  configuration.mode.set('simple'); configuration.index.set(undefined); configuration.pack.set(undefined);
  configuration.printerId.set(undefined); configuration.filamentId.set(undefined); configuration.processId.set(undefined);
  configuration.overrides.set({}); configuration.loading.set(false); configuration.error.set(undefined); configuration.errorKind.set(undefined);
  configuration.notice.set(undefined); configuration.customName.set(undefined); configuration.customFilaments.set([]);
}
