const rows = [];
const report = (status, check, details) => rows.push({ status, check, details });
const check = (ok, name, details) => report(ok ? 'PASS' : 'FAIL', name, details);
const record = value => typeof value === 'object' && value !== null && !Array.isArray(value);

function validate(value) {
  if (!record(value) || typeof value.release !== 'string' || !record(value.variants)
    || Object.keys(value.variants).some(key => key !== 'st' && key !== 'mt')) throw Error('Invalid manifest root');
  for (const name of ['st', 'mt']) {
    const entry = value.variants[name];
    if (!record(entry) || typeof entry.js !== 'string' || !['gzip', 'identity'].includes(entry.encoding)
      || !Array.isArray(entry.parts) || !entry.parts.length || entry.parts.some(p => typeof p !== 'string')
      || !Number.isSafeInteger(entry.wasmBytes) || entry.wasmBytes <= 0) throw Error(`Invalid manifest variant ${name}`);
  }
  return value;
}

async function get(path, base) {
  const url = new URL(path, base);
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (response.redirected || response.url !== url.href) report('WARN', 'URL changed', `${url.href} -> ${response.url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  check(response.status === 200, path, `HTTP ${response.status}; ${bytes.length} bytes; Content-Type: ${response.headers.get('content-type') ?? '(missing)'}`);
  return { response, bytes };
}

function isolation(response, label, page = false) {
  const h = response.headers;
  if (page) check(h.get('cross-origin-opener-policy') === 'same-origin', `${label} COOP`, h.get('cross-origin-opener-policy'));
  const coep = h.get('cross-origin-embedder-policy'), corp = h.get('cross-origin-resource-policy');
  check(page ? coep === 'require-corp' : Boolean(coep), `${label} COEP`, coep);
  check(Boolean(corp), `${label} CORP`, corp);
}

try {
  if (process.argv.length !== 3) throw Error('Usage: npm run check-deploy -- https://example.workers.dev');
  const base = new URL(process.argv[2]);
  if (!['http:', 'https:'].includes(base.protocol)) throw Error('Expected an HTTP(S) URL');
  report('WARN', 'Browser scope', 'Node cannot observe Service Workers or window.crossOriginIsolated; verify in Safari. Fetch bytes are HTTP-decoded, not wire bytes.');
  const page = await get('/', base);
  isolation(page.response, '/', true);
  const manifestResponse = await get('/engine-manifest.json', base);
  const manifest = validate(JSON.parse(new TextDecoder().decode(manifestResponse.bytes)));
  report('PASS', 'Manifest shape', manifest.release);
  for (const [name, variant] of Object.entries(manifest.variants)) {
    try {
      const { response } = await get(variant.js, base);
      check(/^(text|application)\/(javascript|ecmascript)(?:\s*;|$)/i.test(response.headers.get('content-type') ?? ''), `${name} JavaScript MIME`, response.headers.get('content-type'));
      isolation(response, name);
    } catch (error) { report('FAIL', `${name} JavaScript`, error.message); }
    for (const [index, part] of variant.parts.entries()) {
      try {
        const { response, bytes } = await get(part, base);
        const h = response.headers;
        const gzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
        const wasm = bytes[0] === 0 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d;
        report('PASS', `${name} part ${index} metadata`, `Content-Encoding: ${h.get('content-encoding') ?? '(none)'}; Content-Type: ${h.get('content-type') ?? '(missing)'}; Cache-Control: ${h.get('cache-control') ?? '(missing)'}; gzip=${gzip}; wasm=${wasm}`);
        // Later chunks continue one compressed stream and need not carry a magic header.
        if (index === 0) check(gzip || wasm, `${name} stream magic`, gzip ? '1f8b' : wasm ? '00 61 73 6d' : 'unrecognized');
        else report('PASS', `${name} continuation`, 'Magic not required for subsequent parts');
        report(/\bimmutable\b/i.test(h.get('cache-control') ?? '') ? 'PASS' : 'WARN', `${name} cache`, 'Expected immutable');
      } catch (error) { report('FAIL', `${name} part ${index}`, error.message); }
    }
  }
} catch (error) { report('FAIL', 'Deployment check', error.message); }

console.log('STATUS | CHECK | DETAILS');
console.log('-------|-------|--------');
for (const row of rows) console.log(`${row.status} | ${row.check} | ${String(row.details ?? '(missing)').replace(/[\r\n]/g, ' ')}`);
process.exitCode = rows.some(row => row.status === 'FAIL') ? 1 : 0;
