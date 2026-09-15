import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLog } from './log';
import type { StorageLike } from './log';

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const key = 'ipad-slicer:spike-log';
afterEach(() => vi.unstubAllGlobals());

describe('createLog', () => {
  it('appends timestamped entries in order and persists every append', () => {
    const storage = new MemoryStorage();
    const write = vi.spyOn(storage, 'setItem');
    let time = 10;
    const log = createLog({ storage, now: () => time++ });
    log.append('ready');
    expect(JSON.parse(storage.getItem(key)!)).toEqual([{ ts: 10, type: 'ready' }]);
    log.append('progress', { pct: 50 });
    expect(log.entries()).toEqual([
      { ts: 10, type: 'ready' },
      { ts: 11, type: 'progress', data: { pct: 50 } },
    ]);
    expect(write).toHaveBeenCalledTimes(2);
    expect(JSON.parse(storage.getItem(key)!)).toEqual(log.entries());
  });

  it('drops oldest entries on overflow, including the persisted copy', () => {
    const storage = new MemoryStorage();
    const log = createLog({ storage, capacity: 2 });
    for (const type of ['a', 'b', 'c']) log.append(type);
    expect(log.entries().map((entry) => entry.type)).toEqual(['b', 'c']);
    expect(JSON.parse(storage.getItem(key)!)).toEqual(log.entries());
  });

  it('defaults to a capacity of 500', () => {
    const log = createLog({ storage: new MemoryStorage() });
    for (let i = 0; i < 501; i++) log.append(String(i));
    expect(log.entries()).toHaveLength(500);
    expect(log.entries()[0]?.type).toBe('1');
  });

  it('restores across instances using the same custom key and trims to capacity', () => {
    const storage = new MemoryStorage();
    const log = createLog({ storage, key: 'custom', now: () => 42 });
    log.append('ready');
    log.append('done', { sliceMs: 100 });
    expect(createLog({ storage, key: 'custom' }).entries()).toEqual(log.entries());
    expect(createLog({ storage, key: 'custom', capacity: 1 }).entries())
      .toEqual([{ ts: 42, type: 'done', data: { sliceMs: 100 } }]);
    expect(createLog({ storage }).entries()).toEqual([]);
  });

  it.each(['broken{', '{}', 'null', '42', '[null]', '[{"ts":"bad","type":"x"}]'])
    ('starts empty for corrupted storage: %s', (saved) => {
      const storage = new MemoryStorage();
      storage.setItem(key, saved);
      const log = createLog({ storage });
      expect(log.entries()).toEqual([]);
      expect(() => log.append('recovered')).not.toThrow();
    });

  it('keeps entries and exports available when setItem throws', () => {
    const storage = new MemoryStorage();
    vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded'); });
    const log = createLog({ storage, now: () => 1 });
    expect(() => log.append('error', 'context')).not.toThrow();
    expect(log.entries()).toEqual([{ ts: 1, type: 'error', data: 'context' }]);
    expect(JSON.parse(log.exportJson())).toEqual(log.entries());
  });

  it('clears memory and storage without affecting other keys', () => {
    const storage = new MemoryStorage();
    storage.setItem('unrelated', 'keep');
    const log = createLog({ storage });
    log.append('ready');
    log.clear();
    expect(log.entries()).toEqual([]);
    expect(storage.getItem(key)).toBeNull();
    expect(storage.getItem('unrelated')).toBe('keep');
    expect(createLog({ storage }).entries()).toEqual([]);
    log.append('again');
    expect(createLog({ storage }).entries()).toEqual(log.entries());
  });

  it('exports pretty-printed JSON', () => {
    const log = createLog({ storage: new MemoryStorage(), now: () => 7 });
    expect(log.exportJson()).toBe('[]');
    log.append('ready');
    expect(log.exportJson()).toBe('[\n  {\n    "ts": 7,\n    "type": "ready"\n  }\n]');
  });

  it('uses global localStorage and Date.now by default', () => {
    const storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
    const before = Date.now();
    createLog().append('ready');
    const entry = createLog().entries()[0];
    expect(entry?.type).toBe('ready');
    expect(entry?.ts).toBeGreaterThanOrEqual(before);
    expect(entry?.ts).toBeLessThanOrEqual(Date.now());
  });

  it('works without browser storage', () => {
    vi.stubGlobal('localStorage', undefined);
    const log = createLog();
    log.append('ready');
    expect(log.entries()).toHaveLength(1);
  });

  it('tolerates storage read and removal failures', () => {
    const storage = new MemoryStorage();
    vi.spyOn(storage, 'getItem').mockImplementation(() => { throw new Error('Denied'); });
    vi.spyOn(storage, 'removeItem').mockImplementation(() => { throw new Error('Denied'); });
    const log = createLog({ storage });
    log.append('ready');
    expect(() => log.clear()).not.toThrow();
    expect(log.entries()).toEqual([]);
  });

  it.each([0, -1, 1.5, Infinity, NaN])('rejects invalid capacity %s', (capacity) => {
    expect(() => createLog({ storage: new MemoryStorage(), capacity })).toThrow(RangeError);
  });
});
