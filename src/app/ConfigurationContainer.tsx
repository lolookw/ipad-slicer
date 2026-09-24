import { createResource, Show } from 'solid-js';
import { CatalogPickers } from '../catalog/components/CatalogPickers';
import { CustomPrinterForm, type CustomPrinterValues } from '../catalog/components/CustomPrinterForm';
import { CustomFilamentForm } from '../catalog/components/CustomFilamentForm';
import type { NativeSettings, PrinterPack } from '../catalog/types';
import { mergePackSelection } from '../catalog/merge';
import {
  activeBedTemperatureKey, buildCustomFilament, customFilamentBaseOptions, validateCustomFilamentValues,
  type CustomFilamentBase, type CustomFilamentValues,
} from '../catalog/custom-filament';
import { SettingsPanels } from '../settings/components/SettingsPanels';
import { PresetTransfer } from '../settings/components/PresetTransfer';
import { decodeNative, encodeNative } from '../settings/codec';
import { mergeResolvedSettings } from '../settings/merge';
import { SETTINGS, GCODE_FLAVORS, type SettingKey } from '../settings/schema';
import { optionLabel } from '../settings/optionLabels';
import { hasBlockingIssues, validateSettings } from '../settings/validate';
import { exportPresetBundle, importPresetBundle } from '../storage/import-export';
import { PresetRepository } from '../storage/presets-repo';
import type { StoredPreset } from '../storage/db';
import { saveFile } from '../export/save-gcode';
import { configuration, resolvedSettings, settingsIssues, validationContext } from './stores';
import { useApp } from './AppProvider';
import type { TranslationKey } from '../i18n';
import { prepareCurrentPlate } from '../viewer/gizmo';
import { EngineClientError } from '../engine/client';
import { DiagnosticsSheet } from '../diagnostics/DiagnosticsSheet';

