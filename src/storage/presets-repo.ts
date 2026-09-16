import { openSettingsDatabase, requestResult, transactionDone, type StoredCustomPrinter, type StoredPreset } from './db';

export function assertCustomPrinterBase(printer: StoredCustomPrinter): void {
  if (printer.baseId !== 'custom') throw new Error('Custom printers must retain the smoke-tested custom base identity');
}

export class PresetRepository {
  private constructor(private readonly db: IDBDatabase) {}
  static async open(factory?: IDBFactory): Promise<PresetRepository> { return new PresetRepository(await openSettingsDatabase(factory)); }
  close(): void { this.db.close(); }

  async get(id: string): Promise<StoredPreset | undefined> {
    const transaction = this.db.transaction('presets', 'readonly');
    return requestResult(transaction.objectStore('presets').get(id)) as Promise<StoredPreset | undefined>;
  }
  async list(): Promise<StoredPreset[]> {
    const transaction = this.db.transaction('presets', 'readonly');
    return requestResult(transaction.objectStore('presets').getAll()) as Promise<StoredPreset[]>;
  }
  async save(preset: StoredPreset): Promise<void> {
    const transaction = this.db.transaction('presets', 'readwrite');
    transaction.objectStore('presets').put(preset);
    await transactionDone(transaction);
  }
  async saveCustomPrinter(printer: StoredCustomPrinter): Promise<void> {
    assertCustomPrinterBase(printer);
    const transaction = this.db.transaction('printers', 'readwrite');
    transaction.objectStore('printers').put(printer);
    await transactionDone(transaction);
  }
  async importAtomic(presets: readonly StoredPreset[], activePresetId: string): Promise<void> {
    const transaction = this.db.transaction(['presets', 'ui'], 'readwrite');
    const store = transaction.objectStore('presets');
    for (const preset of presets) store.put(preset);
    transaction.objectStore('ui').put({ key: 'activePresetId', value: activePresetId });
    await transactionDone(transaction);
  }
  async getActivePresetId(): Promise<string | undefined> {
    const transaction = this.db.transaction('ui', 'readonly');
    const record = await requestResult(transaction.objectStore('ui').get('activePresetId')) as { value?: unknown } | undefined;
    return typeof record?.value === 'string' ? record.value : undefined;
  }
}
