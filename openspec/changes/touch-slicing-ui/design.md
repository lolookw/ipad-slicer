# Design: Touch-First Slicing UI

## Technical Approach

Replace the harness with one SolidJS PWA on the existing OrcaWasm worker. The page is a single workspace: sidebar settings, a three.js canvas, and sheets. There is no router. Pure TypeScript domain modules (catalog, settings, transforms, parsers, tier decision) sit under thin Solid containers. The worker protocol grows to protocol v2. It adds a config per slice, a mesh cache, and multi-object slice and plate operations. It returns statistics plus the effective config. The catalog is built ahead of time and committed, then loaded lazily per printer. A hand-written service worker makes the installed app work offline while keeping COOP/COEP.

**Device baseline (2026-09-15, iPad Air M2, iPadOS 26.6.1 Safari):**
- Setup: `crossOriginIsolated=true`, auto picked `mt`, and the fixed 1 GiB shared memory was allocated. Load took 1.67 s.
- Slicing: 10/20/50 MB in 3.5/4.1/6.6 s. Three slices in a row, no crash.
- Export: Web Share worked with `text/x.gcode`.
- Plan: **mt is primary on capable iPads, and st is a fully capable fallback.** iPadOS 17/18 are untested. The "result discarded" cancel came from a deliberate `?variant=st` test.
- **Never detect the iPad by UA**: iPad Safari sends a macOS UA.

## Architecture Decisions

### 1. App architecture

| Topic | Options | Decision |
|---|---|---|
| Structure | Layer folders / feature folders | **Feature folders**: `src/app`, `src/ui`, `src/i18n`, `src/catalog`, `src/settings`, `src/viewer`, `src/slice`, `src/preview`, `src/pwa`, `src/diagnostics`. Existing `engine/ worker/ export/ instrumentation/` stay. Each feature has `model/` (pure TS, unit-tested), `components/` (presentational, props only), and `*Container.tsx` (reads context, calls actions) |
| State | Global lib / Solid stores + context | **Solid `createStore` per domain** (`prefs`, `catalog`, `settings`, `plate`, `engine`, `result`), provided by one `AppProvider`. Actions are plain functions. Derived values use `createMemo`. **Never put three.js objects, ArrayBuffers, or Blobs in stores**: keep them in module-level Maps keyed by id, because store proxies break or copy them |
| Routing | `@solidjs/router` / single screen | **Single workspace** plus a step bar (Import, Configure, Slice, Preview, Save) with sheets and popovers. Deep links add no value offline, and changing `start_url` complicates the SW |
| Layout | — | Size class from `matchMedia('(min-width: 700px)')`. **Regular**: 320–360pt sidebar plus canvas. **Compact** (portrait mini, Split View ⅓): full canvas plus a bottom sheet with detents |
| i18n | `@solid-primitives/i18n` / custom dict | **`@solid-primitives/i18n`** (flatten + translator). `en.ts` is the typed source; `es.ts` must match it (unit parity test). The non-default locale is a dynamic chunk. Locale resolves from the stored pref, then `navigator.languages`, then `en`. Numbers use `Intl.NumberFormat` |
| Theming | CSS framework / tokens | **CSS custom properties** in `src/ui/tokens.css` plus CSS Modules (built into Vite). Theme is `system/light/dark` via `html[data-theme]`, mirrored to `localStorage` for a first paint with no flash |
| Touch tokens | — | `--hit: 44px`, 8pt spacing grid, 17px body text, `env(safe-area-inset-*)` padding, 28px slider thumb inside a 44px hit area, visible focus rings for the keyboard and trackpad |

### 2. Engine integration

