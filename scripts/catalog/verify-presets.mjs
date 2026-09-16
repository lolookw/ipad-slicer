import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const configBytes = await readFile('catalog.config.json');
const config = JSON.parse(configBytes);
const lock = JSON.parse(await readFile('catalog.presets.lock.json'));
if (lock.repository !== config.source.repository || lock.tag !== config.source.tag || lock.commit !== config.source.commit ||
    lock.configSha256 !== createHash('sha256').update(configBytes).digest('hex'))
  throw new Error('Preset lock provenance does not match catalog.config.json');
const cache = '.engine-cache/orca-profiles-v2.4.2';
for (const entry of lock.files) {
  const file = entry.path.startsWith('generated:index-') ? entry.path.slice('generated:'.length)
    : entry.path.endsWith('.json') && !entry.path.includes('/') ? `index-${entry.path}`
      : `${entry.path.split('/')[0]}__${entry.path.split('/').slice(1).join('__')}`;
  const bytes = await readFile(join(cache, basename(file)));
  if (bytes.byteLength !== entry.bytes || createHash('sha256').update(bytes).digest('hex') !== entry.sha256)
    throw new Error(`Preset cache mismatch: ${entry.path}`);
}
console.log(`Verified ${lock.files.length} preset acquisition records at ${lock.tag} (${lock.commit.slice(0, 12)})`);
