export type Variant = 'st' | 'mt';
export type EngineManifest = {
  release: string;
  variants: Record<Variant, { js: string; encoding: 'gzip' | 'identity'; parts: string[]; wasmBytes: number }>;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseEngineManifest(value: unknown): EngineManifest {
  const invalid = (field: string): never => { throw new Error(`Invalid engine manifest: ${field}`); };
  if (!record(value)) return invalid('expected an object');
  if (typeof value.release !== 'string') return invalid('release must be a string');
  const variants = value.variants;
  if (!record(variants) || Object.keys(variants).some(key => key !== 'st' && key !== 'mt')) {
    return invalid('variants must contain only st and mt');
  }
  for (const name of ['st', 'mt']) {
    const entry = variants[name];
    if (!record(entry)) return invalid(`variants.${name} is required`);
    if (typeof entry.js !== 'string') return invalid(`${name}.js must be a string`);
    if (entry.encoding !== 'gzip' && entry.encoding !== 'identity') return invalid(`${name}.encoding`);
    if (!Array.isArray(entry.parts) || !entry.parts.length || entry.parts.some(part => typeof part !== 'string')) {
      return invalid(`${name}.parts must be a non-empty string array`);
    }
    if (typeof entry.wasmBytes !== 'number' || !Number.isSafeInteger(entry.wasmBytes) || entry.wasmBytes <= 0) {
      return invalid(`${name}.wasmBytes must be a positive safe integer`);
    }
  }
  return value as EngineManifest;
}

export async function fetchEngineManifest(url = '/engine-manifest.json', fetchImpl = fetch): Promise<EngineManifest> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Engine manifest request failed: ${url} (${response.status})`);
  return parseEngineManifest(await response.json());
}
