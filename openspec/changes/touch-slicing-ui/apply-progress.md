
## Task 1.4 - touch primitives (Codex, 2026-09-15)

- Status: success; Standard mode (`strict_tdd: false`); only task 1.4 completed.
- Entry status reconstructed from proposal/design/spec/tasks: `applyState: ready`, artifact store `openspec`, assigned slice `1a`, allowed implementation root `src/ui/`; task/progress records also authorized. No applicable threat-matrix cases for this unit.
- Created `src/ui/{tokens.css,Button.tsx,Sheet.tsx,Popover.tsx,Segmented.tsx,Stepper.tsx,Slider.tsx,index.ts,primitives.test.tsx}`. Props-only components; controlled values, optional controlled sheet detent, themed 44px targets, focus handling, pointer and keyboard interactions.
- Workload boundary: task 1.4 within the assigned auto-chain / stacked-to-main slice; no commits, branches, installs, network, config or app edits.

### Work Unit Evidence

| Evidence | Observed result |
|---|---|
| Focused test | `npm exec -- vitest run src/ui` (Windows `npm.cmd`): exit 0, 1 file / 11 tests passed. |
| Typecheck | `npm run typecheck` (Windows `npm.cmd`): exit 0, no errors on final run. |
| Runtime scenario | Solid components mounted in jsdom: detents, modal focus wrap/containment/restoration, backdrop/Escape, four collision flips, outside dismissal, keyboard selection, clamping/repeat cleanup, slider pointer/keyboard/native input; all passed. |
| Browser/device boundary | Not run in task 1.4: integrated WebKit/iPad orientation and actual hit-area geometry belong to Claude's 1.5/1.6. jsdom proves CSS declarations and control wiring, not rendered geometry or iOS scrolling. |
| Rollback boundary | Remove the nine listed `src/ui` files and revert only task 1.4's checkbox/progress section; unrelated concurrent work is untouched. |

- Authored source/test count: 400 lines; task checkbox adds one/deletes one; this appended progress section adds 22 lines (424 total authored additions/deletions).
- Deviations: namespaced primitive styles live alongside tokens rather than separate CSS Modules; no extra stylesheet needed. CSS tests read the file locally because Vitest's default CSS mocking also mocks `?raw`. Used installed `@solidjs/testing-library`.
- Verification history: PowerShell blocked `npm.ps1`, so used `npm.cmd` without changing execution policy. An intermediate concurrent `playwright.config.ts(1,24)` TS2614 (`devices` export) error disappeared on the final run; no concurrent files were edited.
- Risks / handoff: physical touch geometry, safe areas, browser-native slider thumb appearance and iOS scroll locking still need WebKit/device verification; component English fallback accessibility labels are overrideable by caller. Next: parent independent SDD verification after the remaining slice work.

## Slice 1a — Shell, stores, layout and test harness (Claude)

Status: done. Tasks 1.1, 1.2, 1.3, 1.5 and 1.6 complete; 1.4 was delivered by Codex in the section above and reviewed by Claude (focus trap, Escape and backdrop dismissal, scroll lock, focus restore, three detents with pointer and keyboard control).

- 1.1 Tooling: `vite-plugin-solid`; Solid JSX in `tsconfig.json` (`jsx: preserve`, `jsxImportSource: solid-js`, `types: node`); multi-page build (`index.html` app + `harness.html`); Vitest split into a `node` project (engine/worker/export/instrumentation/testing) and a jsdom `ui` project. The spike harness moved to `harness.html` + `src/harness/main.ts`, with its imports and worker URL rewritten; it stays reachable until slice 5b.
- 1.2 App entry: `index.html` → `src/app/index.tsx`, `App.tsx` (step bar, per-step panes, engine state line), `AppProvider.tsx` (context, 700px regular/compact media query, `goTo` guard that refuses locked steps).
- 1.3 Stores: `src/app/stores/index.ts` with signals for prefs, flow and engine, plus id-keyed plain Maps for meshes and G-code so binaries never enter the reactive graph; `release(id)` frees a model and its result together.
- 1.5 Layout: `src/app/layout/Layout.tsx` and `src/app/app.css` — sidebar plus canvas at regular width, stacked at compact width, safe-area insets applied once, 44px minimum targets.
- 1.6 Test harness: `scripts/serve-dist.mjs` (real HTTP server applying the production isolation headers), `playwright.config.ts` (`ipad-webkit` and `ipad-webkit-landscape` using the iPad Pro 11 descriptor plus a `webServer`), `tests/e2e/shell.spec.ts`.

| Evidence | Observed result |
|---|---|
| Unit tests | `npx vitest run`: 11 files / 133 tests passed (node + jsdom projects) |
| Typecheck | `npm run typecheck`: exit 0 |
| Build | `npx vite build`: exit 0; app 15.75 kB, harness 10.16 kB, app CSS 1.05 kB |
| E2E portrait | `npx playwright test --project=ipad-webkit`: 5/5 passed — cross-origin isolated true, locked steps disabled, 44pt targets, regular/compact switch, harness reachable |
| E2E landscape | `npx playwright test --project=ipad-webkit-landscape`: 5/5 passed |

Deviations and notes:

- `vite-plugin-solid` HMR breaks Vitest (`file:///@solid-refresh`), so the plugin runs with `hot: !process.env.VITEST`.
- `scripts/serve-dist.mjs` must use `fileURLToPath`: the repository path contains a space, which `URL.pathname` encodes as `%20`.
- `@playwright/test` is pinned to 1.55.0 to reuse the already-installed WebKit build; 1.63 requires a newer browser revision and a fresh download.
- Installing `@types/node` made an `@ts-expect-error` in `src/engine/stream-loader.test.ts` unused; it was removed.
- New dev dependencies: solid-js, vite-plugin-solid, jsdom, @solidjs/testing-library, @testing-library/jest-dom, @types/node, @playwright/test.
- Playwright artifacts (`test-results/`, `playwright-report/`) added to `.gitignore`.

## Slice 1b — Localization, theme, and adaptive tiers (Codex, 2026-09-15)

Status: done in Standard mode (`strict_tdd: false`). Tasks 2.1–2.5 are complete; human calibration task 2.6 remains open.

- 2.1: Added typed English and Spanish dictionaries through `@solid-primitives/i18n`, a lazy Spanish chunk, stored-preference/browser-language fallback, dictionary parity checks, and locale-aware number formatting.
- 2.2: Added system/light/dark persistence, an inline first-paint bootstrap in `index.html`, live system-theme response, and token-backed shell colors.
- 2.3: Added UA-independent WebGL2/texture/core/WebGPU/pointer/viewport/crash signals, provisional Full eligibility, tier budgets, and thread selection that remains independently probe-gated.
- 2.4: Wired Language, Appearance, and Performance selectors through `AppProvider`; all current shell labels, errors, and accessibility text translate live while the raw engine state remains in a code element.
- 2.5: Extended component and WebKit coverage for ES reload persistence, live error translation, first-paint dark mode, forced Full fallback, and 44×44 controls in portrait and landscape.

### Work Unit Evidence

| Evidence | Observed result |
|---|---|
| Focused test | `npm.cmd exec -- vitest run src/i18n src/app/tier src/app/theme.test.ts src/app/app.test.tsx`: exit 0, 4 files / 22 tests passed. |
| Regression test | `npm.cmd test`: exit 0, 14 files / 152 tests passed. |
| Typecheck and build | `npm.cmd run typecheck`: exit 0. `npm.cmd run build`: exit 0; Spanish emitted as a separate `es-*.js` chunk. |
| Runtime harness | Start `node scripts/serve-dist.mjs 4175`, then `npm.cmd exec -- playwright test tests/e2e/shell.spec.ts`: exit 0, 16/16 passed across `ipad-webkit` portrait and `ipad-webkit-landscape`; real HTTP isolation headers remained active. |
| Rollback boundary | Revert `src/i18n/**`, `src/app/theme*`, `src/app/tier/**`, the preference wiring/styles/tests in `src/app/**`, `index.html`, the i18n dependency/lockfile, and the added shell E2E scenarios. Slice 1a shell behavior remains intact. |

- Authored implementation/test/config count: 577 additions + deletions, excluding the generated lockfile, within the standing ≤800-line single-PR rule. The OpenSpec checkbox/progress edits are audit artifacts outside that implementation count.
- Delivery boundary: auto-chain, stacked-to-main PR 1b; one cohesive preference/adaptive-shell work unit. No commit, branch, push, deployment, or remote operation was performed.
- Deviations: none from the design or app-shell contract. The Full thresholds remain explicitly provisional and require task 2.6 physical-device calibration.
- Harness note: when Playwright owns the Windows child server in this sandbox, all tests finish but child teardown can hang. Starting the same repository server explicitly makes Playwright reuse it and exit cleanly; the final recorded run used that equivalent real-header path and returned exit 0.

## Slice 2 — Offline catalog foundation partial (Codex, 2026-09-15)

Status: partial in Standard mode (`strict_tdd: false`). Tasks 3.1 and 3.6 are complete. Tasks 3.2–3.5 and 3.7 remain open because the authorized offline cache has vendor indexes for all six vendors but preset payloads only for Creality and Custom common bases; no unverified vendor profile or six-vendor coverage was fabricated.

- 3.1: Replaced the hardcoded resolver with `scripts/catalog/resolve.mjs`. It resolves inheritance from pinned vendor indexes, fails closed when a payload is absent, separates compatibility metadata from native settings, and retains a CLI that regenerates the legacy Ender-3 V2 profile from the local cache.
- 3.3/3.5 foundation only: Added deterministic, smoke-result-gated pack/index construction and a fast schema/reference/hash verifier. They are intentionally not connected to release build output and no `public/catalog/**` was emitted, so these tasks remain unchecked.
- 3.4 foundation only: `scripts/slice-check.mjs --pack` accepts a flat profile or schema-1 printer pack and refuses combinations not present in the pack's smoke-gated combo list. The catalog-wide smoke runner is not implemented, so this task remains unchecked.
- 3.6: Added typed index/pack formats, index-only search, lazy selected-pack fetch, byte count and SHA-256 verification before JSON parsing, schema checks, cache eviction on corruption, combo enforcement, and deterministic machine → process → filament → settings-id merge.
- Missing local evidence: BBL, Prusa, Elegoo, Anycubic, and Voron machine/process/filament preset payloads; Creality PETG/ABS payloads; shared generic filament payloads needed to resolve Voron's empty vendor filament list; compatibility-condition curation evidence; catalog-wide smoke results.
- Authorized continuation: populate the pinned v2.4.2 preset cache through a separately authorized acquisition step, review explicit curation/condition-only exceptions, then implement 3.2–3.5, run every combo through the real st engine, emit only passing packs, and complete 3.7. Existing scripts fail closed until that evidence exists.

### Work Unit Evidence

| Evidence | Observed result |
|---|---|
| Threat-matrix RED | Before production clients existed, `npm.cmd exec -- vitest run scripts/catalog src/catalog` exited 1: both resolver and pack-client imports were missing. SHA mismatch, truncated JSON, and unknown schema were explicit RED cases. |
| Focused tests | Final `npm.cmd exec -- vitest run scripts/catalog src/catalog`: exit 0, 3 files / 9 tests passed. Coverage includes offline inheritance, metadata separation, deterministic packs, required-model gaps, verifier corruption, lazy index search, merge order, SHA mismatch, truncation, and unknown schema. |
| Regression | `npm.cmd test`: exit 0, 17 files / 161 tests passed. `npm.cmd run typecheck`: exit 0. `npm.cmd exec -- vite build`: exit 0. |
| Runtime harness | Built one explicitly non-release Creality pack under ignored `.engine-cache/catalog-partial`, then `node scripts/catalog/verify-catalog.mjs .engine-cache/catalog-partial/index.json`: exit 0, 1 pack verified. `node scripts/slice-check.mjs --pack <generated-pack>`: exit 0; 20 mm cube, 292,768 G-code bytes, 100 layers, 3,271 ms, 256 MiB heap, expected 220 °C nozzle and 60 °C bed commands. This proves the real pinned local st engine path, not six-vendor release coverage. |
| Rollback boundary | Restore `scripts/resolve-profile.mjs`; remove `scripts/catalog/**` and `src/catalog/**`; revert only the catalog options in `scripts/slice-check.mjs`, Vitest include, README references, task 3.1/3.6 checkboxes, and this progress section. Slice 1 remains untouched. |