| Topic | Options | Decision |
|---|---|---|
| Profile | Static import / per slice | **Config per slice**: the main thread assembles and validates the config and sends `NativeConfig` (~10 KB). The static `profiles/` import is removed |
| Session | Re-init per slice / reuse | **One session per config hash.** Same hash: reuse. New hash: create and init a new session, then destroy the old one. The module is never re-instantiated. Calling `onewasm_init` twice on one session is unverified, so it is avoided |
| Meshes | Transfer bytes per op / worker cache | **Worker caches `Blob`/`File` by `meshId`** (structured clone, disk-backed). Each op reads it into the heap and frees it afterwards. The main thread never keeps raw STL bytes. After a worker restart, the client re-sends meshes before the next op (tracked by `generation`) |
| Multi-object | — | Always `onewasm_slice_stl_multi`: a concatenated blob, `offsets` as `[start,end]` pairs, a Float32 table with stride 11 (`scale3, rotation3, mirror3, offsetXY`, where NaN means let the engine place it) |
| Cancel | — | **mt**: `terminate()`, then re-create the worker (fixed memory, proven in the spike). The UI is free at once. **st**: soft cancel. The request id is marked discarded, and the UI goes back to editable at once with a "finishing previous slice" chip. New requests queue with latest-wins. Terminating st is never allowed (WebKit crash) |
| Variant | `?variant=` / pref + probe | Pref `auto/st/mt` lives in Diagnostics. **auto = `probeThreading()`**: mt when isolated and the fixed memory is allocated, otherwise st. This does not depend on the tier. Changing the variant persists the pref and reloads the page. A **sticky fallback**: a crash marker during an mt load or slice sets `mtFailed[buildId]`, so auto picks st on that build until the user retries |
| Progress | — | Indeterminate spinner plus elapsed time (the build has no `addFunction`) |

### 3. Catalog pipeline

| Topic | Decision |
|---|---|
| Builder | `scripts/catalog/resolve.mjs`: the resolver library taken from `resolve-profile.mjs`. It looks presets up through the pinned vendor index (`<Vendor>.json` `machine_list/process_list/filament_list`), which replaces the hand-kept `PRESETS` map. `build-catalog.mjs` reads the committed curation file `catalog.config.json` (vendor, then model: machine preset, process ladder, generic PLA/PETG/ABS, fixups such as `use_relative_e_distances`) |
| Compatibility | Curated and explicit. Accept processes and filaments that list the machine in `compatible_printers`. **Presets that only have a `*_condition` must be listed by hand** (no expression evaluator). Raw compatibility metadata stays in the pack's `meta` and is never sent to the engine |
| Pack format | `public/catalog/<orcaTag>/printers/<id>.<sha8>.json` = `{schema:1, id, vendor, model, nozzle, machine:{…flat}, processes:[{id,name,ladder?,layerHeight,settings}], filaments:[{id,name,type,settings}], combos:[[processId,filamentId]], meta}`. Sections stay separate and are merged at runtime (machine, then process, then filament, then `*_settings_id`), which is smaller than storing full combos |
| Index | `index.json` = `{schema, orcaTag, engineRelease, vendors:[{id,name,models:[{id,name,nozzle,pack,bytes,sha256}]}]}`. Precached. The client checks pack SHA-256 with `crypto.subtle` |
| Smoke gate | `smoke-catalog.mjs` reuses `engine-bridge.mjs` plus the Node st engine (the `slice-check` bootstrap). It slices a 20 mm cube per combo. Failing combos are left out, and a model with zero passing combos is dropped. Exit is non-zero if a `required` model fails |
| Where it runs | `npm run catalog` runs locally and the output is **committed** (it takes minutes, like the committed profile before). `npm run build` only runs the fast `verify-catalog.mjs` (hashes, schema, and a check that every index entry exists) |
| Custom printer | Build output `custom-base.json` (Custom/common machine plus a generic process ladder plus generic filaments, smoke-tested). User fields: `printable_area` (W×D), `printable_height`, `nozzle_diameter`, `gcode_flavor` (enum), `machine_start_gcode`/`machine_end_gcode` (defaults from the base), heated bed. Stored in IndexedDB `printers` and validated by the settings schema |

### 4. Settings model

```ts
type SettingDef = {
  key: string; type: 'float'|'int'|'percent'|'bool'|'enum'|'string'|'gcode';
  vector?: 'filament'|'extruder';          // serialized as string[]
  enum?: readonly string[]; min?: number; max?: number;           // engine hard bounds
  ui?: { min?: number|((ctx: Ctx)=>number); max?: number|((ctx: Ctx)=>number); step?: number };
  unit?: 'mm'|'mm/s'|'°C'|'%'|'s'; tier: 'simple'|'advanced'|'expert';
  category: 'quality'|'strength'|'speed'|'support'|'adhesion'|'cooling'|'retraction'|'machine'|'others';
  labelKey: `settings.${string}.label`; perObject?: boolean; visibleIf?: (cfg: Cfg)=>boolean;
};
```

