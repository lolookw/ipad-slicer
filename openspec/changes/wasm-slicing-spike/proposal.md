# Proposal: WASM Slicing Spike on iPad Safari

## Intent

Prove the product is feasible before building UI: OrcaWasm must slice a real STL in iPad Safari and the G-code must be saved as a retrievable file. The spike measures memory, time, and load cost for single-thread vs multithread, so we can decide go/no-go.

## Scope

### In Scope
- Minimal static harness (establishes stack: Vite + vanilla TypeScript, engine in a Web Worker)
- OrcaWasm `wasm-v2.4.2-patch19` artifacts served same-origin, single-thread primary
- One flattened profile: Ender-3 V2 0.4 + 0.20mm Standard + Generic PLA (temperatures re-read from raw JSON)
- STL import via `<input type="file">`, slice with progress and cancel
- G-code save: `navigator.share({files})`, fallback `<a download>` Blob
- Shared-memory probe; fixed-memory multithread attempt, falling back to single-thread
- In-page instrumentation: peak heap, slice time, download/instantiate time, errors (persisted log)
- Cloudflare Workers (static assets) deploy via Git integration, with `_headers` COOP/COEP; minimal PWA manifest; AGPL-3.0 LICENSE and source link
- Test matrix: Safari tab and home-screen PWA, STL ladder up to 50MB

### Out of Scope
- Final/touch-first UI, multiple profiles, layer preview, native iOS app, server-side slicing

## Capabilities

### New Capabilities
- `wasm-slicing-engine`: load OrcaWasm, apply bundled profile, slice STL with progress/cancel, thread-variant selection via probe
- `gcode-export`: save G-code through Web Share with download fallback
- `spike-instrumentation`: capture and persist memory, timing, load, and error metrics on device
- `isolated-hosting`: cross-origin-isolated static deployment with same-origin WASM assets

### Modified Capabilities
None

## Approach

Worker hosts the engine to keep the page responsive. Single-thread path is built first and must meet pass/fail; multithread only with fixed memory behind `new WebAssembly.Memory({shared:true})` probe. Measurements are collected in-page because the user has no Mac.

Hosting uses Cloudflare Workers static assets instead of Cloudflare Pages: Cloudflare recommends Workers for new projects ([migration guide](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)), `_headers` is supported, static asset requests are free, and Workers Builds gives per-branch preview URLs ([GitHub integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `package.json`, `vite.config.ts`, `index.html`, `wrangler.jsonc` | New | Harness scaffold and Workers config |
| `src/engine/`, `src/worker/` | New | OrcaWasm loader, worker bridge, probe |
| `src/export/` | New | Share/download |
| `src/instrumentation/` | New | Metrics panel and log |
| `profiles/` | New | Flattened profile |
| `public/_headers`, `public/manifest.webmanifest` | New | COOP/COEP, PWA |
| `scripts/` | New | Fetch release artifacts |
| `LICENSE` | New | AGPL-3.0 |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| 38MB wasm exceeds the verified 25 MiB per-file static asset limit (Workers and Pages) | Certain | Design: gzipped static parts streamed back together; fallback Worker script + R2 |
| Web Share rejects large `.gcode` | Med | Blob fallback; test 10/50/100MB |
| Multithread crashes (iPadOS 26.2+) | High | Probe + single-thread fallback; stretch only |
| Peak memory exceeds ~1GB | Med | Record ceiling; define max model size |
| `_headers` not applied on device | Med | Assert `crossOriginIsolated` in panel |
| Flattened profile format for `onewasm_init_profile` unclear | Med | Validate early on desktop |

## Rollback Plan

Greenfield spike: delete the Cloudflare Worker and revert/drop the spike branch. No users or data affected.

## Dependencies

- Hiosdra/OrcaWasm release artifacts; Cloudflare account connected to the GitHub repo; physical iPad

## Success Criteria

- [ ] 20–50MB STL slices without crash/OOM on a mainstream iPad
- [ ] Single-thread peak memory < ~1GB
- [ ] G-code retrievable from Files after save (tab and PWA)
- [ ] Metrics recorded for both thread variants (multithread may fail)
- [ ] Delivery within 400-line PR budget (auto-chain)
