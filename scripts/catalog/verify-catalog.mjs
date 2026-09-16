import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export async function verifyCatalog(indexPath = 'public/catalog/index.json') {
  const index = JSON.parse(await readFile(indexPath, 'utf8'));
  if (index.schema !== 1 || !Array.isArray(index.vendors)) throw new Error('Unsupported catalog index');
  const ids = new Set();
  for (const vendor of index.vendors) for (const model of vendor.models) {
    if (ids.has(model.id)) throw new Error(`Duplicate printer id: ${model.id}`);
    ids.add(model.id);
    const bytes = await readFile(join(dirname(indexPath), model.pack));
    if (bytes.byteLength !== model.bytes) throw new Error(`Length mismatch: ${model.pack}`);
    const sha = createHash('sha256').update(bytes).digest('hex');
    if (sha !== model.sha256) throw new Error(`SHA-256 mismatch: ${model.pack}`);
    const pack = JSON.parse(bytes);
    if (pack.schema !== 1 || pack.id !== model.id) throw new Error(`Invalid pack: ${model.pack}`);
    for (const [processId, filamentId] of pack.combos) {
      if (!pack.processes.some(entry => entry.id === processId) || !pack.filaments.some(entry => entry.id === filamentId))
        throw new Error(`Broken combination reference: ${model.id}`);
    }
  }
  return { printers: ids.size };
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replaceAll('\\', '/')}`).href)
  verifyCatalog(process.argv[2]).then(result => console.log(`Verified ${result.printers} printer packs`))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