| Topic | Decision |
|---|---|
| Schema | Hand-pinned TS in `src/settings/schema/` (defaults, enums, bounds from research L2). `SCHEMA_VERSION` is bumped whenever keys change. Unit tests: every `labelKey` exists in `en`/`es`, and every enum matches the research table |
| Codec | Typed UI values map to and from Orca strings (`"20%"`, `"1"/"0"`, `["200"]`). Unknown preset keys pass through untouched |
| Virtual controls | `bedTemp` writes the plate key selected by `curr_bed_type` (and its `_initial_layer` twin). `adhesion` maps to `brim_type` (+`brim_width`) |
| Simple mode (10) | Printer, filament, quality ladder, infill %, supports (off/normal/tree), adhesion, walls, nozzle temp, bed temp, plate type |
| Quality ladder | Draft/Standard/Fine map to a **pack process** tagged at build time (by layer height). If a rung is missing, synthesize it: Standard plus a `layer_height` override |
| Merge order | pack machine ⊕ process ⊕ filament (preset base), then the synthesized ladder override, then user overrides, then per-object overrides (capability-gated, see Open Questions) |
| Validation | Pure `validate(cfg, ctx) → Issue[]` with severity error or warning. Checks: hard bounds, **closed enums on every schema key including preset values**, and cross-field rules (layer height > 0 and ≤ nozzle, first layer ≤ nozzle, the E-mode/G92 rule). Errors disable Slice. After a slice, compare the effective config with the sent config and warn "engine ignored X" |
| IndexedDB | `idb`, DB `ipad-slicer` v1. Stores: `presets` {id, kind, printerId, baseId, overrides, schemaVersion, updatedAt}, `printers` (custom), `ui` (key/value). Structural migrations use the `upgrade` switch with fall-through. Data migrations run a pure `migrateOverrides` chain keyed by `schemaVersion` (renamed keys mapped, removed keys dropped with a notice) |
| Export | `{format:'ipad-slicer.presets', version:1, exportedAt, presets[]}`, saved through the existing `saveFile` |

### 5. Model workspace

| Topic | Options | Decision |
|---|---|---|
| STL parsing | Main thread / worker | **`mesh.worker.ts` runs `STLLoader.parse`** on the `File` and transfers position and normal arrays plus bounds. Fallback: parse on the main thread if the worker fails. Main builds a non-indexed `BufferGeometry` |
| Scene | — | Z-up in mm. Bed and grid from `printable_area`, volume wireframe from `printable_height`, `MeshLambertMaterial`, hemisphere light. **Render on demand** (invalidate flag), with no continuous rAF loop |
| Camera (camera-controls) | — | 1 finger: rotate. 2 fingers: dolly + truck. 3 fingers: truck. Double-tap: fit. Trackpad and mouse: left rotates, right trucks, wheel dollies |
| Gizmo | TransformControls / custom | **Custom.** Tap selects (≤10 px, ≤250 ms, raycast). A gesture that **starts on the selected object** belongs to the gizmo (`controls.enabled=false` until it ends): 1-finger drag moves on the z=0 plane, 2-finger twist rotates about Z, pinch scales uniformly. Floating 44pt toolbar: lay flat (orient), rotate 90° X/Y, scale (mm/in/% with a numeric sheet), duplicate, delete, reset. Objects always drop to the bed |
| Transforms | — | `ObjectTransform` mirrors the engine JSON (`scale, rotation, mirror, offset`). One adapter handles three.js ⇄ engine conversion and the stride-11 encoding, covered by unit tests. Rotation units, Euler order, and offset origin are **unverified** and must be pinned by the PR 4b Node contract check before the gizmo commits to a convention |
| Units | — | Assume mm. If the largest bbox dimension is under 5 or over 2000, offer ×25.4, ×1000, or ÷10 |
| Renderer | WebGPU default / WebGL2 default | **`WebGLRenderer` (WebGL2) by default.** A `createRenderer()` factory adds `three/webgpu` as an opt-in on the Full tier when `navigator.gpu` exists, promoted to default only after device benchmarks. This matches `gcode-preview`, which uses WebGL |
| Disposal | — | Removing an object disposes its geometry and material. Unmount calls `controls.dispose()`, `renderer.dispose()`, and `forceContextLoss()`. **Opening the preview disposes viewer GPU buffers** (CPU arrays are kept and re-uploaded on return): a 50 MB STL is about 72 MB of GPU memory on its own |

