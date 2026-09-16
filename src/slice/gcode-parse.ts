export interface ParsedGcode {
  timeSeconds?: number;
  filamentGrams?: number;
  layerCount: number;
  effective: Record<string, string>;
}

function duration(value: string): number | undefined {
  let seconds = 0;
  for (const match of value.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*([dhms])/gi)) {
    seconds += Number(match[1]) * ({ d: 86400, h: 3600, m: 60, s: 1 }[match[2]!.toLowerCase()] ?? 0);
  }
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

export function parseGcode(gcode: ArrayBuffer | string): ParsedGcode {
  const text = typeof gcode === 'string' ? gcode : new TextDecoder().decode(gcode);
  const time = text.match(/^;\s*estimated printing time \(normal mode\)\s*=\s*(.+)$/mi);
  const mass = Number(text.match(/^;\s*filament used \[g\]\s*=\s*([^\s]+)/mi)?.[1]);
  const effective: Record<string, string> = {};
  for (const match of text.matchAll(/^;\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/gm)) effective[match[1]!] = match[2]!;
  return {
    timeSeconds: time ? duration(time[1]!) : undefined,
    filamentGrams: Number.isFinite(mass) && mass >= 0 ? mass : undefined,
    layerCount: (text.match(/^;LAYER_CHANGE\b/gm) ?? []).length,
    effective,
  };
}
