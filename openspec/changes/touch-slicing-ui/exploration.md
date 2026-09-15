## Exploration: Touch-first slicing UI (touch-slicing-ui)

> Mirrored from Engram `sdd/touch-slicing-ui/explore` (id 138). Produced by sdd-explore on 2026-09-15.

### Current State

The repo is a measurement-harness spike, not a product UI. `index.html` is one plain page (native `<select>`/`<input type=file>`/buttons) wired by `src/main.ts`: variant select (auto/st/mt via `?variant=`), a test-model dropdown, a single STL file input, Slice/Cancel/Save buttons, a `<progress>` bar, and an instrumentation panel (`src/instrumentation/panel.ts` + `log.ts`, a localStorage ring buffer exported as JSON). There is exactly one printer/filament/process combination: `profiles/ender3v2-020-pla.json`, a flat 207-key `orca.native-json` object generated at build time by `scripts/resolve-profile.mjs` and imported statically into `src/worker/engine.worker.ts`. The engine (OrcaWasm, OrcaSlicer 2.4.2, API 0.2) runs in one Web Worker; `engine-bridge.mjs` marshals STL in / G-code out through the C ABI. No preview exists. No framework: vanilla TS + Vite 8 + TypeScript 7.

An iPad-emulated WebKit pass (Playwright `iPad Pro 11`) against the live deploy found touch targets below the 44 pt HIG minimum: `#variant-select` 181x28, `#test-model` 134x28, `#stl-input` 221x25.

### Affected Areas

- `src/main.ts`, `index.html` — the harness UI is replaced by a real app shell (import → configure → slice → preview → save), likely with a UI framework.
- `src/worker/engine.worker.ts` — the static profile import becomes a dynamic, user-selected profile (printer + process + filament + overrides) assembled per slice.
- `scripts/resolve-profile.mjs`, `profiles/` — evolves from one hardcoded combo into a catalog builder; must keep `compatible_printers*` / `compatible_prints*` metadata to filter process/filament choices by printer.
- `src/instrumentation/panel.ts`, `log.ts` — kept, moved behind an advanced/diagnostics section.
- `src/engine/*` — unaffected internals; variant selection moves to advanced options.
- New: model viewer / G-code preview module; profile/settings persistence; new dependencies in `package.json`.

---

### 1. Printer/filament/process catalog

The resolver follows `inherits` by preset name through a maintained `PRESETS` map, caches raw JSON in `.engine-cache/orca-profiles-v2.4.2/`, flattens parent→child, strips bookkeeping keys (including `compatible_printers*`), and writes one flat JSON. The committed 207-key output includes `layer_height`, `wall_loops`, `sparse_infill_density`, `sparse_infill_pattern`, `enable_support`, `support_type`, `brim_width`, `nozzle_temperature[_initial_layer]`, `hot_plate_temp[_initial_layer]`, `outer_wall_speed`, `sparse_infill_speed`, `travel_speed`, `initial_layer_speed`. There is no `brim_type` key: the resolver only emits keys set somewhere in the chain, so a settings UI must write keys explicitly and engine defaults need verification (`onewasm_get_capabilities` / engine defaults).

**Catalog size (partially unverified):** a shallow listing of `resources/profiles` at `v2.4.2` shows ~60 vendor entries with top-level index files from 901 B (UltiMaker) to 286 KB (BBL); Creality's index is 121,832 B. The full per-vendor `machine/`, `process/`, `filament/` trees were not measured. One resolved flat profile is small (<10 KB), so a curated catalog of 100–300 combos would very likely stay well under 1–2 MB uncompressed.

| Option | Pros | Cons |
|---|---|---|
| (a) Curated subset, build-time resolved | Proven resolver pattern, small guaranteed bundle, fully offline | Manual curation; unlisted printers need a custom-printer form or a redeploy |
| (b) Full catalog, build-time resolved + lazy per-vendor loading | Desktop-level completeness | Size/file count unverified; more build-time fetches; compatibility filtering complexity |
| (c) Runtime resolution from GitHub raw | Always current | Rejected: breaks offline-first, adds a live dependency, no SLA/CORS guarantees |

