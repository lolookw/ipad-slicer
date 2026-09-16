
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
