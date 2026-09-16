
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
