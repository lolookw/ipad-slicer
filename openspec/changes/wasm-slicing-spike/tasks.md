# Tasks: WASM Slicing Spike on iPad Safari

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1400-1800 across 5 code slices, ~250-350/slice |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR1 Scaffold -> PR2 Fetch/Loader -> PR3 Worker/Profile -> PR4 Export/Panel -> PR5 Probe/Multithread |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main (user decision 2026-09-15) |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Scaffold, `wrangler.jsonc`, `_headers`, LICENSE, log core | PR 1 | `vitest run src/instrumentation/log.test.ts` | N/A — no engine wired yet | Delete new root/config/instrumentation files, no dependents |
| 2 | Fetch script, stream loader | PR 2 | `vitest run src/engine/stream-loader.test.ts` | `node scripts/fetch-engine.mjs` against pinned release (human-authorized) | Revert `src/engine/*`, `scripts/*`, `engine.lock.json` |
| 3 | Worker bridge, profile, single-thread slice | PR 3 | `vitest run src/worker/protocol.test.ts` | Desktop Chrome on Workers branch preview URL, slice reference STL | Revert `src/worker/*`, `profiles/*`, PR3 `main.ts` wiring |
| 4 | G-code export, instrumentation panel | PR 4 | `vitest run src/export/save-gcode.test.ts` | Desktop Chrome, mock share/download | Revert `src/export/*`, panel wiring in `main.ts` |
| 5 | Probe, multithread variant | PR 5 | `vitest run src/engine/probe.test.ts` | Real iPad (see Phase 7) — N/A on desktop, shared-memory probe is device-dependent | Revert `probe.ts` and multithread branch; single-thread path unaffected |

## Phase 1: Scaffold, Headers, Log Core (PR 1)

- [x] 1.1 Scaffold `package.json` (with `wrangler` devDependency), `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore` (Claude)
- [x] 1.2 Create `wrangler.jsonc` assets-only Worker (`name`, `compatibility_date`, `assets.directory: "./dist"`) and `public/_headers` with COOP/COEP/CORP and immutable `/engine/*` caching (Claude)
- [x] 1.3 Create `public/manifest.webmanifest` (Codex)
- [x] 1.4 Create `LICENSE` (AGPL-3.0 verbatim text); commit as its own size-exception change (Claude)
- [x] 1.5 Create `src/instrumentation/log.ts` localStorage ring buffer (500 entries) with `log.test.ts` (Codex)

## Phase 2: Fetch Script and Stream Loader (PR 2)

- [x] 2.1 Authorize and download OrcaWasm `wasm-v2.4.2-patch19` release; record SHA-256 in `engine.lock.json` (Human/remote)
- [x] 2.2 Create `scripts/fetch-engine.mjs`: verify SHA-256 against `engine.lock.json`, gzip, split parts >20MiB, write `engine-manifest.json` (Codex)
- [x] 2.3 Create `src/engine/manifest.ts` typed `EngineManifest` loader (Codex)
- [x] 2.4 Create `src/engine/stream-loader.ts`: part concat, magic-byte sniff, `DecompressionStream` gunzip, `instantiateStreaming`, buffered fallback with `loadPath=buffered` log (Codex)
- [x] 2.5 Vitest tests for `stream-loader.ts` (concat, sniff, gunzip, fallback) and `manifest.ts` (Codex)

## Phase 3: Worker, Profile, Single-Thread Slice (PR 3)

- [x] 3.1 Create `scripts/resolve-profile.mjs` (merge pinned OrcaSlicer v2.4.2 preset `inherits` chains) and commit its output `profiles/ender3v2-020-pla.json` plus `profiles/README.md` provenance (Claude)
- [x] 3.2 Node slice check: load cached `slicer.js`/`slicer.wasm`, `onewasm_init` with the profile JSON, slice a generated calibration cube, assert G-code has Marlin start sequence and PLA temperatures (Codex)
- [x] 3.3 Create `src/worker/protocol.ts` (`ToWorker`/`FromWorker` types) (Codex)
- [x] 3.4 Create `src/worker/engine.worker.ts`: load via stream-loader, init profile, slice with progress, cancel via `terminate()` (Codex) — progress is start/end only: the release exports no `addFunction` and its function table cannot grow
- [x] 3.5 Wire `src/main.ts`: file input, spawn worker, handle progress/done/error (single-thread only) (Claude)
- [x] 3.6 Vitest test for `protocol.ts` message-shape guards (Codex)

## Phase 4: Export and Panel (PR 4)

- [ ] 4.1 Create `src/export/save-gcode.ts`: `canShare` probe, `share({files})` primary, `<a download>` Blob fallback (Codex)
- [ ] 4.2 Create `src/instrumentation/panel.ts`: render log, `crossOriginIsolated`, peak heap/timing (Codex)
- [ ] 4.3 Wire Save button and panel into `src/main.ts`; add error state UI (Claude)
- [ ] 4.4 Vitest tests for `save-gcode.ts` fallback branching and log reload-persistence (Codex)

## Phase 5: Probe and Multithread (PR 5)

- [ ] 5.1 Create `src/engine/probe.ts`: `crossOriginIsolated` check plus fixed-size shared `WebAssembly.Memory` probe (Codex)
- [ ] 5.2 Vitest test for `probe.ts` (mock success/throw) (Codex)
- [ ] 5.3 Extend `engine.worker.ts`/loader for `slicer-mt.js`/wasm variant, fixed pthread pool, `postMessage` compiled module (Claude)
- [ ] 5.4 Wire variant selection in `src/main.ts`: probe result offers multithread, else single-thread (Claude)
- [ ] 5.5 On-device iPad probe test across iPadOS 18.x/26.x per R2 (Human/remote)

## Phase 6: Contingency (build only if triggered)

- [ ] 6.1 `edge/engine-proxy.ts` Worker script + R2 binding for `/engine/*` (fallback A), setting COOP/COEP/CORP and `Content-Type` in code — build only if PR2's static delivery mechanism fails on-device (Claude)

## Phase 7: Remote, Deploy, Device Testing (gated, outside code PR budget)

- [ ] 7.1 Create GitHub repo and remote; explicit user authorization required (Human/remote)
- [ ] 7.2 Cloudflare dashboard, one-time: Workers & Pages → Create → Import a repository; build command `npm run build`, deploy command `npx wrangler deploy`; enable non-production branch builds (Human/remote)
- [ ] 7.3 Open branch preview URL; verify `crossOriginIsolated` true and `Content-Type: application/wasm` in Web Inspector (Human/remote)
- [ ] 7.4 On-device test matrix: Safari tab and PWA, STL ladder to 50MB, Web Share at 10/50/100MB (Human/remote)
- [ ] 7.5 Export instrumentation log; confirm pass/fail thresholds (peak memory <~1GB, G-code retrievable) (Human/remote)

## Phase 8: Verification

- [ ] 8.1 Run `vitest run` and `vite build`; confirm both green (Claude)
- [ ] 8.2 Cross-check implemented behavior against all four spec files' scenarios (Claude)