Desktop OrcaSlicer selects the printer first, then filters process and filament presets by their `compatible_printers` / `compatible_printers_condition` (and filament `compatible_prints`). The `Custom/` vendor folder supports custom printers on the same common bases.

**Recommendation:** (a) for MVP (Bambu, Prusa, Creality, plus a few Voron/RatRig/Elegoo/Anycubic) with a custom-printer form; revisit (b) after measuring the full catalog.

---

### 2. Simple vs advanced settings

OrcaSlicer has a basic/advanced mode split (secondary source, lower confidence: [orcaslicers.us.com](https://orcaslicers.us.com/settings/)). Bambu Studio/Handy, PrusaSlicer, and Cura tiers were not verified against primary sources.

| Simple-mode control | Keys present in the resolved profile |
|---|---|
| Layer height | `layer_height` |
| Walls | `wall_loops` |
| Infill density / pattern | `sparse_infill_density`, `sparse_infill_pattern` |
| Supports | `enable_support`, `support_type` |
| Brim | `brim_width` (no `brim_type` — verify) |
| Nozzle temperature | `nozzle_temperature`, `nozzle_temperature_initial_layer` |
| Bed temperature | `hot_plate_temp`, `hot_plate_temp_initial_layer` (plus `cool_plate_temp`, `eng_plate_temp`, `textured_plate_temp`) |
| Speed | `outer_wall_speed`, `sparse_infill_speed`, `travel_speed`, `initial_layer_speed` |

Everything else (acceleration, retraction, ironing, seams, cooling, G-code macros, machine limits) goes to advanced, alongside engine variant, logs/metrics export, and diagnostics.

---

### 3. Preview options

- **(a) 2D layer canvas** — custom `<canvas>` G-code parsing; cheapest, weakest fit for a modern touch product.
- **(b) 3D toolpath preview** — original [`gcode-preview`](https://www.npmjs.com/package/gcode-preview) is ~2 years stale ([Snyk](https://snyk.io/advisor/npm-package/gcode-preview)); the MIT fork [ChestnutLabs/gcode-preview](https://github.com/ChestnutLabs/gcode-preview) offers worker-based parsing, a versioned IR, and framework adapters. MIT is compatible with AGPL-3.0. iPad GPU performance with 5–50 MB G-code is unverified.
- **(c) Pre-slice 3D model viewer** — three.js `STLLoader` (MIT) for placement/orientation; lower risk.

Memory: preview geometry adds to the engine worker's memory (up to 1 GiB fixed for mt); the combined budget on iPad is unmeasured. Parse G-code in a worker.

WebGPU is enabled by default in Safari/iPadOS 26 ([WebKit blog](https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/), [appdevelopermagazine](https://appdevelopermagazine.com/webgpu-in-ios-26/)); three.js `WebGPURenderer` falls back to WebGL2 since r171 ([utsubo](https://www.utsubo.com/blog/threejs-2026-what-changed)). WebGL2 is the safe baseline.

---

### 4. UI framework

| Option | Notes |
|---|---|
| Vanilla TS | Zero runtime; the 233-line harness already shows imperative wiring won't scale to a settings-heavy app |
| Svelte 5 | Compiled, runes (fine-grained reactivity), strong DX ([arc.dev](https://arc.dev/employer-blog/svelte-vs-vue-vs-solidjs/), [pkgpulse](https://www.pkgpulse.com/guides/solidjs-vs-svelte-5-vs-react-reactivity-2026)) |
| SolidJS | ~7 KB, signals, JSX close to React, strong runtime benchmarks (same sources) |
| Preact | ~3–4 KB React-compatible (not compared in retrieved sources) |
| React 19 | ~45 KB, largest ecosystem and portfolio recognition |

The framework runtime is negligible next to the WASM heap; Vite/TS support is equal across options; three.js integrates with any of them.

**Tentative recommendation:** SolidJS (React-like authoring, fine-grained updates for a large settings surface, small runtime). This is a preference call for the user.

---

### 5. Engine-enabled model handling (API 0.2)

- `onewasm_slice_stl` — wired.
- `onewasm_slice_stl_multi` — multiple objects with per-object transforms (stride 11) and extruder ids.
- `onewasm_prepare_plate` — `AUTO_ORIENT` (1) / `ARRANGE` (2), returns transforms JSON.
- `onewasm_obj_to_stl`, `onewasm_cad_to_stl` — conversions (CAD format unverified; likely STEP).
- `onewasm_read_3mf` / `onewasm_write_3mf` — 3MF round trip.
- `onewasm_get_capabilities` — never called yet; use it to discover formats and limits.

**MVP:** STL import, auto-arrange/orient, basic move/rotate/scale on the viewer. **Later:** OBJ/STEP import, multi-extruder plates, 3MF projects (after the persistence model is designed).

---

### 6. iPad UX patterns

- 44x44 pt minimum touch targets ([HIG summary](https://www.nadcab.com/blog/apple-human-interface-guidelines-explained)).
- On iPad, popovers anchor to their source; reserve full-screen sheets for immersive flows; support size classes, Split View/Slide Over, pointer and keyboard ([Apple HIG Layout](https://developer.apple.com/design/human-interface-guidelines/foundations/layout/)). Suggests a sidebar (printer/filament/process) + main canvas (preview).
- PWA: `viewport-fit=cover` already set; add `env(safe-area-inset-*)`; keyboard avoidance for numeric inputs; Files app import already works.
- Offline: COEP is enforced before a response reaches a service worker, so a SW cannot relax isolation but can cache same-origin, CORP-correct assets ([web.dev why-coop-coep](https://web.dev/articles/why-coop-coep), [web.dev coop-coep](https://web.dev/articles/coop-coep)). Re-evaluate an offline-first service worker for the installed app.

---

### 7. Information architecture

- **Main flow:** Import → Configure (printer / filament / process; simple mode default) → Slice → Preview → Save (existing share/download path). Reuse the worker protocol and state machine.
- **Advanced options:** engine variant, logs/metrics export, diagnostics.
- **Presets:** IndexedDB for structured user presets (general web-platform knowledge, not re-sourced), JSON export/import via the existing save primitives.

---

### 8. Risks, research lanes, product decisions

**Risks (ranked)**

1. Full catalog size unverified (high).
2. No on-device iPad numbers; preview memory compounds the open spike risk (high).
3. `gcode-preview` upstream unmaintained; fork not vetted (medium).
4. Missing keys in resolved profiles (e.g. `brim_type`) (medium).
5. Service worker + COOP/COEP untested here (low-medium).
6. Framework choice has no prior art (low; user decision).

**Candidate research lanes**

1. Full `resources/profiles` tree size and file count at `v2.4.2`.
2. `onewasm_get_capabilities` output and engine defaults for absent keys.
3. ChestnutLabs `gcode-preview` fork: maintenance, adoption, Safari/iPad performance data.
4. Primary-source simple/advanced tiers: Bambu Studio/Handy, PrusaSlicer, Cura.
5. iPad Safari service worker + COOP/COEP caching of large multi-part same-origin assets.

**Product decisions before proposal**

1. Catalog scope — curated (recommended) / full lazy / runtime (rejected).
2. Preview depth for MVP — model viewer only / viewer + toolpath / 2D layers.
3. UI framework — Svelte 5 / SolidJS (tentative) / Preact / React 19.
4. Target iPads / minimum iPadOS.
5. UI language / i18n.

### Ready for Proposal

Partial: confirm decisions 1–4 and acknowledge (or run) research lanes 1–2 before `sdd-propose`.
