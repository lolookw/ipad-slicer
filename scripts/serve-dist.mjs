// Static server for dist/ that applies the production isolation headers from public/_headers.
// Playwright's route interception does NOT grant cross-origin isolation, and `vite preview`
// hangs on some machines, so end-to-end tests run against this server.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not URL.pathname: the repository path can contain spaces, which a URL encodes as %20.
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const PORT = Number(process.env.PORT ?? process.argv[2] ?? 4174);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
};

const ISOLATION = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  const relative = normalize(pathname === '/' ? '/index.html' : pathname).replace(/^([/\\])+/, '');
  try {
    const body = await readFile(join(DIST, relative));
    response.writeHead(200, {
      'Content-Type': TYPES[extname(relative)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
      ...ISOLATION,
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain', ...ISOLATION });
    response.end('not found');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`serving dist on http://127.0.0.1:${PORT}/`));