function requireNumber(value: number, min: number, max: number, label: string): void {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be between ${min} and ${max}.`);
}
function customSettings(values: CustomPrinterValues): NativeSettings {
  requireNumber(values.width, 1, 2000, 'Width'); requireNumber(values.depth, 1, 2000, 'Depth');
  requireNumber(values.height, 1, 2000, 'Height'); requireNumber(values.nozzle, 0.1, 2, 'Nozzle');
  if (!values.name.trim() || !GCODE_FLAVORS.includes(values.flavor) || values.startGcode.length > 65_536 || values.endGcode.length > 65_536)
    throw new Error('Custom printer fields are invalid.');
  const settings: NativeSettings = {
    printable_area: ['0x0', `${values.width}x0`, `${values.width}x${values.depth}`, `0x${values.depth}`], printable_height: String(values.height),
    nozzle_diameter: [String(values.nozzle)], gcode_flavor: values.flavor, machine_start_gcode: values.startGcode, machine_end_gcode: values.endGcode,
  };
  if (!values.heatedBed) for (const key of ['cool_plate_temp', 'eng_plate_temp', 'hot_plate_temp', 'textured_plate_temp', 'textured_cool_plate_temp', 'supertack_plate_temp']) {
    settings[key] = ['0']; settings[`${key}_initial_layer`] = ['0'];
  }
  return settings;
}
function nativeOverrides(): NativeSettings {
  const result: NativeSettings = {};
  for (const [key, value] of Object.entries(configuration.overrides.get())) if (value !== undefined)
    result[key] = encodeNative(SETTINGS[key as SettingKey], value);
  return result;
}
function activePreset(): StoredPreset | undefined {
  const printerId = configuration.printerId.get(); const processId = configuration.processId.get(); const filamentId = configuration.filamentId.get();
  if (!printerId || !processId || !filamentId) return undefined;
  return { id: crypto.randomUUID(), name: 'iPad Slicer preset', kind: configuration.customName.get() ? 'custom' : 'catalog', printerId,
    baseId: configuration.customName.get() ? 'custom' : printerId, processId, filamentId, overrides: nativeOverrides(), schemaVersion: 1, updatedAt: Date.now() };
}

export function ConfigurationContainer() {
  const app = useApp(); const t = app.t;
  const labels = () => ({
    search: t('configuration.search'), printer: t('configuration.printer'), filament: t('configuration.filament'), quality: t('configuration.quality'),
    loading: t('configuration.loading'), unavailable: t('configuration.notSmokeTested'), recommended: t('configuration.recommended'), verified: t('configuration.verifiedToSlice'), noResults: t('configuration.noPrinters'), draft: t('configuration.draft'), standard: t('configuration.standard'), fine: t('configuration.fine'),
  });
  const settingsLabels = () => ({ mode: t('configuration.settingsMode'), modeSimple: t('configuration.simple'), modeAdvanced: t('configuration.advanced'), infill: t('settings.infillDensity.label'), supports: t('settings.supports.label'),
    supportType: t('settings.supportType.label'), brimType: t('settings.brimType.label'), brimWidth: t('settings.brimWidth.label'), arrange: t('configuration.arrange'),
    estimates: t('configuration.estimates'), unavailable: t('configuration.unavailable'), reset: t('configuration.reset'), plateWide: t('configuration.plateWide'),
    categories: { quality: t('configuration.categories.quality'), strength: t('configuration.categories.strength'), speed: t('configuration.categories.speed'), support: t('configuration.categories.support'), others: t('configuration.categories.others') },
    setting: (key: SettingKey) => t(SETTINGS[key].labelKey as TranslationKey),
    optionLabel: (key: SettingKey, value: string) => optionLabel(t, key, value),
  });
  const makeCustom = async (values: CustomPrinterValues) => {
    try {
      const response = await fetch('/catalog/custom-base.json'); if (!response.ok) throw new Error('Custom printer base is unavailable.');
      const base = await response.json() as PrinterPack; if (base.schema !== 1 || base.id !== 'custom') throw new Error('Custom printer base is invalid.');
      const settings = customSettings(values); const pack = { ...base, id: `custom-${crypto.randomUUID()}`, model: values.name, nozzle: values.nozzle, machine: { ...base.machine, ...settings } };
      const [process, filament] = pack.combos[0] ?? []; if (!process || !filament) throw new Error('Custom printer base has no tested generic combination.');
      // Validate against THIS draft's own filament, not whatever the live UI happens to have selected.
      const issues = validateSettings(mergeResolvedSettings(mergePackSelection(pack, process, filament)), { ...validationContext(base, filament), nozzleDiameter: values.nozzle });
      if (hasBlockingIssues(issues)) throw new Error(issues.map(issue => issue.message).join(' '));
      const repository = await PresetRepository.open();
      try { await repository.saveCustomPrinter({ id: pack.id, name: values.name, baseId: 'custom', settings, updatedAt: Date.now() }); }
      finally { repository.close(); }
      configuration.useCustomPrinter(pack.id, values.name, pack); configuration.notice.set(t('configuration.customSaved'));
    } catch (error) { configuration.error.set(error instanceof Error ? error.message : String(error)); configuration.errorKind.set('invalidCustom'); }
  };
  // Same generic template a custom PRINTER clones from, kept only as the base-type fallback for the
  // custom FILAMENT form when no printer is selected yet (or its pack has no PLA/PETG/ABS-family entry).
  const [customBase] = createResource(async () => {
    try { const response = await fetch('/catalog/custom-base.json'); return response.ok ? await response.json() as PrinterPack : undefined; }
    catch { return undefined; }
  });
  const customFilamentBases = (): CustomFilamentBase[] => {
    const pack = configuration.pack.get();
    const bedKey = pack ? activeBedTemperatureKey(pack.machine) : 'hot_plate_temp';
    const fromPack = customFilamentBaseOptions(pack?.filaments ?? [], bedKey);
    return fromPack.length ? fromPack : customFilamentBaseOptions(customBase()?.filaments ?? [], bedKey);
  };
  const makeCustomFilament = async (values: CustomFilamentValues) => {
    try {
      const pack = configuration.pack.get(); if (!pack) throw new Error('Select a printer before creating a custom filament.');
      const bedKey = activeBedTemperatureKey(pack.machine);
      const base = customFilamentBases().find(candidate => candidate.id === values.baseId); if (!base) throw new Error('Choose a base filament type.');
      validateCustomFilamentValues(values, bedKey);
      const filament = buildCustomFilament(`custom-filament-${crypto.randomUUID()}`, base.type, base.settings, bedKey, values);
      const processId = pack.processes[0]?.id; if (!processId) throw new Error('The selected printer has no compatible process to validate against.');
      // Validate against a DRAFT pack carrying just this filament, not whatever the live UI has selected.
      const draftPack: PrinterPack = { ...pack, filaments: [...pack.filaments, filament], combos: [...pack.combos, [processId, filament.id]] };
      const issues = validateSettings(mergeResolvedSettings(mergePackSelection(draftPack, processId, filament.id)), validationContext(draftPack, filament.id));
      if (hasBlockingIssues(issues)) throw new Error(issues.map(issue => issue.message).join(' '));
      const repository = await PresetRepository.open();
      try { await repository.saveCustomFilament({ id: filament.id, name: filament.name, type: filament.type, settings: filament.settings, updatedAt: Date.now() }); }
      finally { repository.close(); }
      configuration.useCustomFilament(filament); configuration.notice.set(t('configuration.customFilamentSaved'));
    } catch (error) { configuration.error.set(error instanceof Error ? error.message : String(error)); configuration.errorKind.set('invalidCustomFilament'); }
  };
  const importPresets = async (json: string) => {
    try {
      const pack = configuration.pack.get(); if (!pack) throw new Error(t('configuration.selectPrinterFirst'));
      const repository = await PresetRepository.open();
      let result: Awaited<ReturnType<typeof importPresetBundle>>;
      try {
        result = await importPresetBundle(json, repository, {
          isCompatible: preset => preset.printerId === configuration.printerId.get() && pack.combos.some(([process, filament]) => process === preset.processId && filament === preset.filamentId),
          // isCompatible already confirmed preset.filamentId is one of this pack's real, catalog-verified
          // filaments, so validating against that exact filament (not the live selection) is always safe here.
          validate: preset => validateSettings({ ...mergeResolvedSettings(mergePackSelection(pack, preset.processId, preset.filamentId)), ...preset.overrides }, validationContext(pack, preset.filamentId)),
        });
      } finally { repository.close(); }
      const preset = result.presets[0]!; configuration.filamentId.set(preset.filamentId); configuration.processId.set(preset.processId);
      configuration.overrides.set(Object.fromEntries(Object.entries(preset.overrides).filter(([key]) => key in SETTINGS).map(([key, value]) => [key, decodeNative(SETTINGS[key as SettingKey], value)])));
      configuration.notice.set(result.notices.length ? t('configuration.importedWithNotices') : t('configuration.imported')); configuration.error.set(undefined); configuration.errorKind.set(undefined);
    } catch (error) { configuration.error.set(error instanceof Error ? error.message : String(error)); configuration.errorKind.set('invalidImport'); }
  };
  const exportPreset = async () => {
    const preset = activePreset(); if (!preset) { configuration.error.set(t('configuration.incomplete')); return; }
    await saveFile(exportPresetBundle([preset]), 'ipad-slicer-presets.json', ['application/json']);
  };
  return <div class="configuration-ui">
    <div class="simple-controls"><CatalogPickers index={configuration.index.get()} pack={configuration.pack.get()} printerId={configuration.printerId.get()}
      customName={configuration.customName.get()} filamentId={configuration.filamentId.get()} processId={configuration.processId.get()} loading={configuration.loading.get()}
      error={configuration.errorKind.get() ? t(`configuration.${configuration.errorKind.get()}` as TranslationKey) : undefined} labels={labels()} onPrinter={id => void configuration.selectPrinter(id)} onFilament={id => configuration.selectFilament(id)} onQuality={quality => configuration.selectQuality(quality)} />
      <SettingsPanels mode={configuration.mode.get()} values={resolvedSettings()} overrides={configuration.overrides.get()} labels={settingsLabels()}
        onMode={configuration.mode.set} onChange={(key, value) => configuration.setOverride(key, value)} onReset={key => configuration.resetOverride(key)}
        onArrange={() => void prepareCurrentPlate(2).then(() => configuration.notice.set(t('configuration.arrangeComplete')),
          error => configuration.notice.set(app.translateError(error instanceof EngineClientError ? { code: error.code, values: error.values }
            : error instanceof Error ? error.message : String(error))))} />
    </div>
    <Show when={settingsIssues().length}><ul class="validation-errors" role="alert">{settingsIssues().map(issue => <li>{t('configuration.invalidSetting')}: <code>{issue.key}</code></li>)}</ul></Show>
    <button class="ui-target slice-action" type="button" disabled={app.engine.state.get() !== 'slicing' && (!app.flow.hasModel.get() || !resolvedSettings() || hasBlockingIssues(settingsIssues()))}
      onClick={() => app.engine.state.get() === 'slicing' ? app.cancelSlice() : void app.startSlice()}>
      {t(app.engine.state.get() === 'slicing' ? 'configuration.cancel' : 'configuration.slice')}
    </button>
    <Show when={app.result.state.finishingPreviousSlice}><p role="status">{t('configuration.finishing')}</p></Show>
    <Show when={configuration.notice.get()}>{notice => <p role="status">{app.translateError(notice())}</p>}</Show>
    <details><summary>{t('configuration.custom.heading')}</summary><CustomPrinterForm labels={{ heading: t('configuration.custom.heading'), name: t('configuration.custom.name'), width: t('configuration.custom.width'), depth: t('configuration.custom.depth'), height: t('configuration.custom.height'), nozzle: t('configuration.custom.nozzle'), flavor: t('configuration.custom.flavor'), start: t('configuration.custom.start'), end: t('configuration.custom.end'), heated: t('configuration.custom.heated'), save: t('configuration.custom.save'), disclaimer: t('configuration.notSmokeTested') }} onSubmit={makeCustom} /></details>
    <details><summary>{t('configuration.custom.filament.heading')}</summary><CustomFilamentForm bases={customFilamentBases()} labels={{
      heading: t('configuration.custom.filament.heading'), name: t('configuration.custom.filament.name'), base: t('configuration.custom.filament.base'),
      nozzle: t('settings.nozzleTemperature.label'), nozzleInitial: t('settings.initialNozzleTemperature.label'),
      bed: t('settings.bedTemperature.label'), bedInitial: t('settings.initialBedTemperature.label'),
      cost: t('settings.filamentCost.label'), density: t('settings.filamentDensity.label'),
      save: t('configuration.custom.filament.save'), disclaimer: t('configuration.custom.filament.disclaimer'),
    }} onSubmit={makeCustomFilament} /></details>
    <details><summary>{t('configuration.presets.heading')}</summary><PresetTransfer labels={{ heading: t('configuration.presets.heading'), json: t('configuration.presets.json'), import: t('configuration.presets.import'), export: t('configuration.presets.export') }} onImport={importPresets} onExport={exportPreset} /></details>
    <Show when={configuration.mode.get() === 'advanced'}><details class="diagnostics"><summary>{t('diagnostics.heading')}</summary><DiagnosticsSheet labels={{
      heading: t('diagnostics.heading'), isolation: t('diagnostics.isolation'), variant: t('diagnostics.variant'), auto: t('preferences.auto'), st: t('diagnostics.st'), mt: t('diagnostics.mt'),
      unavailableMt: t('diagnostics.unavailableMt'), retryMt: t('diagnostics.retryMt'), retryMtSuccess: t('diagnostics.retryMtSuccess'), export: t('diagnostics.export'), recent: t('diagnostics.recent'), load: t('diagnostics.load'), slice: t('diagnostics.slice'), heap: t('diagnostics.heap'),
    }} retryMultithread={app.retryMultithread} /></details></Show>
  </div>;
}
