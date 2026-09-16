import type { NativeSettings, NativeValue } from '../catalog/types';
import { calculateFilamentCost, type FilamentCost } from './cost';
import { parseGcode } from './gcode-parse';

export interface ConfigDifference { key: string; requested: NativeValue; effective: string }
export interface SliceSummary {
  timeSeconds?: number;
  filamentGrams?: number;
  layerCount: number;
  requested: NativeSettings;
  effective: Record<string, string>;
  differences: ConfigDifference[];
  cost?: FilamentCost;
  engineTotalCost?: number;
}

function statistics(value: unknown): { time?: number; mass?: number; totalCost?: number } {
  if (!value || typeof value !== 'object' || (value as { schemaVersion?: unknown }).schemaVersion !== '0.2') return {};
  const stats = value as { timeSeconds?: { normal?: unknown }; filament?: { totalMassG?: unknown; totalCost?: unknown } };
  const finite = (candidate: unknown) => typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0 ? candidate : undefined;
  return { time: finite(stats.timeSeconds?.normal), mass: finite(stats.filament?.totalMassG), totalCost: finite(stats.filament?.totalCost) };
}

export function summarizeSlice(gcode: ArrayBuffer, rawStatistics: unknown, requested: NativeSettings,
  pricePerKg: number | undefined, currency: string): SliceSummary {
  const parsed = parseGcode(gcode); const stats = statistics(rawStatistics);
  const filamentGrams = stats.mass ?? parsed.filamentGrams;
  const differences = Object.entries(parsed.effective).flatMap(([key, effective]) => {
    const requestedValue = requested[key];
    return requestedValue !== undefined && (Array.isArray(requestedValue) ? requestedValue.join(',') : requestedValue) !== effective
      ? [{ key, requested: requestedValue, effective }] : [];
  });
  return { timeSeconds: stats.time ?? parsed.timeSeconds, filamentGrams, layerCount: parsed.layerCount,
    requested: { ...requested }, effective: parsed.effective, differences,
    cost: calculateFilamentCost(filamentGrams, pricePerKg, currency), engineTotalCost: stats.totalCost };
}