- Authored implementation/test/config/documentation count before OpenSpec audit edits: 586 additions + deletions, excluding ignored runtime fixtures and generated build output; within the standing ≤800-line one-PR rule.
- Delivery boundary: auto-chain, stacked-to-main PR 2 partial. The partial is safely committable as a fail-closed catalog foundation, but it MUST NOT be represented as the curated six-vendor catalog or wired into release build verification yet.
- Deviations: no design behavior was weakened. Release generation was deliberately withheld rather than inventing missing vendor payloads or claiming smoke evidence that cannot be produced offline.

## Slice 2 — Curated catalog completion (Codex, 2026-09-15)

Status: done in Standard mode (`strict_tdd: false`). Tasks 3.2–3.5 and 3.7 complete; prior tasks 3.1 and 3.6 remain intact. This successor work unit completes PR2 without committing, pushing, deploying, or using credentials.

- Pinned the acquisition source to official `SoftFever/OrcaSlicer` tag `v2.4.2`, commit `8500fcdccaa10b5099ac20d252af3a7c560046f1`. `catalog.presets.lock.json` records byte counts and SHA-256 for 99 referenced vendor indexes, presets, and inheritance parents; acquisition downloaded no repository archive or unrelated payload tree.
- Curated one required 0.4 mm model per BBL, Prusa, Creality, Elegoo, Anycubic, and Voron, each with Fine/Standard/Draft and Generic PLA/PETG/ABS. BBL uses X1 Carbon and Anycubic uses Kobra 2 because upstream compatibility metadata rejects the initially considered A1-mini ABS and Kobra-2-Pro generic material sets.
- Voron's upstream filament list is empty, so its BBL generic base filaments carry explicit condition-only rationale and remain gated by real smoke tests. The custom base uses generic common machine/process data and is labeled by the contract as a base, not a certification of user-created instances.
- The builder emits deterministic hashed schema-1 packs, a six-vendor index, embedded source/smoke lineage, and `custom-base.json`. The fast verifier checks hashes, references, acquisition lock identity, six-vendor coverage, all three material types and ladder rungs, custom base, and smoke lineage.
- Real smoke discovered two required fixups rather than masking failures: BBL requires `Textured PEI Plate` for PETG/ABS, and the relative-extrusion custom base requires `G92 E0` before each layer. After applying them, every curated combination passed.

### Work Unit Evidence

| Evidence | Observed result |
|---|---|
| Acquisition provenance | `node scripts/catalog/fetch-presets.mjs`: 99 pinned profile records acquired from `v2.4.2` commit `8500fcdccaa1`; `npm.cmd run catalog:verify-presets`: 99/99 byte/hash records verified. |
| Focused tests | `npm.cmd exec -- vitest run scripts/catalog src/catalog`: exit 0, 3 files / 11 tests passed, including deterministic/custom builds, corruption failures, index-only search, and selected-pack-only fetching. |
| Runtime harness | `node scripts/catalog/smoke-catalog.mjs`: exit 0, 63/63 20 mm cube combinations passed through the real locally pinned `wasm-v2.4.2-patch19` ST engine. Engine JS/WASM hashes are checked before slicing. |
| Release verification | `npm.cmd run catalog:verify`: exit 0, 6 printer packs and 63 smoke-gated combinations verified. `dist/catalog/**` contains the same index, custom base, and six hashed packs after build. |
| Full regression | `npm.cmd test`: 17 files / 163 tests passed. `npm.cmd run typecheck`: exit 0. `npm.cmd run build`: exit 0, including fast catalog verification in `prebuild`. |
| Rollback boundary | Remove `catalog.config.json`, `catalog.presets.lock.json`, generated `public/catalog/**`, `scripts/catalog/{fetch-presets,smoke-catalog,verify-presets}.mjs`; revert catalog builder/verifier/package/test/docs edits and these five task checkboxes. Keep committed 3.1 resolver and 3.6 clients unchanged. |

- Delivery boundary: auto-chain, stacked-to-main PR2 completion on top of commit `2558ac9`. Authored implementation/test/config/docs remain below the 800-line standing limit; generated catalog JSON and the generated provenance lock are excluded from authored count but included in the delivered snapshot.
- Deviations: selected compatible models changed from the first local candidates based on upstream evidence; this stays within the designed curated-subset scope. No compatibility expression evaluator was added.
- Remaining PR2 work: none. Parent should perform independent SDD verification before any commit or push.

## Slice 3a — Settings domain and preset storage (Codex, 2026-09-15)

- Status: success; Standard mode (`strict_tdd: false`); tasks 4.1–4.7 complete.
- Added the OrcaSlicer 2.4.2-pinned settings schema, native codec, resolved-preset merge/reset, bed/adhesion virtual controls, cross-field validation, and a quality ladder that exposes only shipped smoke-tested combinations.
- Added IndexedDB `ipad-slicer` v1 with `presets`, `printers`, and `ui` stores; pure v0→v1 override migration; atomic preset activation; and hardened JSON transfer with a 1 MB cap, null-prototype objects, prototype-key/macro defenses, regenerated ids, allow-list notices, fatal obsolete-key rejection, and compatibility/validation gates.
- The application opens the production database schema on mount. The WebKit fixture uses browser IndexedDB directly after this initialization, with no test-only controls or globals in production code.

### Work Unit Evidence

| Evidence | Observed result |
|---|---|
| Threat-matrix RED | Before production modules existed, `npm.cmd exec -- vitest run src/settings src/storage` failed both suites on missing settings/storage imports. The import suite already enumerated malformed JSON, >1 MB, format/version, prototype keys, oversized strings, obsolete keys, unknown-key notices, regenerated ids, unavailable dependencies, and validation-before-write cases. |
| Focused test | `npm.cmd exec -- vitest run src/settings src/storage`: exit 0; 2 files / 20 tests passed. |
| Runtime harness | With `node scripts/serve-dist.mjs 4175` serving the production build, `npm.cmd exec -- playwright test tests/e2e/shell.spec.ts --project=ipad-webkit --grep "IndexedDB presets"`: exit 0; 1/1 passed. It created a preset and custom printer on the app-created v1 schema, reloaded, restored both, and completed a JSON round trip. |
| Full regression | `npm.cmd test`: exit 0; 19 files / 183 tests passed. `npm.cmd run typecheck`: exit 0. `npm.cmd run build`: exit 0, including cached engine and six-pack/63-combination catalog verification. Full `shell.spec.ts`: exit 0; 18/18 WebKit portrait/landscape scenarios passed. |
| Rollback boundary | Remove `src/settings/**` and `src/storage/**`; revert only the settings labels, the database initialization in `AppProvider`, the IndexedDB scenario in `tests/e2e/shell.spec.ts`, these seven checkboxes, and this progress section. Catalog and prior shell/i18n behavior remain intact. |

- Delivery boundary: auto-chain, stacked-to-main PR3a on top of the completed PR2 work; 666 authored implementation/test/task-check lines before this SDD record (687 including this record), within the standing 800-line limit.
- Design resolution: the requirements/tasks override the older design shorthand that proposed synthesizing missing quality rungs; absent smoke-tested rungs remain unavailable. Native IndexedDB wrappers are used instead of adding the `idb` package because this authorized unit prohibited installs; the designed database name, version, stores, migration, and transaction semantics are unchanged.
- Issues/handoff: no catalog contract was weakened. PR3b may consume the exported schema, validators, repository, and transfer functions; it must provide the selected printer/material safety context when validating a merged profile.

## Slice 3b — Simple and Advanced Configuration UI (Codex, 2026-09-15)

- Status: success; Standard mode (`strict_tdd: false`); tasks 5.1–5.7 complete.
- Added props-only lazy catalog pickers, the bounded nine-entry Simple surface, five-category Advanced panels with shared overrides/reset, custom-printer and preset-transfer forms, and complete EN/ES UI/error/accessibility copy.
- Wired catalog/settings state through `AppProvider`: printer and filament changes invalidate incompatible downstream choices, mode switches preserve overrides, custom printers retain the tested generic base identity while being labeled not individually smoke-tested, and Slice stays disabled for missing models/profiles or client validation errors.
- Support and brim wording is explicitly plate-wide; per-object controls remain hidden pending the Phase 7.1 engine contract check.

### Work Unit Evidence

| Evidence | Observed result |
|---|---|
| Focused test | `npm.cmd exec -- vitest run src/settings/configuration-ui.test.tsx src/i18n/i18n.test.ts src/app/app.test.tsx`: exit 0; 3 files / 14 tests passed. It proves props-only loading, unavailable quality rungs, nine expanded Simple entries, preserved advanced overrides, localized parity, and Slice guards. |
| Runtime harness | `npm.cmd exec -- playwright test tests/e2e/shell.spec.ts`: exit 0; 22/22 real WebKit scenarios passed across portrait and landscape. The run covers EN/ES 44×44 targets, the nine-entry surface, invalid import retention, safe-bound rejection, and invalid/valid custom printers with the untested label. |
| Full regression | `npm.cmd test`: exit 0; 20 files / 186 tests passed. `npm.cmd run typecheck`: exit 0. `npm.cmd run build`: exit 0, including cached engine fetch and six-pack/63-combination catalog verification. |
| Rollback boundary | Remove `src/catalog/components/**`, `src/settings/components/**`, `src/settings/configuration-ui.test.tsx`, `src/app/ConfigurationContainer.tsx`, and `src/app/stores/configuration.ts`; revert only the App/AppProvider/store export, configuration CSS, EN/ES configuration copy, E2E additions, these seven checkboxes, and this progress section. PR3a settings/storage and PR2 catalog artifacts remain intact. |

- Delivery boundary: auto-chain, stacked-to-main PR3b on top of PR3a. The complete authored snapshot is 570 changed lines including tasks and this progress record, within the standing 800-line limit.
- Deviations: none. The requirements/tasks control the bounded Simple count and unavailable quality behavior; no untested rung is synthesized.
- Issues/handoff: estimates and orient/arrange remain visible placeholders for later planned slices. The custom printer generic base is smoke-tested, but each user overlay is deliberately labeled as not individually smoke-tested.

## Independent Audit of Slices 1b–3b (Claude, 2026-09-16)

Status: done. Everything Codex delivered autonomously between the 1a handoff and 3b (commits `ec5dfeb`, `2558ac9`, `6091536`, `0a16c1f`, `6c620ea`) was reviewed for the first time here — two parallel read-only audits plus Claude's own re-runs, not a re-statement of Codex's own claims.

**i18n / theme / adaptive tiers / catalog pipeline (ec5dfeb, 2558ac9, 6091536):** all 8 audited areas CONFIRMED OK. No user-agent sniffing anywhere in the tier logic; `probeThreading()` stays fully independent of the tier decision; the catalog resolver is genuinely fail-closed (throws on any integrity gap, never falls back); the smoke gate runs the real Node engine per combination (63/63 reproduced independently); packs are hash-verified before parsing. Two non-blocking notes: an unused `decideThreadVariant` helper (expected — its caller lands in PR 5a/5b) and the provisional Full-tier thresholds aren't commented inline (already tracked as open task 2.6).

**Settings, storage and configuration UI (0a16c1f, 6c620ea):** the spec-mandated checks (bounded simple mode, enum/bound validation, obsolete-key rejection, atomic IndexedDB writes, "not certified" custom-printer labeling) all held up under independent re-derivation. One HIGH-severity defect was found and is now fixed:

- **`validationContext(pack)` read the globally-selected filament instead of the filament actually being validated.** Importing a preset — or drafting a custom printer — while no filament was selected in the live UI silently widened the safe nozzle-temperature range to a generic `[150, 320]` fallback, so an out-of-range value (e.g. 300 °C for PLA) could pass validation and get written to IndexedDB undetected. Not caught by the existing test suite, which only ever exercised the "a filament happens to be selected" path.
- **Fix (commit `f55e46d`):** `validationContext` now takes an explicit `filamentId` parameter; the import and custom-printer call sites pass the profile's own filament id (already proven to exist by the `isCompatible` check that runs first), instead of reading live UI state. Also closed an IndexedDB connection leak on the custom-printer save path (missing `try/finally`), the same class of bug the review flagged on the import path.
- **New regression tests:** `src/app/stores/configuration.test.ts` (4 tests), including one that reproduces the exact silent-pass scenario against the old fallback behavior.
- Two LOW-severity, non-blocking notes from the review were left as tracked follow-ups rather than fixed now: a legacy `first_layer_height` key can be silently dropped (not applied, just discarded with no user-visible notice) if an import declares a self-reported `schemaVersion` that lies about being current; and the Simple-mode time/filament/cost readout is a documented placeholder until the slicing pipeline lands in PR 5a.

| Evidence | Observed result |
|---|---|
| Full suite (after the fix) | `npx vitest run`: 21 files / 190 tests passed (186 + 4 new) |
| Typecheck / build | `npm run typecheck` exit 0; `npx vite build` exit 0 |
| E2E | `npx playwright test --project=ipad-webkit` and `--project=ipad-webkit-landscape`: 11/11 passed on both, using the already-installed WebKit build |
| `npm audit` | 0 vulnerabilities (was 2 high, dev-only Playwright SSL-verification advisory GHSA-7mvr-c777-76hp; patched by bumping to `@playwright/test@1.55.1`, same pinned browser revision — commit `f3bf33b`) |

Both fix commits were scanned for personal data before pushing (clean) and are now on `origin/main` at `f3bf33b`.

## Phase 6 — Touch Model Workspace, partial (Lorenzo with Codex directly, audited by Claude, 2026-09-16)

Status: **partial**. This work was done directly by Lorenzo using Codex outside the sdd-apply flow (commits `3b87dd8`, `7004b41`, `07c46b5`, `bb15f4f`) and was never reconciled into these artifacts — the runtime attempt for `pr4a-touch-model-workspace` (ordinal 8) stayed open with `changed_lines: 0` recorded despite the work existing in the tree. This section is Claude's independent audit (re-derived from diffs, greps and re-run commands, not a restatement of prior claims), used to reconcile `tasks.md` and settle that attempt.

Of tasks 6.1–6.7: **6.1, 6.2, 6.4, 6.5 are complete**; **6.3 and 6.6 were not started**; **6.7 is partial**.

- 6.1 `mesh.worker.ts`/`stl-parse.ts`: real Worker STL parsing via `STLLoader`, zero-copy transfer of positions/normals/bounds, validated shape/type/finiteness, main-thread synchronous fallback on any worker failure. 2 tests.
- 6.2 `scene.ts`/`renderer.ts`/`bed.ts`: Z-up mm, bed geometry from `printable_area`/`printable_height`, dirty-flag demand rendering (not constant RAF), tier-gated DPR/AA (Standard 1.5 DPR/no AA/no WebGPU, Full 2 DPR/AA/WebGPU opt-in with try/catch fallback to WebGL2). Matches design.md §7/§8.
- 6.4 `gizmo.ts`/`transforms.ts`: correctly scaffolded behind an abstract adapter — `ObjectTransform` is explicitly app-internal, not the engine's stride-11 encoding, with rotation/order/origin conversion deferred to task 7.1 as designed. Selected-object gesture ownership, cumulative-since-begin deltas (immune to mid-gesture store mutation), bed-drop, per-mode isolation. 6 tests, including isolation and cumulative-delta cases.
- 6.5 `TransformToolbar`/`ScaleSheet`/`ViewerToolbarContainer`: rotate 90° X/Y, mm/in/% scaling, duplicate/delete/reset, lay-flat correctly `disabled` pending engine integration (not silently missing). 6 tests: selected-only edits, unit switch preserves physical size, suspicious-size prompts (both directions, all four correction actions), fixed % baseline.
- **6.3 `camera.ts`/`gestures.ts`: not started.** Neither file exists. `camera-controls@2.10.1` was added to `package.json` but is never imported anywhere — only referenced in two forward-reference doc comments (`gizmo.ts`, `scene.ts`); `gizmo.ts`'s own docstring says gestures.ts "must check this before handing a pointer... to camera-controls," documenting that it didn't happen.
- **6.6 wiring through `AppProvider.tsx`/plate store: not started.** `createViewer()` and `importStlFile()` are never called outside their own definitions/tests; no `<input type="file" accept=".stl">` exists anywhere; the production build ships a 65.84 kB gzip app bundle with no three.js in any chunk — the entire `src/viewer/**` tree is unreferenced and tree-shaken out. Object/triangle-limit enforcement does not exist. `scene.ts`'s `dispose()` cleanup is correctly written but currently unreachable.
- 6.7 partial: Vitest ran and passes (16/16 focused), but `tests/e2e/shell.spec.ts` is byte-for-byte unchanged from before these commits — zero new import/selection/camera/unit scenarios. Given 6.3/6.6 aren't started, meaningful viewer e2e coverage isn't achievable yet.

### Work Unit Evidence

| Evidence | Observed result |
|---|---|
| Focused test | `npm.cmd exec -- vitest run src/viewer`: exit 0, 4 files / 16 tests passed. |
| Full regression | `npm.cmd test`: exit 0, 25 files / 206 tests passed (benign jsdom `getContext` warning; no canvas rendering exercised). |
| Typecheck / build | `npm.cmd run typecheck`: exit 0. `npm.cmd run build`: exit 0; engine cache hit; catalog verify 6 packs/63 combos OK; app bundle 65.84 kB gzip with no three.js present, corroborating 6.6 not started. |
| E2E portrait/landscape | `npm.cmd exec -- playwright test tests/e2e/shell.spec.ts --project=ipad-webkit` and `--project=ipad-webkit-landscape`: 11/11 passed on both — all pre-existing shell/i18n/theme/settings scenarios, none viewer-related. |
| Rollback boundary | Remove `src/viewer/**`, the `camera-controls` dependency line, and revert only checkboxes 6.1/6.2/6.4/6.5 and this section. Prior slices (1a–3b) are untouched; nothing else references the viewer tree yet. |

- Authored line count across the 4 commits (excluding `package-lock.json` churn): 1,125 insertions + 1 deletion (426+184+157+357+1), **exceeding the standing ≤800-line one-PR rule** with no PR split performed — a process deviation independent of the functional gaps above.
- Deviations/concerns: `renderer.ts` line 8 carries a false comment claiming WebKit e2e coverage of renderer construction that does not exist (`createRenderer()`/`createViewer()` have zero coverage of any kind) — should be corrected. `camera-controls` is a dead dependency. `rotate90()`'s quaternion composition is wired into the UI but has no test asserting the resulting Euler angles. No shortcuts, missing error handling, or incorrect disposal logic found in the parts that do exist.
- Handoff: 6.3 (camera/gestures), 6.6 (app/plate wiring), and the e2e half of 6.7 remain open. Until 6.6 lands, none of the model-workspace spec scenarios (add/invalid STL, navigate without moving models, edit only selected object, preserve physical size across unit conversion) are reachable by an actual user — they're only proven at the isolated unit-test level.

## Slice 4a completion — Camera and production viewer wiring (Codex, 2026-09-16)

- Status: success; Standard mode (`strict_tdd: false`); tasks 6.3, 6.6, and 6.7 complete.
- Wired `camera-controls` with Z-up orbit/dolly/truck mappings, touch mappings, double-tap fit, tap thresholds, and a capture-phase ownership gate that prevents camera-controls from receiving selected-object gizmo pointers. Tests prove normalized pointer math and that camera gestures never mutate plate transforms.
- Added the real app-shell STL picker and model workspace. Imports use the worker/fallback parser, preserve the existing plate on errors, enforce the active tier's aggregate object/triangle budgets, retain source blobs and CPU typed arrays, and keep selection plus toolbar transforms reachable.
- Mounted and synchronized `createViewer()` from `AppProvider`; removed objects release geometry/material/source storage, while unmount disposes gestures, camera controls, renderer, resize observer, and the WebGL context. The production app bundle now contains the viewer/three.js path.
- Added real WebKit import, invalid-import retention, independent selection, camera-navigation isolation, and unit-conversion scenarios. Engine transform encoding remains explicitly deferred to task 7.1.

### Work Unit Evidence

| Evidence | Observed result |
|---|---|
| Focused test | `npm.cmd exec -- vitest run src/viewer`: exit 0; 6 files / 22 tests passed. |
| Full regression | `npm.cmd test`: exit 0; 27 files / 213 tests passed. jsdom printed three expected unimplemented-canvas warnings; no test failed. |
| Typecheck | `npm.cmd run typecheck`: exit 0. |
| Production build | `npm.cmd run build`: exit 0; engine cache hits, 6 packs / 63 combinations verified, 73 modules transformed. The app bundle is 838.19 kB / 219.71 kB gzip and `mesh.worker` is 105.09 kB, replacing the prior viewer-free 65.84 kB gzip bundle. Vite emitted only its chunk-size warning. |
| Runtime harness | `node scripts/serve-dist.mjs 4175` served `http://127.0.0.1:4175/`; `npm.cmd exec -- playwright test tests/e2e/shell.spec.ts --project=ipad-webkit`: exit 0, 14/14 passed; `npm.cmd exec -- playwright test tests/e2e/shell.spec.ts --project=ipad-webkit-landscape`: exit 0, 14/14 passed. The server was stopped afterward. |
| Rollback boundary | Remove `src/viewer/{camera,gestures,ViewerWorkspace,plate-import}*` and `workspace.css`; revert only the renderer/scene disposal and raycast additions, the AppProvider/app-test wiring, the three shell E2E scenarios, task checkboxes 6.3/6.6/6.7, and this section. Keep the previously audited Phase 6 foundation unchanged. |

- Delivery boundary: auto-chain, stacked-to-main work unit `pr4a-remaining-camera-wiring`. Authored implementation, tests, task check lines, and this progress record total **487 changed lines**, below the standing 800-line limit; lockfiles/generated files are excluded.
- Deviations: the workspace uses a calibrated 220×220×250 mm placeholder bed until printer selection supplies bed settings to this slice; tier budgets, import safety, viewer reachability, and disposal behavior match the assigned contract. No engine stride-11 conversion or engine-facing rotation/origin claim was added.
- Issues/handoff: Vite reports the expected large app chunk now that three.js is reachable. Task 7.1 must still pin engine rotation units, Euler order, offset origin, and stride-11 encoding before engine-facing transforms are enabled.

## Slice 4b partial - Empirical engine contract and protocol boundary (Codex, 2026-09-16)

- Status: **partial**; Standard mode (`strict_tdd: false`); tasks 7.1, 7.2, 7.5, and 7.7 complete. Tasks 7.3, 7.4, 7.6, and 7.8 remain unchecked.
- 7.1: Added `scripts/engine-contract-check.mjs`, which loads the real pinned `wasm-v2.4.2-patch19` ST module and slices a concave L-prism with unequal X/Y/Z extents. Assertions cover stride ordering, scale, mirror direction, rotation units/order, finite and automatic offsets, invalid mixed offsets, two concatenated `[start,end]` STL ranges, preparation JSON, and statistics.
- 7.2: Extended the plain-ESM bridge with heap-safe `sliceStlMulti`, `preparePlate`, `getLastStatistics`, and `cancel` wrappers. Every allocation is followed by a fresh `HEAPU8.set`; output ranges are copied before engine/free cleanup. Protocol v2 now guards config, mesh/generation, multi-slice, preparation, statistics, cancel, result, and request-error envelopes while retaining legacy `init`/`slice` compatibility.
- 7.5: Completed the single Three XYZ <-> engine ZYX adapter, mirror conversion, and stride-11 encoder with quaternion round-trip and paired-NaN fixtures.
- 7.7: The contract check verifies the pinned header exposes only per-object extruder ids plus transforms. There is no per-object configuration argument, so existing brim/support controls remain honestly plate-wide and no settings UI was changed.

