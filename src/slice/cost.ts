export interface FilamentCost { amount: number; currency: string }

export function calculateFilamentCost(filamentGrams: number | undefined, pricePerKg: number | undefined,
  currency: string): FilamentCost | undefined {
  if (filamentGrams === undefined || pricePerKg === undefined || !Number.isFinite(filamentGrams) || filamentGrams < 0 ||
    !Number.isFinite(pricePerKg) || pricePerKg < 0 || !currency) return undefined;
  return { amount: filamentGrams / 1000 * pricePerKg, currency };
}