### 6. Results and preview

| Topic | Decision |
|---|---|
| Estimates | The worker calls `onewasm_get_last_statistics` right after a successful slice (schema 0.2). Fallback: parse the G-code comments (`estimated printing time (normal mode)`, `filament used [g]`). The worker also counts `;LAYER_CHANGE` and parses the `; key = value` config block to get `effective`. Estimates are cleared on any failed attempt. The result is marked **stale** when plate or settings change |
| Cost | `filamentG / 1000 × pricePerKg`. The price is stored as the filament override `filament_cost`, and the currency code is a UI pref (formatted with `Intl`). The engine's `totalCost` is shown only in diagnostics (its semantics are unverified) |
| Web Component | `src/preview/GcodePreview.tsx` loads the fork's element with a dynamic import (own chunk) and declares the JSX intrinsic type. `ref` + `onMount` set **properties** (not attributes). `createEffect` pushes the layer range. `onCleanup` calls the element's dispose and removes the node. All fork-specific calls stay in `preview/adapter.ts`, so swapping the library only touches that file |
| G-code memory | Main keeps one `ArrayBuffer` (needed to Save) and hands the preview a copy |
| Budget | Estimate lines ≈ bytes/30 and GPU bytes ≈ segments × 48. Budget is **Full 150 MB, Standard 100 MB**. Degradation ladder: all layers as lines, then a visible window (current ±N layers), then decimated, then a "preview too large" notice (estimates and Save still work). WebGL context loss drops one rung and records a log entry |
| Layer slider | Vertical on the right edge in landscape, horizontal at the bottom in portrait. 44pt thumb, ± steppers with long-press repeat, rAF-throttled signal, labels for layer number and Z height |

### 7. Offline PWA

| Topic | Options | Decision |
|---|---|---|
| SW tooling | vite-plugin-pwa (Workbox) / hand-written | **Hand-written `src/pwa/sw.ts`** built to `/sw.js` by a small Vite plugin that injects `BUILD_ID` and the precache list. Why: engine parts need lazy caching per variant, headers must be preserved exactly, and it has to be debuggable on the device without a remote inspector. Fallback: vite-plugin-pwa `injectManifest` |
| Caches | — | `app-<BUILD_ID>` (precache: shell, chunks, locales, icons, manifest, catalog index, custom base), `engine-<release>` (cache-first, filled by the variant actually loaded), `catalog-<orcaTag>` (cache-first hashed packs, cached when selected or used by a saved preset). `activate` deletes caches that are not current |
| Fetch | — | Only same-origin `GET` without `Range`; everything else passes through. Navigation serves the cached `index.html`. Cached documents and scripts go through `withIsolationHeaders()`, which re-applies COOP/COEP/CORP so the offline app stays `crossOriginIsolated` |
| Update | — | Check `registration.update()` on launch and on visibility change. A waiting SW shows an "Update available" toast. Accepting sends `skip-waiting`, and `controllerchange` reloads. **Reload is blocked while a slice is running** |
| Kill switch | — | `SW_KILL=1 npm run build` emits an SW that clears caches and unregisters |
| Manifest | — | Name, `id`, `orientation: any`, PNG 192/512 plus maskable 512, `apple-touch-icon` 180 PNG, two `theme-color` metas by `prefers-color-scheme`. Icons are committed (no image tooling at build) |
| iOS eviction | — | Call `navigator.storage.persist()` after the first preset save or install. Show `storage.estimate()` in diagnostics. If offline and the engine cache is missing, say so clearly ("needs a connection once, ~9 MB"). Nudge users to export presets as JSON |
| Headers | — | Add `/sw.js` and `/index.html` `no-cache`; `/assets/*` and `/catalog/*` `immutable` |

### 8. Adaptive tiers

