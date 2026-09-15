import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const lock = JSON.parse(await readFile('engine.lock.json', 'utf8'));
const maxPart = 20 * 1024 * 1024;
const outputs = [];
const manifest = { release: lock.release, variants: {} };

async function artifact(tag, entry) {
  const directory = `.engine-cache/${tag}`;
  const path = `${directory}/${entry.name}`;
  let bytes;
  let downloaded = false;
  try {
    bytes = await readFile(path);
    console.log(`Cache hit: ${path}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (process.env.ENGINE_CACHE_ONLY === '1') throw new Error(`Cache miss: ${path}; downloads disabled`);
    const response = await fetch(entry.url);
    if (!response.ok) throw new Error(`Download failed: ${entry.url} (${response.status})`);
    bytes = Buffer.from(await response.arrayBuffer());
    downloaded = true;
  }
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (bytes.length !== entry.bytes || hash !== entry.sha256) {
    throw new Error(`Integrity mismatch: ${path}; bytes=${bytes.length}, SHA-256=${hash}`);
  }
  if (downloaded) {
    await mkdir(directory, { recursive: true });
    await writeFile(path, bytes);
  }
  return bytes;
}

// Validate every input and prepare every part before writing public outputs.
for (const [variant, entry] of Object.entries(lock.variants)) {
  const js = await artifact(entry.tag, entry.js);
  const wasm = await artifact(entry.tag, entry.wasm);
  const base = `/engine/${lock.release}/${variant}`;
  const compressed = gzipSync(wasm, { level: 9 });
  const parts = [];
  outputs.push([`${base}/${entry.js.name}`, js]);
  for (let offset = 0; offset < compressed.length; offset += maxPart) {
    const part = compressed.subarray(offset, offset + maxPart);
    if (part.length > maxPart) throw new Error(`Part exceeds 20 MiB: ${variant}`);
    const path = `${base}/${entry.wasm.name}.gz.part${parts.length}`;
    parts.push(path);
    outputs.push([path, part]);
  }
  manifest.variants[variant] = { js: `${base}/${entry.js.name}`, encoding: 'gzip', parts, wasmBytes: wasm.length };
  console.log(`${variant}: ${compressed.length} gzip bytes, ${parts.length} part(s)`);
}
for (const [path, bytes] of outputs) {
  await mkdir(`public${path.slice(0, path.lastIndexOf('/'))}`, { recursive: true });
  await writeFile(`public${path}`, bytes);
}
await writeFile('public/engine-manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
