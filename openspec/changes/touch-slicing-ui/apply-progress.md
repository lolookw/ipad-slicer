
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