| Signal (feature detection only, never UA) | Use |
|---|---|
| WebGL2 context + `MAX_TEXTURE_SIZE` | Required for the app. Full needs ≥ 16384 |
| `navigator.hardwareConcurrency` | Full needs ≥ 6 (provisional: iPad Safari value unconfirmed, now logged) |
| `navigator.gpu` | Counts toward Full as an alternative to cores. Enables the WebGPU opt-in |
| `crossOriginIsolated` + probe result | Decides the variant only (independent of tier) |
| Crash marker (`localStorage` entry set when a slice or preview starts, cleared when it ends) | Found at startup: log `suspected-crash`, demote auto tier to Standard, offer the mt→st fallback |
| `(pointer: coarse)`, viewport width | Layout and hit-slop only |

Full = WebGL2 ∧ texture ≥ 16384 ∧ (cores ≥ 6 ∨ `navigator.gpu`), with no crash marker. Otherwise Standard. The user picks Auto, Standard, or Full under Settings → Performance. Diagnostics lists the reasons.

| Capability | Standard | Full |
|---|---|---|
| Engine variant (auto) | mt if probe passes, else st | mt if probe passes, else st |
| Objects / total triangles | ≤ 4 / ≤ 1.5 M | ≤ 16 / ≤ 4 M (unverified) |
| Preview budget, default view | 100 MB, layer window | 150 MB, all layers if fits |
| Viewer DPR cap / antialias | 1.5 / off | 2 / on |
| WebGPU renderer opt-in | hidden | available |

### 9. Dependencies