### Discovered pinned engine contract

- Transform rows are exactly `scale[3], rotation[3], mirror[3], offsetXY[2]` (`Float32`, stride 11); mirrors use `+1/-1`.
- Rotation values are **radians** in **intrinsic ZYX Euler order**. A `pi/2` Z probe swaps the unequal footprint axes; literal `90` produces a different footprint (proves radians, order-independent). The two three-axis probes (`mixed`, `orderProbe`) sit on a ZYX gimbal-lock singularity (middle angle = 90°): `orderProbe` alone only narrows six orders to a tied pair (intrinsic-XYZ and intrinsic-ZYX coincide there), and `mixed`'s square-footprint result — which breaks that specific tie in ZYX's favor — is a property of that singularity, not a generic-angle argument. An independent audit re-derived this by hand (all six orders applied to the same prism vertices via three.js's own Euler math) and confirmed both the tie and that `mixed` breaks it correctly toward ZYX, so the conclusion holds; a follow-up with non-90°, non-tied generic angles would make the proof itself robust rather than relying on that coincidence. A first attempt at such a generic-angle probe hit an unrelated real-engine slicing discrepancy (predicted vs. measured footprint mismatch at oblique tilts, likely a perimeter/wall-offset effect not accounted for by a raw vertex-bounding-box prediction) and was reverted rather than shipped half-understood — left as an open follow-up, not blocking, since the conclusion is already independently confirmed.
- Finite offsets are XY deltas from the engine's centered placement, matching the viewer's centered bed coordinates. `[60,70]` shifts the measured G-code bounds by exactly `[60,70]`. `NaN/NaN` auto-places both axes; one finite plus one NaN is rejected by the engine.
- `preparePlate` returns an array of `{scale:[3], rotation:[3], mirror:[3], offset:null|[x,y]}`. Auto-orient may return `offset:null`; arrange returns finite offsets.
- Statistics are schema `0.2`. The two-object real slice emits both objects from the concatenated blob. Per-object brim/support configuration is unsupported by this API.

### Work Unit Evidence

| Evidence | Observed result |
|---|---|
| Focused test | `npm.cmd exec -- vitest run src/worker src/engine src/viewer`: exit 0; 11 files / 99 tests passed. Protocol invalid-message/result-envelope cases and transform conversion fixtures are included. |
| Runtime harness | `node scripts/engine-contract-check.mjs`: exit 0 against the real pinned ST engine. Output reported stride 11, radians/intrinsic ZYX, centered-delta offsets, paired-NaN auto-placement, preparation JSON shape, schema 0.2 statistics, two-object ranges PASS, and per-object config unsupported. Concrete bounds: auto `[[113.25,142.75],[115.75,139.176]]`; `[60,70]` offset `[[173.25,202.75],[185.75,209.176]]`; order probe `[[129.011,136.989],[116.511,139.489]]`. |
| Full regression | `npm.cmd test`: exit 0; 28 files / 219 tests passed (three expected jsdom canvas warnings). `npm.cmd run typecheck`: exit 0. `npm.cmd run build`: exit 0; engine cache hits, 6 packs / 63 combinations verified, 73 modules transformed; only the existing Vite chunk-size warning. |
| E2E boundary | No preparation UI was unlocked because 7.3/7.4/7.6 are not implemented, so no new `shell.spec.ts` scenario was added or claimed. Task 7.8 remains unchecked. |
| Rollback boundary | Remove `scripts/engine-contract-check.mjs` and `src/viewer/transforms.test.ts`; revert the bridge declarations/implementation, protocol/tests, the small worker unsupported-v2 envelope branch, transform adapter/comment, these four task checkboxes, and this section. Phase 6 viewer behavior and all settled catalog/settings code remain intact. |

- Delivery boundary: auto-chain, stacked-to-main partial PR4b work unit on top of `8152fc9`. The authored snapshot is **483 additions/deletions** including implementation, tests, four checkbox replacements, and this progress section; generated/cache/lock files are excluded. This is within the acquired 800-line limit.
- Deviations: the phase was intentionally stopped at the first cohesive dependency boundary rather than rushing worker lifecycle code. `engine.worker.ts` validates v2 messages but returns a typed not-initialized request error until 7.3/7.4 add mesh/session ownership. No orient/arrange UI was enabled, so the gated contract is not exposed prematurely.
- Remaining: 7.3 mesh cache/generation client; 7.4 config-hash session lifecycle and heap/leak assertions; 7.6 atomic orient/arrange wiring; 7.8 client/session tests and real WebKit success/failure preparation scenarios. Parent should independently re-run the contract check before continuing.

## Slice 4b completion - Mesh cache, config sessions, and atomic preparation (Codex, 2026-09-16)

- Status: **success**; Standard mode (`strict_tdd: false`); tasks 7.3, 7.4, 7.6, and 7.8 complete. This finishes the assigned `pr4b-mesh-cache-orient-arrange` work unit without adding Phase 8 slice/result UI.
- Added a main-thread `EngineClient` that lazily owns one module worker, hashes native configuration, correlates typed requests, uploads structured-cloned source Blobs once per worker generation, re-sends them after restart, and explicitly releases worker cache entries when the viewer releases an object. Missing source ids fail before preparation.
- Replaced the worker's v2 placeholder with Blob cache/generation validation, per-operation Blob reads, bridge-backed multi-slice/preparation/statistics calls, typed request errors, and one initialized session per config hash. A new hash creates and initializes its session before the old session is destroyed; the legacy harness session remains separate and its v1 messages remain intact.
- Wired Lay flat (auto-orient) and the existing Orient and arrange action to the real preparation call. Arrange submits paired-NaN offsets so the engine is allowed to place objects; returned transforms are converted through the pinned ZYX adapter and committed to the plate store in one atomic map update. Errors become visible without mutating any transform.
- Extended the real-engine contract harness with same-hash reuse, changed-hash replacement order, init-once-per-live-session, override isolation, and eight repeated configuration changes. Heap remained fixed at 268,435,456 bytes for all eight samples.

### Work Unit Evidence

| Evidence | Observed result |
|---|---|
| Focused test | `npm.cmd exec -- vitest run src/worker src/engine src/viewer`: exit 0; 13 files / 104 tests passed. Worker-cache coverage directly asserts missing/stale ids, generation eviction and release cleanup; client coverage adds per-generation re-upload/restart and typed preparation failure. |
| Full regression | `npm.cmd test`: exit 0; 30 files / 224 tests passed, above the prior 219/219 baseline (the same three expected jsdom canvas warnings). `npm.cmd run typecheck`: exit 0. |
| Production build | `npm.cmd run build`: exit 0; cached ST/MT engine artifacts, 6 packs / 63 combinations verified, 74 modules transformed; only the existing Vite chunk-size warning. |
| Real engine contract | `node scripts/engine-contract-check.mjs`: exit 0. Existing transform, paired-NaN, mixed-offset rejection, two-object, preparation, statistics, and per-object-capability assertions remained active; new session-policy checks passed with eight identical 268,435,456-byte heap samples. |
| Runtime harness | `node scripts/serve-dist.mjs 4175`; `npm.cmd exec -- playwright test tests/e2e/shell.spec.ts --project=ipad-webkit`: 16/16 passed; `--project=ipad-webkit-landscape`: 16/16 passed. Both projects exercised a real two-object arrange with changed store/viewer transforms and an intercepted engine-load failure that preserved both prior transforms. Server stopped afterward. |
| Rollback boundary | Remove `src/engine/client.ts` and its test; revert the v2 worker/cache/session implementation and release message, preparation wiring in `gizmo.ts`, viewer/configuration toolbar hooks and labels, contract/E2E additions, these four checkboxes, and this section. The preceding empirical ABI/bridge/protocol work and all Phase 6 viewer behavior remain intact. |

- Delivery boundary: auto-chain, stacked-to-main work unit `pr4b-mesh-cache-orient-arrange` on top of commit `c46859f`. Authored line count is **466 additions/deletions**, excluding generated build output, lockfiles, and unrelated pre-existing `.claude/` content; this is within the 800-line attempt ceiling without compressing implementation or tests.
- Deviations: protocol v2 gained one lifecycle message, `releaseMesh`, because cache cleanup cannot be expressed honestly by the existing upload/operation messages. The configuration action invokes arrange (`2`) while Lay flat invokes auto-orient (`1`); combined bitmask `3` remains accepted by the protocol but is not used by the UI because the real engine rejected that combined current-plate call during WebKit verification.
- Issues/handoff: no Slice step, result UI, estimates, G-code save, cancellation/restart policy, or Phase 8 task was implemented or claimed. The client exposes restart/generation behavior needed by later work, but task 8.4 still owns user-visible mt termination and st latest-wins cancellation.

## Correction — session-hash race in `preparePlate`/`sliceMulti` (Claude, 2026-09-16)

An independent audit of the section above found one real concurrency bug in 7.4, not caught by any existing test: `handleV2`'s `preparePlate`/`sliceMulti` branch in `src/worker/engine.worker.ts` validated `configuredSession`/`configuredHash` against the requested config hash, then re-read those same module-level `let`s *after* `await readMeshes(...)`. Since `configure()` is synchronous and reassigns (and destroys the previous) session as soon as a `'config'` message for a different hash arrives, a concurrent config change landing inside that await window made the in-flight operation silently execute under a *different* request's session — with no error, and in the worst case against an already-destroyed session object. Nothing in the UI disabled Lay flat/Orient-and-arrange while a prepare was pending, so this was reachable from a real double-click, not just a theoretical interleaving.

- **Fix**: capture `configuredSession`/`configuredHash` into local `session`/`hash` bindings immediately after the initial validation, before the `readMeshes` await; re-check `configuredSession === session && configuredHash === hash` immediately after the await, and throw a clean, typed `requestError` if the configuration changed underneath the operation, instead of silently continuing with the wrong (or destroyed) session. `getStatistics` has no await before its session read, so it was not affected.
- **Verification**: `npm.cmd test`: 30 files / 224 tests passed (unchanged). `npm.cmd run typecheck`: exit 0. `npm.cmd run build`: exit 0. `node scripts/engine-contract-check.mjs`: exit 0, same session-policy output as before (`sessions: same-hash=reused; changed-hash=fresh+old-destroyed; init-once=PASS`). `npm.cmd exec -- playwright test tests/e2e/shell.spec.ts` on both `ipad-webkit` and `ipad-webkit-landscape`: 16/16 passed each, including the orient/arrange round trip and the prepare-failure scenario.
- **Known gap, disclosed rather than papered over**: no regression test exercises the actual race (two overlapping `prepare`/`sliceMulti` calls with different config hashes interleaved across the mesh-read await). `engine.worker.ts` has no existing unit-test harness — it is only verified through the real-engine contract check (which never overlaps operations) and WebKit e2e (which is sequential by nature) — and building one now would mean mocking the Worker `self` context and the WASM module from scratch, a separate undertaking. The fix was verified by direct code reading against the exact failure mode described above, not by a new automated repro. Recommended follow-up: either add that harness, or fold an overlap check into a future Phase 8 task once `src/engine/client.ts` grows a real queueing/cancel policy (task 8.4) that would need to reason about the same interleaving anyway.
- Authored line count for this correction: 18 lines (engine.worker.ts) + this note; well within the remaining budget of the `pr4b-mesh-cache-orient-arrange` work unit.

## Slice 5a - Slice pipeline, summaries, and cancellation (Codex, 2026-09-16)

- Status: **success**; Standard mode (`strict_tdd: false`); tasks 8.1-8.7 complete. The app now revalidates the selected flat native configuration at the action boundary, snapshots every current plate transform through the pinned adapter, and always uses protocol-v2 `sliceMulti`.
- Added schema-0.2 statistics plus G-code fallback summaries, layer/effective-config parsing, explicit requested/effective differences, and UI-authoritative filament pricing. Missing values remain unavailable; engine `totalCost` is retained only as diagnostic data.
- Added a result store with attempt ownership, stale/error/canceled states, non-proxied G-code ownership, and unconditional load/slice/heap/variant metric capture. Stale fingerprints include mesh ids as well as transforms/settings, so replacing a model at an identical transform still invalidates the result. The existing worker already captured statistics immediately after `sliceStlMulti` and transferred the result buffer; that path is now consumed end to end.
- Added mt terminate/recreate cancellation and st soft-discard/latest-wins serialization. A delayed fake-worker test proves a canceled response is discarded before the queued newest result is surfaced, and st is never terminated. Build-scoped mt markers reuse `decideThreadVariant`, also drive the existing general tier crash marker, and clear both through explicit retry. Actual worker crashes and mt load failures set sticky fallback; typed `requestError` slice failures do not masquerade as crashes or trigger automatic reslicing.
- Product decision: retained the existing four-step bar and made the already-present Configure `Slice` action the minimal trigger. Adding a fifth navigation step now would duplicate an action state immediately before Preview and expand Phase 9 UI scope; a successful result transitions to the existing Preview pane, which exposes only an honest layer-count result marker for Phase 8 verification.

### Work Unit Evidence

| Evidence | Observed result |
|---|---|
| Focused test | `npm.cmd exec -- vitest run src/slice src/engine src/worker src/app`: exit 0; 12 files / 110 tests passed. Includes schema/fallback/cost, tier-marker lifecycle/probe decisions, worker-crash versus typed-request-error behavior, mesh-identity staleness, delayed st cancel/latest-wins, mt terminate/recreate, app/store and protocol coverage. |
| Full regression | `npm.cmd test`: exit 0; 31 files / 233 tests passed (the expected jsdom canvas warnings). `npm.cmd run typecheck`: exit 0. |
| Production build | `npm.cmd run build`: exit 0; cached ST/MT engines, 6 packs / 63 combinations verified, 79 modules transformed; only the existing Vite chunk-size warning. |
| Real engine contract | `node scripts/engine-contract-check.mjs`: exit 0; stride/radians/ZYX/offset/preparation/statistics/two-object/session-policy checks passed, with eight unchanged 268,435,456-byte heap samples. |
| Pack slice checks | `node scripts/slice-check.mjs --variant st --pack public/catalog/v2.4.2/printers/bbl-x1c-04.4a639ff2.json`: exit 0, 556,632 bytes, 856.22 ms, 256 MiB. `npm.cmd run slice-check:mt -- --pack ...`: exit 0, identical 556,632 bytes, 962.28 ms, 1 GiB fixed heap. |
| Runtime harness | Against the built app through the already-running `node scripts/serve-dist.mjs 4175` real-header server, `npm.cmd exec -- playwright test tests/e2e/shell.spec.ts --project=ipad-webkit`: 18/18 passed; `--project=ipad-webkit-landscape`: 18/18 passed. Both run a real configured import-to-slice round trip and a cancellation scenario that never unlocks stale Save/output. |
| Rollback boundary | Remove `src/slice/**` and `src/app/stores/result.ts`; revert slice queue/marker integration in `src/engine/client*`, the AppProvider/configuration/preview trigger wiring, four new i18n strings, the two E2E scenarios plus broadened failure intercept, these seven checkboxes, and this section. Phase 7 preparation/session behavior remains intact. |

- Delivery boundary: auto-chain, stacked-to-main work unit `pr5a-slice-pipeline` on top of `ec9119b`. Authored line count is **468 additions/deletions**, within the 800-line ceiling; generated output, `.claude/` worktrees, and unrelated pre-existing untracked content are excluded.
- Deviations: no new `Slice` step was added for the product reason above. Full readout polish, user-facing currency selection, Save/download, diagnostics display, and harness removal remain Phase 9; the result summary, currency-bearing cost value, G-code buffer, and metrics are stored now but only the minimal completion marker is displayed.
- Issues/handoff: the pack check reports zero `;LAYER_CHANGE` comments for the selected BBL output even though it slices successfully; the parser intentionally follows the pinned required comment form and reports the observed count rather than inventing layers. Physical iPad cancellation remains a Phase 12 device check.

## Slice 5b partial - Results, Save, and Diagnostics (Codex, 2026-09-16)

- Status: **partial success**; Standard mode (`strict_tdd: false`); tasks 9.1-9.5 complete, tasks 9.6-9.7 deliberately remain open. The preview pane now presents real time, mass, user-priced cost, price/kg and currency, layers, requested/effective differences, unavailable states, and an explicit stale warning. Slicing activity is indeterminate and elapsed-time based; worker readiness exposes the resolved ST/MT variant without inventing percentage progress, and ST soft cancellation remains immediately editable with its finishing-previous-slice notice.
- Save now operates directly on the retained `binaries` result buffer. Web Share receives the exact engine bytes; unavailable, rejected, and canceled sharing all fall back to an exact-byte Blob download. Saving does not clear the buffer and does not derive data from preview state.
- Diagnostics metrics were extracted from the legacy panel. The persisted log now uses `ipad-slicer:log` and imports/removes `ipad-slicer:spike-log` once when the new key is absent. Advanced-only Diagnostics shows isolation, persisted metrics/events, JSON export, and a persisted auto/ST/MT preference; MT is accepted only after the real threading probe passes, then the page reloads. `src/testing/test-model.ts` remains intact.
- The batch stops before 9.6 by design: deleting `profiles/` (419 lines), `src/harness/` (211), `harness.html` (52), and the legacy panel (78), before worker/protocol/build/test cleanup, is already about 760 deleted lines. Combining that deletion with the 395 implementation/test lines in this partial and evidence/docs would exceed the 800-line work-unit ceiling. The harness therefore remains emitted and its expiring reachability test remains unchanged; 9.6 and final 9.7 verification require a follow-up work unit.

### Work Unit Evidence

| Evidence | Observed result |
|---|---|
| Focused test | `npm.cmd exec -- vitest run src/slice src/diagnostics src/instrumentation src/export src/app`: exit 0; 11 files / 79 tests passed. Coverage includes readouts/unavailable/stale states, elapsed indeterminate activity, ST finishing state, exact binary Save and every share fallback, log migration/reload, metrics/export, probe rejection, and persisted variant-before-reload. |
| Full regression | `npm.cmd test`: exit 0; 33 files / 243 tests passed. This is +10 tests from the Phase 8 baseline of 233/233; no harness tests were removed because task 9.6 is deferred. The same three expected jsdom canvas warnings were emitted. `npm.cmd run typecheck`: exit 0. |
| Production build | `npm.cmd run build`: exit 0; cached ST/MT engines, 6 packs / 63 combinations verified, 83 modules transformed; only the existing chunk-size warning. Because 9.6 is deferred, `dist/harness.html` and its harness chunk are still present, explicitly not claimed removed. |
| Real engine contract | `node scripts/engine-contract-check.mjs`: exit 0; transform/rotation/offset/preparation/statistics/two-object/session-policy checks passed with eight unchanged 268,435,456-byte heap samples. |
| Runtime harness | Built app via `node scripts/serve-dist.mjs 4175`. `ipad-webkit`: 18/18 passed, including real slice estimates, exact G-code download trigger, Advanced-only diagnostics absence, and cancel/no stale output. `ipad-webkit-landscape`: after correcting the toolbar pointer overlap, the complete post-fix run passed 18/18, including the real estimates/download and cancel scenarios. |
| Rollback boundary | Remove `src/slice/components/` and `src/diagnostics/`; revert App/AppProvider/ConfigurationContainer wiring, engine readiness callback and variant preference resolution, Save fallback change/tests, log key migration and panel metric import, i18n/CSS/E2E additions, these five checkboxes, and this section. Phase 8 slice/cancel queues and summary core remain intact. |

- Delivery boundary: auto-chain, stacked-to-main work unit `pr5b-results-save-diagnostics` on top of `1b8ff2e`. Authored line count is **427 additions/deletions total** (395 implementation/test + 32 SDD checkbox/evidence lines), within the 800-line ceiling; unrelated pre-existing `index.html`, manifest, title/theme styling, and token changes are excluded.
- Deviations: tasks 9.6-9.7 are intentionally deferred rather than forcing the destructive harness/profile removal past the authorized line budget. Variant preference helpers live in the allowed Phase 9 engine/UI wiring; `src/slice/crash-marker.ts` remains unchanged. `src/instrumentation/panel.ts` temporarily re-exports the migrated metrics so the still-present harness compiles until its follow-up deletion.
- Issues/handoff: perform the required import/reference grep, remove harness/profile/v1 worker paths and Vite input, invert the expiring harness E2E assertion, then run the entire verification matrix again. No preview canvas or offline/PWA work was added.

## Correction — mojibake and two label/state bugs (Claude, 2026-09-16)

An independent audit of the section above confirmed 9.1-9.5 are genuinely complete and correct (no Phase-7-style concurrency issue, real byte-fidelity on Save, real one-time log migration, real Advanced-only diagnostics gating), but found three defects, all now fixed:

- **Encoding**: 5 Spanish strings in `src/i18n/es.ts` (the new `results`/`diagnostics` blocks) were corrupted mid-write (`Diagn?sticos`, `impresi?n`, `volv?`, `est?`, `m?xima` instead of their accented forms). Corrected to `Diagnósticos`, `impresión`, `volvé`, `está`, `máxima`.
- **`SliceActivity` mislabel** (`src/slice/components/SliceResults.tsx`): while actively slicing with a known engine variant, the activity line read `"{labels.ready} (MT)"` instead of `"{labels.slicing} (MT)"` — the `results.slicing` translation key existed but was never read. Fixed to use the correct label; added an assertion that the active state never shows "Engine ready".
- **`DiagnosticsSheet` select drift** (`src/diagnostics/DiagnosticsSheet.tsx`): rejecting an unavailable `mt` pick left the native `<select>` element visually showing "Multithread" (the browser sets its own DOM value before the `change` handler runs) even though the app's actual preference signal never changed. Fixed by reverting `target.value` to the current preference on rejection; added a regression assertion (`select.value` stays `'auto'` after a rejected pick).
- Also noted, not touched: the undisclosed-looking "SliceAr" rebrand and design-token changes the audit flagged as unauthorized were Claude's own work from an explicit user request earlier in this session, not scope creep by this work unit's implementer.

Verification after the fixes: `npm.cmd test`: 33 files / 243 tests passed (test count unchanged — both regression checks were added as extra assertions inside the two existing tests they belong to, not new `it()` cases). `npm.cmd run typecheck`: exit 0. `npm.cmd run build`: exit 0. WebKit e2e `--project=ipad-webkit`: 18/18 passed, including the full slice→estimates→download flow and the cancel/no-stale-result scenario.

## Slice 5b harness-removal follow-up - safe partial (Codex, 2026-09-16)

- Status: **partial**; Standard mode (`strict_tdd: false`). Task 9.7 is complete, but task 9.6 remains open because mandatory pre-deletion grep found three live script dependencies on `profiles/ender3v2-020-pla.json`: `scripts/engine-contract-check.mjs`, `scripts/slice-check.mjs`, and `scripts/catalog/resolve.mjs`. The profile directory was restored unchanged rather than breaking those out-of-scope callers or rewriting the required unchanged engine contract check.
- Removed the reachable spike application: `harness.html`, `src/harness/main.ts`, `src/instrumentation/panel.ts`, and its harness-only `panel.test.ts`. The panel contained `createPanel` in addition to migrated metric re-exports, but grep confirmed that only the deleted harness called it; `src/diagnostics/metrics.ts` and its diagnostics coverage remain intact.
- Removed the orphaned legacy single-STL worker request/result path (`slice`, `progress`, and `done`), its bundled-profile session, static profile import, guards, and protocol-only tests. The worker `init`/`ready`/`error` handshake remains because `src/engine/client.ts` is a live caller; this is the explicit non-orphan discovered by grep and was not guessed away.
- Removed the Vite multi-page harness input and inverted the expiring E2E assertion to require `/harness.html` HTTP 404. The production build contains neither `dist/harness.html` nor a harness chunk. `src/testing/test-model.ts` remains because `src/testing/test-model.test.ts` is its live Vitest caller.
- Historical OpenSpec/archive references remain audit history. README still describes the original spike and names `profiles/`; it is documentation rather than a runtime dependency and was not edited because this work unit's hard scope permits only the two OpenSpec documents outside the cleanup targets.

### Work Unit Evidence

| Evidence | Observed result |
|---|---|
| Mandatory reference audit | Pre-deletion `rg` found the Vite input, harness imports, E2E reachability test, worker static profile/session, historical docs, and the three live profile-consuming scripts above. Post-cleanup `rg` found no live harness/panel/single-STL worker caller; it intentionally still finds the E2E 404 assertion, the retained worker `init` handshake, and the three profile consumers. |
| Focused test | `npm.cmd exec -- vitest run src/slice src/diagnostics src/instrumentation src/export src/app src/worker`: exit 0; 12 files / 97 tests passed. |
| Full regression | `npm.cmd test`: exit 0; 32 files / 223 tests passed. Baseline was 33 files / 243 tests; the expected drop is 7 deleted panel-only metric tests plus 13 deleted v1 `slice`/`progress`/`done` protocol cases. All remaining tests passed; only the same three expected jsdom canvas warnings appeared. |
| Typecheck and production build | `npm.cmd run typecheck`: exit 0. `npm.cmd run build`: exit 0; 6 packs / 63 combinations verified, 78 modules transformed, only the existing large-chunk warning. Explicit dist inspection found no `harness.html` and no harness-named/content chunk. |
| Real engine contract | `node scripts/engine-contract-check.mjs`: exit 0 unchanged; real pinned ST transform, preparation, statistics, two-object, session-policy, and eight stable 268,435,456-byte heap checks passed. This command is why its live profile fixture cannot be deleted inside the authorized scope. |
| Runtime harness | With `node scripts/serve-dist.mjs 4175`, full `tests/e2e/shell.spec.ts` passed 18/18 on `ipad-webkit` and 18/18 on `ipad-webkit-landscape`. Both projects passed the inverted harness 404 assertion and the real configured import -> slice -> estimates -> G-code download flow, plus cancellation without stale output. Server stopped afterward. |
| Rollback boundary | Restore `harness.html`, `src/harness/**`, and `src/instrumentation/panel{,.test}.ts` from git history; revert the worker/protocol/Vite/E2E cleanup and these OpenSpec edits. The retained `profiles/**` fixtures need no rollback. |

- Delivery boundary: auto-chain, stacked-to-main work unit `pr5b-harness-removal` on top of `b818022`. Authored line count is **454 additions/deletions** (31 additions, 423 deletions; net -392) including deleted files, tests, and OpenSpec evidence; this is within the authorized 800-line ceiling.
- Deviation/blocker: full task 9.6 cannot honestly be checked until the three live scripts stop depending on `profiles/` under a separately authorized scope, or the acceptance criteria explicitly preserve that directory as a test fixture. No commit, push, branch, install, deployment, secret, or environment change was performed.

## Whole-app flow audit and two quick fixes (Claude, 2026-09-17)

With Phase 9 closed, an independent audit traced all seven user flows (import, transform, configure, slice, save, diagnostics, cross-cutting) end to end against the specs, rather than re-checking any single phase's diff. It found 6 real defects not covered by any prior phase audit; two are fixed here directly (small, mechanical, low-risk), four are substantial enough to hand to Codex as a follow-up work unit:

- **Fixed — dark-mode `color-scheme` cascade conflict**: `src/app/app.css`'s `:root` set an unconditional `color-scheme: light dark`, loaded after `tokens.css`'s per-theme `color-scheme: light|dark`, so native form-control chrome (checkboxes, the `<select>` popup) could silently follow the OS preference instead of the user's explicit Light/Dark choice — the same underlying class of bug as the closed-`<select>` fix from the Phase 9 correction, one layer deeper. Removed the unconditional declaration.
- **Fixed — three disclosure toggles missed the 44×44 touch target**: the Custom Printer, Preset Transfer, and Advanced-only Diagnostics `<details><summary>` elements in `ConfigurationContainer.tsx` had no `.settings-panels` ancestor, so the only rule sizing summaries never applied to them (native `<summary>` renders at native text-line height, well under 44px). The existing e2e touch-target test couldn't have caught this either — its selector never included `summary`. Generalized the CSS rule to all `summary` elements and added `summary:visible` to the e2e selector; re-verified the "44pt touch target" test now genuinely exercises and passes on all three.
- **Deferred to a follow-up work unit** (substantial enough to need real implementation, not a one-line fix): (1) the entire STL-import/viewer/engine-client error surface is hardcoded English regardless of locale — never translated because the "Slice 4a/4b completion" work units that authored it were never independently audited for i18n hygiene, unlike the toolbar (task 6.5) which is correctly `t()`-driven; (2) the "incomplete configuration" banner only checks `!hasModel`, so a user who imports a model but hasn't chosen a printer/filament sees zero explanation, just a disabled Slice button; (3) slice failures are completely invisible — `result.state.error`/`engine.message` are set but read by no component anywhere; (4) the sticky multithread-crash-to-single-thread fallback (`retryMultithread`/`retryMt`) is fully implemented and unit-tested but has zero callers anywhere in the real app — no retry action exists, so one MT crash permanently demotes the tier with no in-app recovery.

## Post-Phase 9 hardening correction work unit (Codex, 2026-09-17)

- Status: **success**; Standard mode (`strict_tdd: false`); non-numbered correction work unit `post-phase9-hardening`. No `tasks.md` checkbox was changed.
- Fix 1: replaced app-authored STL parser, mesh-worker, import-budget, plate-preparation, and engine-client display messages with stable error codes plus optional interpolation values. The Solid display boundary now translates those codes from complete EN/ES dictionaries; raw engine failures remain raw. Viewer labels, accessibility names, object count, and the Settings mode group label now use `t()` directly. Spanish WebKit coverage exercises a newly translated STL error after reload.
- Fix 2: Configure now distinguishes a missing model from an imported model lacking a valid printer/filament/quality selection, while Slice remains disabled. Component and WebKit tests cover the previously silent imported-model/no-printer case.
- Fix 3: failed slice attempts now render `result.state.error` as a main-flow `role="alert"` in Configure/Preview/Save. An AppProvider-local detail signal preserves coded-error interpolation without expanding the result store outside the authorized scope, and clears on a new attempt. Known codes translate live when locale changes; raw Orca/worker messages remain visible. A real built-app WebKit scenario aborts engine loading and observes the failure in the main flow.
- Fix 4: Advanced Diagnostics now exposes a translated multithread retry action. It probes first, preserves both sticky markers and reports unavailability on failure, or calls the existing `engineClient.retryMultithread()`/`retryMt` path, clears both markers, invalidates the tier memo immediately, and reports success. Unit coverage spies on the real client method; WebKit verifies the persisted markers are removed and the live active tier returns from Standard to Full.

### Work Unit Evidence

| Evidence | Observed result |
|---|---|
| Focused test | `npm.cmd exec -- vitest run src/viewer src/engine src/slice src/diagnostics src/app src/settings src/i18n`: exit 0; 22 files / 125 tests passed. |
| Full regression | `npm.cmd test`: exit 0; 32 files / 226 tests passed, up from the 223-test baseline; only the three expected jsdom canvas warnings appeared. |
| Typecheck | `npm.cmd run typecheck`: exit 0, no diagnostics. |
| Production build | `npm.cmd run build`: exit 0; cached ST/MT engines, 6 packs / 63 combinations verified, 78 modules transformed; only the existing large-chunk warning. |
| Real engine contract | `node scripts/engine-contract-check.mjs`: exit 0 unchanged; transform, preparation, statistics, two-object, session-policy, and eight stable 268,435,456-byte heap checks passed. |
| Runtime harness | Built output through `scripts/serve-dist.mjs` with real isolation headers: 42/42 passed (`ipad-webkit` 21/21; `ipad-webkit-landscape` 21/21). Both include Spanish translated STL errors, imported-model/no-printer guidance, an aborted real engine load producing a visible slice alert, and Advanced Diagnostics clearing both MT crash markers and immediately restoring Full eligibility. |
| Rollback boundary | Revert this section and the changes limited to `src/i18n/{en,es}.ts`, the named viewer/import/gizmo/engine client files, app provider/pane/configuration/result wiring, Diagnostics/Settings panels, their focused tests, and `tests/e2e/shell.spec.ts`. Phase 7/8 engine queue, cancel, terminate, session, worker mesh-cache, and transform logic remain untouched. |

- Delivery boundary: auto-chain, stacked-to-main correction work unit on `602718f`; no commit, branch, push, install, deployment, database, secret, or environment change was performed.
- Authored line count: **309 additions/deletions** (244 additions, 65 deletions) including implementation, tests, and this evidence section, within the authorized 800-line ceiling.
- Deviations: none from the requested behavioral scope. The first portrait E2E run exposed an expected strict-locator collision after Fix 2 added a second simultaneous alert; the STL assertion was narrowed to the STL alert and the complete portrait and landscape suites then passed.
- Issues/handoff: the retained `src/worker/mesh-cache.ts` internal error text is outside this work unit's explicitly protected worker session/mesh-cache scope and is not directly rendered by the audited UI path.

## Correction — dropped {meshId} interpolation on two prepare-plate error paths (Claude, 2026-09-17)

An independent audit of the section above confirmed all 4 fixes are genuinely correct (no error code missing from either dictionary, no mojibake in the new Spanish strings, the multithread-retry gate is properly decoupled from the crash marker it clears — verified against `src/engine/probe.ts` directly, not assumed). It found one real, narrow regression: `ConfigurationContainer.tsx`'s Orient-and-arrange handler and `ViewerToolbarContainer.tsx`'s Lay-flat handler both discarded `EngineClientError.values` in their catch (`error instanceof Error ? error.message : String(error)`), unlike `AppProvider.startSlice`'s already-correct handling. If `prepareCurrentPlate()` ever throws `mesh-missing` from those two entry points, the user would see the literal untranslated placeholder `"Missing mesh {meshId}"` instead of the interpolated id.

- **Fix**: both call sites now build `{ code: error.code, values: error.values }` from `EngineClientError` (mirroring `AppProvider.startSlice`) and pass it through `app.translateError(...)` before display.
- **Regression caught and fixed during this correction**: threading `app.translateError` into `PlateObjectToolbar` initially called `useApp()` directly inside that component, which broke `viewer-components.test.tsx` (7 failures) — that component is unit-tested standalone, without an `<AppProvider>` wrapper, by design (its tests care about toolbar/scale-sheet behavior, not app context). Fixed by accepting an optional `translateError` prop instead (defaulting to a plain code passthrough), with `ViewerToolbarContainer` supplying `app.translateError` for the real app. This is exactly the kind of regression the "run the tests yourself before committing" discipline in this project exists to catch.
- Verification: `npm.cmd test`: 32 files / 226 tests passed (unchanged from pre-correction — the fix touched no test behavior, just two catch sites and one component's prop surface). `npm.cmd run typecheck`: exit 0. `npm.cmd run build`: exit 0. WebKit e2e `--project=ipad-webkit`: 21/21 passed, including the slice-failure-visible, MT-retry, and orient/arrange scenarios.
- Authored line count for this correction: ~25 lines across `ConfigurationContainer.tsx` and `ViewerToolbarContainer.tsx`, well within the work unit's remaining budget.

## Catalog coverage expansion attempt (Codex, 2026-09-17)

Status: blocked in Standard mode (`strict_tdd: false`). The requested expansion could not pass the mandatory pinned acquisition gate because this execution sandbox denied the exact allowed `raw.githubusercontent.com` connection. No model, preset lock, or generated catalog change was retained; the fail-closed catalog remains at its previously verified baseline.

- Candidate preset names were read only from the locally cached OrcaSlicer v2.4.2 vendor indexes. The provisional set was Bambu Lab P1S and A1; Prusa MK3S+ and MINI+ (Input Shaper); Creality Ender-3 V3 and K1; Elegoo Neptune 4 Pro and Neptune 3 Pro; Anycubic Vyper; and Voron 2.4 300 and Trident 300. The provisional config was reverted after acquisition failed, before any candidate was represented as shipped.
- Bambu Lab A1 mini and Anycubic Kobra 2 Pro were not retried because the prior curated-catalog work already established that their required ABS/generic material compatibility was rejected. Creality CR-10 was skipped because the pinned local index exposes CR-10 machines but no explicit CR-10 process ladder. No plausible preset names or compatibility exceptions were invented.
- No new fixup was claimed. The existing Bambu `Textured PEI Plate`, relative-extrusion, Voron base-filament, and custom-base `G92 E0` behavior remains unchanged and verified only for the existing catalog.
- Combo count before/after is unchanged: 6 selectable printer models with 54 shipped printer combinations, plus 9 custom-base smoke combinations, for 63/63 real pinned-engine smoke passes.

### Work Unit Evidence

| Evidence | Observed result |
|---|---|
| Pinned acquisition attempt | `node scripts/catalog/fetch-presets.mjs`: exit 1 twice; Node `fetch` failed with `connect EACCES 185.199.111.133:443` while requesting the pinned OrcaSlicer commit. This was an environment network denial, not a missing-preset result; no alternate downloader or source was used. |
| Preset baseline | After reverting the provisional curation, `npm.cmd run catalog:verify-presets`: exit 0; 99/99 byte/hash records verified at tag `v2.4.2`, commit `8500fcdccaa1`. |
| Runtime harness | `node scripts/catalog/smoke-catalog.mjs`: exit 0; 63/63 20 mm cube combinations passed through the real pinned `wasm-v2.4.2-patch19` ST engine. This is the unchanged baseline, not evidence for any candidate model. |
| Release build and fast verification | `npm.cmd run catalog:build`: exit 0. `npm.cmd run catalog:verify`: exit 0; 6 printer packs and 63 smoke-gated combinations verified. `npm.cmd run build`: exit 0, including the same fast catalog verification in `prebuild`. |
| Focused tests | `npm.cmd exec -- vitest run scripts/catalog src/catalog`: exit 0; 3 files / 11 tests passed. |
| Full regression | `npm.cmd test`: exit 0; 32 files / 230 tests passed (the concurrent viewer work increased the working-tree total from the prompt's 226-test baseline). `npm.cmd run typecheck`: exit 0. |
| Rollback boundary | Remove only this appended progress section. Catalog config, lock, generated packs, scripts, and runtime behavior are byte-for-byte unchanged; ignored `.engine-cache` download attempts are not delivered artifacts. |

- Delivery path: `size:exception` was explicitly authorized for this generated-data catalog expansion, but no expansion landed. Authored delivered change is documentation only; generated catalog authored-line exclusions therefore do not apply.
- Authored line count: 25 added documentation lines, 0 catalog implementation lines, 0 deletions.
- Deviation: the requested breadth increase remains unimplemented because preset existence, inheritance, explicit compatibility, lock hashes, and real smoke slicing could not all be verified. Quality-over-quantity and fail-closed behavior were preserved instead of shipping unverified models.

## Catalog coverage expansion, completed with real network access (Claude, 2026-09-17)

Status: **success**. The prior work unit above was blocked because that sandbox denied `raw.githubusercontent.com`. This session had real outbound network access to the exact pinned host, verified directly (`curl` against `raw.githubusercontent.com/SoftFever/OrcaSlicer` at commit `8500fcdccaa10b5099ac20d252af3a7c560046f1` succeeded), so the same expansion was executed for real end to end: every candidate machine, process, and filament preset was fetched from the pinned commit and independently inspected for `compatible_printers` metadata before being written into `catalog.config.json` — nothing was guessed or carried over unverified from the earlier blocked attempt's candidate list.

**Added 13 new models across all 6 vendors** (6 → 19 models, 54 → 180 shipped smoke-gated combinations):

- **BBL** (+3): P1S, P1P, A1. P1S reuses the X1 Carbon Fine/Standard/Draft process ladder and the plain `Generic PLA/PETG/ABS` filaments — upstream `compatible_printers` on `0.20mm Standard @BBL X1C` etc. explicitly lists `Bambu Lab P1S 0.4 nozzle`, confirmed by direct inspection, not assumed. P1P and A1 have their own dedicated process ladders (`@BBL P1P`, `@BBL A1`) and dedicated generic filaments (`Generic PLA @BBL P1P`, `Generic PLA @BBL A1`, etc.), each with `compatible_printers` naming the exact machine.
- **Prusa** (+2): MK3S, MINI. Upstream ships only one `0.20mm Standard` process preset for each (no separate named Fine/Draft rungs, and the alternate `Detail`/`Quality`/`Draft` presets inherit an empty `compatible_printers` from `process_common_mk3` with no exception). Rather than fabricate a `conditionOnly` exception, the ladder was synthesized from that one compatible preset with `layer_height` fixups (0.10 fine / 0.30 draft), the exact same mechanism already used by `customBase`'s Fine/Standard/Draft rungs from `fdm_process_common`. Filaments use the base `Prusa Generic PLA/PETG/ABS` (no vendor suffix exists for MK3S/MINI), whose `compatible_printers` explicitly lists both machines.
- **Creality** (+2): K1, Ender-3 V3. Both have dedicated process ladders and filaments with clean, explicit `compatible_printers` matches — K1 uses the base `Creality Generic PLA/PETG/ABS` (its `@K1-all` variants are compatible only with K1C/K1 SE, not plain K1, so the base set was used instead, confirmed compatible for plain K1 by direct inspection); Ender-3 V3 uses the dedicated `@Ender-3V3-all` filament family.
- **Elegoo** (+2): Neptune 4 Pro, Neptune 3 Pro. Both reuse the exact inheritance pattern already used by the existing Neptune 4 entry (each ladder's Fine/Draft preset inherits its own Standard preset, which carries the machine-specific `compatible_printers`), and the same `Generic PLA/PETG/ABS @Elegoo` filaments already used for Neptune 4.
- **Anycubic** (+2): Vyper, Kobra 3. Both have dedicated process ladders and use the base `Anycubic Generic PLA/PETG/ABS` filaments, all with explicit `compatible_printers` matches.
- **Voron** (+2): 2.4 300, Trident 300. The shared `@Voron` process ladder's ancestor (`fdm_process_voron_common`) explicitly lists every Voron frame size including both new ones, so no new `conditionOnly` exception was needed for processes. Voron's filament index is still completely empty upstream (confirmed again, not assumed), so both new models reuse the exact same BBL-base `conditionOnly` filament workaround already established for the existing 2.4 250 entry, verbatim rationale and all.

**Considered and dropped:** none of the models actually added were dropped — every candidate independently verified against upstream `compatible_printers` metadata resolved cleanly. Two from the prior blocked attempt's provisional list were deliberately not retried, per that attempt's own already-established reasoning: BBL A1 mini and Anycubic Kobra 2 Pro (both previously found to have their generic ABS/material compatibility rejected by upstream metadata during the original Slice 2 curation). Creality CR-10 was not retried either (pinned index exposes CR-10 machines but no explicit CR-10 process ladder, same as previously found).

**Two real fixups were discovered by the smoke gate itself, not guessed in advance:**
- BBL P1S/P1P/A1 initially failed PETG/ABS with `Cool Plate does not support filament` — identical failure mode to the one that originally forced X1C's `Textured PEI Plate` fixup. Applied the same `curr_bed_type: "Textured PEI Plate"` fixup to all three; all 9 combos then passed for each.
- Anycubic Vyper initially failed all 9 combos with `Relative extruder addressing requires resetting the extruder position at each layer... Add "G92 E0" to layer_gcode` — the same class of issue the custom base already required a `before_layer_change_gcode: "G92 E0"` fixup for. Applied that identical fixup to Vyper only (no other vendor needed it); all 9 combos then passed.

An intermediate patch to add these two fixups was applied with a Node script that reformatted the entire `catalog.config.json` through `JSON.stringify(..., null, 2)`, which produced a ~1200-line diff by expanding every existing entry's formatting even though only 2 models' `fixups` changed. This was caught before finalizing and the file was rewritten by hand back to the original compact per-array-line style (matching the untouched five pre-existing vendor blocks byte-for-byte in style), leaving a clean 182-line pure-insertion diff.

### Work Unit Evidence

| Evidence | Observed result |
|---|---|
| Network access confirmation | `curl https://raw.githubusercontent.com/SoftFever/OrcaSlicer/8500fcdccaa10b5099ac20d252af3a7c560046f1/resources/profiles/{BBL,Prusa,Creality,Elegoo,Anycubic,Voron}.json`: all 6 succeeded (44 KB–287 KB each), confirming this session is not subject to the prior sandbox's `EACCES` block. |
| Pinned acquisition | `node scripts/catalog/fetch-presets.mjs`: exit 0, 152 pinned profile files acquired (up from 99), all from the exact pinned commit. `npm.cmd run catalog:verify-presets`: exit 0, 152/152 byte/hash records verified. |
| Real engine smoke (before fixups) | `node scripts/catalog/smoke-catalog.mjs`: exit 1 — `anycubic-vyper-04` had 0/9 passing combos (all failed with the G92 E0 relative-extrusion error); `bbl-p1s-04`/`bbl-p1p-04`/`bbl-a1-04` each had 3/9 passing (PLA passed, PETG/ABS failed with the Cool Plate error). This is real, observed failure data, not a hypothesis. |
| Real engine smoke (after fixups) | `node scripts/catalog/smoke-catalog.mjs`: exit 0, **180/180** 20 mm cube combinations passed through the real pinned `wasm-v2.4.2-patch19` ST engine — up from the 63/63 baseline. |
| Release build and fast verification | `npm.cmd run catalog:build`: exit 0. `npm.cmd run catalog:verify`: exit 0; **19 printer packs and 180 smoke-gated combinations verified** (up from 6 packs / 63 combinations). |
| Focused tests | `npm.cmd exec -- vitest run scripts/catalog src/catalog`: exit 0; 3 files / 11 tests passed (unchanged — no test behavior needed to change for new curated data). |
| Full regression | `npm.cmd test`: exit 0; **32 files / 230 tests passed**, confirmed against the actual current tree (not assumed from the prompt's stated 230 baseline) and unchanged after this work. |
| Typecheck | `npm.cmd run typecheck`: exit 0, no diagnostics. |
| Production build | `npm.cmd run build`: exit 0; prebuild's fast catalog verify reported 19 packs / 180 combinations; only the pre-existing large-chunk Vite warning, unrelated to this change. |
| Diff cleanliness | `git diff --stat -- catalog.config.json catalog.presets.lock.json public/catalog/index.json`: 182 pure insertions in `catalog.config.json` (no reformatting noise), 267 lines in the generated lock, 2 lines in the generated index; plus 13 new generated per-printer pack files under `public/catalog/v2.4.2/printers/`. |
| Scope boundary | `git status --porcelain`: confirms `src/i18n/{en,es}.ts`, `src/viewer/**`, and `tests/e2e/shell.spec.ts` were already modified in the working tree by the concurrent touch-gesture work unit before this task started; this task touched none of them (verified: no Edit/Write call in this session referenced any path outside `catalog.config.json`, `catalog.presets.lock.json`, and `public/catalog/**`). |

- Authored line count: **182 lines** in `catalog.config.json` (13 new model entries, pure insertions, compact style matching the existing 6). Generated `catalog.presets.lock.json`, `public/catalog/index.json`, and the 13 new `public/catalog/v2.4.2/printers/*.json` pack files are excluded from authored count per the established generated-data convention, consistent with the original Slice 2 curation work unit.
- Deviations: none from the curated-catalog contract — every new preset reference was independently confirmed against the pinned upstream index and its `compatible_printers` metadata before being added; the two Voron models' filaments reuse the exact pre-existing `conditionOnly` exception rationale rather than inventing a new one; the Prusa MK3S/MINI ladder synthesis uses the exact same `layer_height`-fixup mechanism already established for `customBase`, not a new pattern.
- Rollback boundary: revert `catalog.config.json` to the prior 6-model version (drop the 13 new model blocks and the two new `fixups` entries on `bbl-x1c-04`'s siblings — X1C's own fixups were untouched), then re-run `node scripts/catalog/fetch-presets.mjs && npm run catalog` to regenerate `catalog.presets.lock.json` and `public/catalog/**` back to the 6-pack/63-combo baseline. No script, test, or non-catalog application file was modified by this work unit.


## Touch move/rotate gesture wiring bug-fix work unit (Codex, 2026-09-17)

- Status: **success**; Standard mode (`strict_tdd: false`); direct non-numbered work unit `touch-move-rotate-gestures`. No `tasks.md` checkbox was changed.
- Rotation design: chose a visible **Move / Rotate mode toggle** and one-finger selected-object drag instead of a two-finger twist. This reuses one small, deterministic pointer state machine for both transforms, is easier to operate and test reliably on iPad, and leaves two-finger camera dolly/truck untouched. Rotate mode maps cumulative horizontal drag since gesture ownership begins to a full turn per canvas width and calls `gizmo.rotateBy(radiansSinceBegin)`, so rotation is continuous about bed-normal Z rather than a 90-degree toolbar increment.
- Gesture state machine: pointerdown on the selected mesh creates only a candidate. It does not disable camera-controls or stop propagation. Movement at or below `TAP_MAX_DISTANCE_PX` remains in the existing tap path. The first move beyond the threshold snapshots the selected object with `gizmo.begin(..., mode, currentNdc, camera)`, disables/cancels camera controls, and takes capture-phase ownership. Later moves call `moveTo` or cumulative `rotateBy`; pointerup/pointercancel calls `gizmo.end()` and restores camera controls. A candidate released without promotion reaches the pre-existing select/deselect/double-tap-fit code unchanged.
- Transform persistence: `gizmo.moveTo` and `rotateBy` already call `plate.updateTransform`; its default `dropToBed !== false` path applies `dropToBed` on every update. No redundant final update was added. Unit and WebKit assertions read the persisted `plate.state.objects[i].transform` / rendered `data-transform` after release.
- UI: localized EN/ES Move and Rotate labels, pressed states, and an explicit "Touch transform mode" group were added. The toolbar now lives inside the positioned viewer stage so its existing actions and the new mode controls remain clickable instead of overlapping the settings pane.

### Work Unit Evidence

| Evidence | Observed result |
|---|---|
| Focused test | `npm.cmd exec -- vitest run src/viewer`: exit 0; 7 files / **31 tests passed**. Interleaved pointerdown/move/up tests prove threshold-delayed move ownership, persisted drop-to-bed position, cumulative non-90-degree Z rotation, first-tap deselection behavior, unchanged double-tap fit, camera separation, and pointercancel cleanup. Existing `gizmo.test.ts` math tests remain unmodified and pass. |
| Full regression | `npm.cmd test`: exit 0; 32 files / **231 tests passed**, up from the requested 226-test baseline. Only the three existing jsdom canvas warnings appeared. |
| Typecheck | `npm.cmd run typecheck`: exit 0, no diagnostics. |
| Production build | `npm.cmd run build`: exit 0; cached ST/MT engines, current concurrent catalog baseline of 19 packs / 180 combinations verified, 78 modules transformed; only the existing large-chunk warning. |
| Real engine contract | `node scripts/engine-contract-check.mjs`: exit 0 unchanged; real pinned ST transform/rotation/offset/preparation/statistics/two-object/session-policy checks passed with eight stable 268,435,456-byte heap samples. |
| Runtime harness | Built output through the real-header server. A combined final matrix run passed all **22/22 landscape** cases and 21/22 portrait cases; the sole portrait miss was the unrelated existing "Configure is the default" startup assertion timing out before the shell appeared, and it passed immediately in isolation. A clean follow-up full `ipad-webkit` run passed **22/22**. The new real-mouse scenario passed on both projects and proves first elsewhere-tap deselection, persisted selected-object movement, visible mode switching, and continuous non-quarter-turn rotation; the existing camera-orbit scenario also passed without transform mutation. |
| Rollback boundary | Revert only `src/viewer/gestures.ts`, the gesture wiring and stage placement in `ViewerWorkspace.tsx`, the mode props/UI/CSS in `TransformToolbar.tsx`, `ViewerToolbarContainer.tsx`, and `viewer-components.css`, the three EN/ES labels, viewer unit/component tests, the one E2E scenario/helper, and this section. Gizmo math, camera configuration, numeric scaling, engine/slice/catalog behavior, and unrelated concurrent catalog work remain intact. |

- Delivery boundary: explicit 800-line cohesive-work-unit authorization (`size:exception` relative to the skill's default 400-line warning), no branch/commit/push/install/deploy. Implementation and tests are **319 authored changed lines** (294 additions, 25 deletions); the appended documentation adds **25 lines including separators**, for **344 total authored lines**, within the 800-line budget.
- Deviations: no pinch/free-hand scale was added, as requested. The robust mode-toggle rotation alternative was chosen over two-finger twist. `src/viewer/gizmo.ts` and `src/viewer/camera.ts` required no changes. The first `npm.cmd run build` attempt was temporarily blocked by concurrent out-of-scope catalog edits (`Preset acquisition lock does not match catalog config`); after their owner completed the lock/generated catalog update, the required final build passed without this work unit touching or reverting those files.
- Issues/handoff: none for this work unit. Playwright's web-server child remained alive after test completion in this sandbox, so it was explicitly stopped after each completed run to collect the final summary; this did not affect test results.

## Preview adapter and budget policy - pr10a-preview-adapter-budget (Codex, 2026-09-18)

- Status: **partial** in Strict TDD mode (explicit user override of stale `strict_tdd: false` config). Task 10.3 is implemented; task 10.2 remains open because the pinned renderer does not release hidden-layer buffers. All previous progress above is preserved.
- Reconstructed entry status: `schemaName: spec-driven`, `planningHome: openspec`, `changeRoot: openspec/changes/touch-slicing-ui`, `applyState: ready` for assigned pending tasks 10.2/10.3; proposal, slice-results spec, design, tasks, and existing apply-progress were consumed. Allowed edits: `src/preview/**` and the assigned task/progress artifacts only. Task 10.1's package identity was supplied by the user and confirmed in shipped declarations; its buffer-release gate remains unmet.
- `adapter.ts` is the only source file importing the pinned package. It dynamically registers `gcode-preview`, sets lines-only properties before mounting, copies mutable source bytes, updates layer ranges, hooks native non-bubbling events on the open shadow canvas, and removes listeners/node idempotently. Node disconnection owns the library's controller disposal; no nonexistent element `dispose()` is invoked. Fake-element injection keeps unit tests WebGL-free.
- `budget.ts` is pure preview-only planning: rounded-up bytes/30 lines and segments x48 bytes, Standard 100,000,000 bytes / provisional Full 150,000,000 bytes, all-visible -> window -> decimated -> unavailable. Standard defaults to a window, radius defaults to two layers, and decimation stride is bounded at 16. Context loss advances exactly one rung; replanning may skip further if that rung cannot fit. Unavailable owns no result, Save, or estimate state.
- **Blocking library mismatch:** `@chestnutlabs/gcode-renderer-three` `scene.js:setLayerRange()` calls `applyDrawState()`/`render()`; `applyDrawStateToMesh()` changes visibility/draw ranges only. It does not release hidden geometry. Window estimates assume uniform segment density, not measured GPU residency; consumers must implement real filtering/decimation before using this policy as memory enforcement. No full-remount workaround or false buffer-release claim was added.

### TDD Cycle Evidence

| Task | Test file / layer | Safety net | RED (tests first) | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|
| 10.2 partial | `src/preview/adapter.test.ts`, DOM adapter unit | N/A, new module | `npm.cmd exec -- vitest run src/preview/adapter.test.ts`: exit 1, missing `./adapter` before production file existed | Same command: exit 0, 1 file / 3 tests | Typed bytes/ArrayBuffer, range update/reset, loss/restored events, double disposal and post-disposal updates | Typed fake defaults corrected after typecheck; final focused suite remains green. GPU release is NOT covered or complete. |
| 10.3 | `src/preview/budget.test.ts`, pure unit | N/A, new module | `npm.cmd exec -- vitest run src/preview/budget.test.ts`: exit 1, missing `./budget` before production file existed | `npm.cmd exec -- vitest run src/preview`: exit 0, 2 files / 15 tests (12 budget cases) | Zero/rounded estimates, cap boundary, both tiers, clipped windows, decimation/unavailable, context loss, invalid input | Added safe indexed-stage fallback for `noUncheckedIndexedAccess`; repeated focused suite: exit 0, 15/15. |

### Work Unit Evidence

| Evidence | Observed result |
|---|---|
| Focused tests | Final `npm.cmd exec -- vitest run src/preview`: exit 0; 2 files / 15 tests passed. |
| Runtime adapter probe | Parent's inline `node --input-type=module` Vite + installed Chromium harness: exit 0. Real default factory created `GCODE-PREVIEW` with shadow canvas, lines quality, range `[0,0]`; synthetic native lost/restored events invoked callbacks once each; double disposal removed node and cleared shadow root. This does not prove actual GPU-loss recovery or parsed-buffer release. Pure budget policy has no runtime boundary. |
| Lazy chunk probe | Parent's inline Vite `build({write:false})` virtual adapter entry: exit 0; entry dynamically imports `dist-BH5hs3Pf.js`, package occurs only in dynamic entry (`libraryInEntry=false`). Production app does not import this adapter until task 10.5; no production preview chunk is claimed yet. |
| Full regression | Parent `npm.cmd test`: exit 0, 34 files / 246 tests passed; three existing jsdom canvas warnings. |
| Typecheck | Parent `npm.cmd run typecheck`: final exit 0, no diagnostics. First run caught the fake-element cast and unchecked stage indexing; both were corrected before the passing rerun. |
| Build | Parent `npm.cmd run build` with `ENGINE_CACHE_ONLY=1`: exit 0; 19 packs / 180 combinations verified, 78 modules transformed, LICENSE copied; existing chunk-size and plugin timing warnings. No dependencies or engine downloads changed. |
| Rollback boundary | Remove only `src/preview/{adapter,budget}.ts` and their two tests; revert the 10.3 checkbox and this appended section. No visual, viewer, settings, catalog, source-result, or Save files were touched. |

- Delivery strategy: user-selected single PR, **294 authored changed lines** (263 source/tests + 29 progress + 2 checkbox replacement), below the 600-line ceiling; no commit/push/install. Independent SDD verification remains the parent's responsibility. Tasks 10.1/10.2 and 10.4-10.7 stay open; completing 10.2 requires an approved renderer/filtering solution, not simply a layerRange property update.
