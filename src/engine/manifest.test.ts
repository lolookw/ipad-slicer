import { expect, it } from 'vitest';
import { fetchEngineManifest, parseEngineManifest } from './manifest';

const entry = { js: '/engine/slicer.js', encoding: 'gzip', parts: ['/engine/part0'], wasmBytes: 8 };
const manifest = { release: 'test', variants: { st: entry, mt: { ...entry, encoding: 'identity' } } };

it('parses both variants and fetches the default mutable manifest path', async () => {
  expect(parseEngineManifest(manifest)).toEqual(manifest);
  const fetchImpl: typeof fetch = async url => {
    expect(url).toBe('/engine-manifest.json');
    return Response.json(manifest);
  };
  expect(await fetchEngineManifest(undefined, fetchImpl)).toEqual(manifest);
});

it.each([null, [], {}, { ...manifest, release: 2 }, { ...manifest, variants: {} },
  { ...manifest, variants: { ...manifest.variants, other: entry } },
  ...[{ js: 4 }, { encoding: 'br' }, { parts: [] }, { parts: [1] },
    { wasmBytes: 0 }, { wasmBytes: -1 }, { wasmBytes: 1.5 }, { wasmBytes: Infinity },
    { wasmBytes: '8' }].map(patch => ({ ...manifest, variants: { ...manifest.variants, st: { ...entry, ...patch } } })),
])('rejects invalid manifest %#', value => {
  expect(() => parseEngineManifest(value)).toThrow('Invalid engine manifest:');
});

it('rejects a failed manifest response', async () => {
  await expect(fetchEngineManifest('/missing', async () => new Response(null, { status: 404 }))).rejects.toThrow('404');
});