| Package | License | Size (gzip) | Notes |
|---|---|---|---|
| `solid-js` | MIT | ~7 KB | runtime |
| `vite-plugin-solid` | MIT | dev | |
| `@solid-primitives/i18n` | MIT | <1 KB (unverified) | |
| `three` (pinned to the fork's peer; research says `^0.178`, i.e. `0.178.x`) | MIT | ~150 KB used subset (unverified) | one copy only |
| `camera-controls` | MIT | ~15 KB (unverified) | |
| `@chestnutlabs/gcode-preview-element` 0.20.1 (fork of remcoder/gcode-preview, verified 2026-09-18) | MIT | 62 KB unpacked, lazy chunk | npm package, pinned exact; peer `three ^0.178.0`; `npm ls three` shows one deduped 0.178.0. Do NOT use the unscoped `gcode-preview` (remcoder, needs three ^0.159) |
| `idb` | ISC | ~1.2 KB (unverified) | |
| `@playwright/test`, `@solidjs/testing-library`, `jsdom` | Apache-2.0 / MIT / MIT | dev | |

All are compatible with AGPL-3.0.

## Data Flow

```
File ─► mesh.worker (STLLoader) ─► geometry ─► Viewer (three)      plate store
  └────────── Blob (clone) ─────► engine.worker mesh cache            │
catalog index ─► pack(sha ok) ─► merge ─► overrides ─► validate ─► NativeConfig
```

Slice sequence (mt, with cancel):

```
UI            EngineClient              engine.worker            SW/cache
 |--slice----->| validate ok; hash cfg   |                        |
 |             |--mesh-put (if gen new)->| cache Blob             |
 |             |--slice{id,cfg,objs}---->| session(hash) → multi  |
 |<-busy-------|                         | stats, layers, effective
 |             |<-done{id,gcode,stats}---|                        |
 |<-result-----| (drop if id discarded)  |                        |
 |--cancel---->| mt: terminate+new worker, gen++ | st: mark id discarded, queue next
```

## File Changes

| File | Action | PR | Description |
|---|---|---|---|
| `package.json`, `vite.config.ts`, `tsconfig.json` | Modify | 1a | Solid plugin, `jsx: preserve` / `jsxImportSource`, multi-page input, test include `*.test.ts(x)` |
| `index.html` → `harness.html`, `src/main.ts` → `src/harness/main.ts` | Move | 1a | Harness stays reachable until 5b |
| `index.html`, `src/app/{index.tsx,App.tsx,AppProvider.tsx,stores/*.ts,layout/*}` | Create | 1a | Shell, stores, size classes |
| `src/ui/{tokens.css,Button,Sheet,Popover,Segmented,Stepper,Slider}.tsx` | Create | 1a | Touch primitives |
| `scripts/serve-dist.mjs`, `playwright.config.ts`, `tests/e2e/shell.spec.ts` | Create | 1a | Static server applying `_headers`; iPad WebKit project |
| `src/i18n/{index.ts,en.ts,es.ts,format.ts}`, `src/app/theme.ts` | Create | 1b | i18n, theme |
| `src/app/tier/{signals.ts,decide.ts}` | Create | 1b | Tier decision (pure) |
| `scripts/catalog/{resolve,build-catalog,smoke-catalog,verify-catalog}.mjs`, `catalog.config.json` | Create | 2 | Catalog pipeline |
| `scripts/resolve-profile.mjs` | Delete | 2 | Replaced by `scripts/catalog/resolve.mjs` |
| `public/catalog/**` | Create (generated) | 2 | Committed packs (excluded from authored count) |
| `scripts/slice-check.mjs` | Modify | 2 | `--pack` argument instead of `profiles/` |
| `src/catalog/{types,index-client,pack-client,merge}.ts` | Create | 2 | Lazy, hash-verified loading |
| `src/settings/{schema/*,codec,validate,merge,ladder,virtual}.ts` | Create | 3a | Settings model |
| `src/storage/{db,presets-repo,migrate,import-export}.ts` | Create | 3a | IndexedDB |
| `src/settings/components/*`, `src/catalog/components/*`, `src/i18n/{en,es}.ts` | Create/Modify | 3b | Simple and advanced panels, pickers, labels |
| `src/viewer/{mesh.worker,scene,renderer,camera,gestures,gizmo,transforms,bed}.ts`, `src/viewer/components/*` | Create | 4a | Workspace |
| `src/worker/protocol.ts`, `engine-bridge.mjs`/`.d.mts` | Modify | 4b | v2 messages; `sliceMulti`, `preparePlate`, `getStatistics` |
| `src/engine/client.ts`, `scripts/engine-contract-check.mjs` | Create | 4b | Queue, generations, cancel; Node API contract check |
| `src/worker/engine.worker.ts` | Modify | 4b/5a | Mesh cache, sessions per hash, plate, slice, stats |
| `src/slice/{gcode-parse,summary,cost,crash-marker}.ts`, `src/slice/components/*` | Create | 5a/5b | Results, Save, cancel UX |
| `harness.html`, `src/harness/`, `profiles/`, `src/instrumentation/panel.ts` (`createPanel`) | Delete | 5b | Harness removed. `summarizeLog`/`formatBytes` move to `src/diagnostics/metrics.ts`. `test-model.ts` stays for the diagnostics size ladder |
| `src/diagnostics/DiagnosticsSheet.tsx` | Create | 5b/7 | Minimal in 5b (log, variant, isolation), complete in 7 |
| `src/instrumentation/log.ts` | Modify | 5b | Key `ipad-slicer:log`, one-time read of the old spike key |
| `src/preview/{GcodePreview.tsx,adapter.ts,budget.ts,LayerSlider.tsx}` | Create | 6 | Toolpath preview |
| `src/pwa/{sw.ts,register.ts,UpdateToast.tsx,vite-sw-plugin.ts}`, `public/icons/*.png` | Create | 7 | Offline |
| `public/manifest.webmanifest`, `public/_headers` | Modify | 7 | PNG icons, caching headers |

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit (Vitest, node) | codec, validate, merge order, ladder, migrations, import parser, stats/header/effective parsers, cost, transform encoder (stride 11), protocol guards, tier `decide`, SW `route()`, catalog resolve/merge (offline fixtures), i18n key parity | Pure functions, fixtures |
| Component (Vitest + jsdom + `@solidjs/testing-library`) | Containers: Slice disabled on errors, stale result, cancel states per variant | Mocked `EngineClient` |
| Engine (Node) | `smoke-catalog` (every shipped combo); `engine-contract-check` (session per hash, multi 2 objects, orient/arrange, stats, rotation units/order) | Real st engine; mt via `slice-check:mt` |
| E2E (Playwright WebKit, `devices['iPad Pro 11']`, portrait + landscape) | Isolation true; import → printer → slice → estimates → preview canvas → Save (download path); invalid value blocks slice; **all interactive elements ≥ 44×44 in EN and ES**; offline reload keeps `crossOriginIsolated`; dark mode | `scripts/serve-dist.mjs` (a real server, since `route.fulfill` does not grant isolation; `vite preview` hangs on this PC) |
| Device checklist | Install, offline reopen, mt load + 50 MB slice, forced st path + soft cancel, mt cancel restart, 50 MB preview without reload, Split View compact, Share to Files, ES, dark mode, trackpad, iPadOS 17/18 if available | Manual; export the diagnostics JSON |

## Threat Matrix

| Boundary | Adversarial cases | Applicability | Design response | Planned RED tests |
|---|---|---|---|---|
| Documentation-like paths / Git repo selection / Commit / Push / PR commands | — | N/A: no shell, subprocess, VCS, or PR automation; build scripts only use `fetch` and fs | — | — |
| SW fetch routing | cross-origin GET, `Range` request, POST, navigation while offline, cached response missing COOP/COEP, stale `BUILD_ID` cache | Applicable | Pure `route(req)`: only same-origin GET without Range is handled, others pass through; `withIsolationHeaders` on documents and scripts; old caches deleted on activate | One `route()` test per case; e2e offline reload asserts `crossOriginIsolated` |
| Preset JSON import | not JSON, >1 MB, wrong `format`/`version`, `__proto__`/`constructor` keys, unknown setting keys, out-of-range and invalid enum values, oversized strings / G-code macros | Applicable | Size cap 1 MB; parse into null-prototype objects and reject prototype keys; allow-list schema keys (unknown keys dropped and reported); run `validate()`; ids re-generated; nothing written if any record is fatal | One test per case |
| Catalog pack loading | SHA mismatch, truncated JSON, pack `schema` unknown | Applicable | Verify SHA-256 before parse; reject and evict the cache entry; show "printer unavailable" | One test per case |

## Migration / Rollout

The PRs are chained auto-chain, stacked to main. At ≤800 changed lines a slice is one PR; above that it splits. Generated catalog JSON and binary icons are excluded from the authored count.

| PR | Scope | Est. authored lines |
|---|---|---|
| 1a | Tooling, shell, stores, UI primitives, serve-dist + e2e scaffold | ~500 |
| 1b | i18n, theme, tiers | ~400 |
| 2 | Catalog builder, smoke, verify, client loaders | ~650 |
| 3a | Schema, codec, validation, merge, ladder, IndexedDB, migrations, import/export | ~650 |
| 3b | Settings and catalog UI, EN/ES labels | ~650 |
| 4a | Mesh worker, scene, camera, gizmo, toolbar | ~700 |
| 4b | Protocol v2, engine client, orient/arrange, contract check | ~550 |
| 5a | Slice pipeline: config per slice, multi, stats, effective, cancel queue, crash marker | ~450 |
| 5b | Results UI, Save, minimal diagnostics, **harness deletion** (~300 deletions) | ~600 |
| 6 | Toolpath preview | ~550 |
| 7 | SW, manifest/icons, headers, full diagnostics, offline e2e | ~700 |

**No data migration**: the spike stored only the log, which is read once from the old key. **Rollback**: roll back the deployment and revert PRs newest first. A kill-switch SW build unregisters the service worker.

## Open Questions

- [ ] **Per-object brim/supports**: API 0.2 `slice_stl_multi` accepts only transforms and extruder ids, with no per-object config. MVP fallback: these settings apply to the whole plate and the per-object UI stays hidden unless PR 4b's contract check finds a path. A true per-object version needs an engine build or a product decision.
- [ ] Transform rotation units, Euler order, and offset origin (PR 4b contract check).
- [ ] Whether session re-init leaks heap (the design avoids calling `init` twice on one session; watch heap across slices in diagnostics).
- [x] `gcode-preview` fork: npm `@chestnutlabs/gcode-preview-element@0.20.1`; tag `gcode-preview` (`defineGcodePreview()`); properties `source` (Uint8Array/ArrayBuffer/File), `layerRange` [start,end], `quality` ('auto'|'lines'|'tubes'), `tube`, `theme`, `colorMode`, `buildVolume`, `showTravel`, `hiddenFeatureRoles`, `adjacentLayers`, `progressivePreview`; dispose is implicit: `disconnectedCallback` calls `controller.dispose()`, and reconnect builds a fresh controller. Peer three `^0.178.0`. STILL OPEN: demonstrating real buffer release on layer-window changes in a browser (done in 10.2/10.6 probe).
- [ ] Generic filament presets for Voron (empty `filament_list`) and exact BBL/Prusa generic names.
- [ ] iPad Safari `hardwareConcurrency` value (Full threshold is provisional); mt and SW isolation on iPadOS 17/18.
