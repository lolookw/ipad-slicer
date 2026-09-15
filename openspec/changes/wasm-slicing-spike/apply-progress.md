# Apply Progress: wasm-slicing-spike

Status: done for assigned tasks 1.3 and 1.5; remaining change tasks are outside this batch.

## Execution Context

- Schema: spec-driven; planning home: openspec; hybrid progress mirrored to Engram.
- Readiness: ready, established from proposal, all four specs, design, and pending assigned tasks.
- Edit root: `<repo root>`; standard mode, strict TDD off.
- Delivery: auto-chain, stacked-to-main, PR 1 scaffold slice; 400 authored changed-line budget. This batch contributes 297 additions plus deletions; pre-existing PR 1 scaffold is not included.
- Chain: **PR 1 Scaffold (current)** -> PR 2 Fetch/Loader -> PR 3 Worker/Profile -> PR 4 Export/Panel -> PR 5 Probe/Multithread.
- Review mode: disabled/unmanaged. No review actors or Git mutations were run.

## Cumulative Task State

| Tasks | State |
|---|---|
| 1.1, 1.2 | Reported complete by Claude; existing scaffold/config files inspected. Their unchecked task markers are intentionally unchanged. |
| 1.3 | Complete: manifest with specified fields, valid layered SVG icon, Apple touch icon link. |
| 1.5 | Complete: injectable storage/clock log, default 500 entries, per-append persistence, restore, corruption/quota handling, clear and pretty JSON export; 21 Node tests. |
| 1.4 | Pending authorization; no LICENSE created. |
| All other tasks | Unchanged and outside this batch. |

## Files Changed

- `public/manifest.webmanifest`: created minimal PWA manifest referencing `/icons/icon.svg`.
- `public/icons/icon.svg`: created layered-slices glyph.
- `index.html`: added only the Apple touch icon link.
- `src/instrumentation/log.ts`: created log factory, interfaces, validation and storage fallback.
- `src/instrumentation/log.test.ts`: created fake-storage tests for required cases and defaults/error edges.
- `openspec/changes/wasm-slicing-spike/tasks.md`: only 1.3 and 1.5 checkboxes changed.
- `openspec/changes/wasm-slicing-spike/apply-progress.md`: created this report.
- `dist/`: regenerated ignored build output, including copied manifest/icon; not authored source.

## Work Unit Evidence

| Evidence | Observed result |
|---|---|
| Focused test | `npx.cmd vitest run src/instrumentation/log.test.ts`: exit 0; 1 test file, 21 tests passed. Offline npm mode enabled; no downloads. |
| Typecheck | `npm.cmd run typecheck`: exit 0; `tsc --noEmit`, no diagnostics. |
| Build | `npm.cmd run build`: exit 0; Vite 8.3.0, 4 modules transformed, built in 47 ms. |
| Static artifact check | PowerShell `ConvertFrom-Json` and `[xml]` validation of `dist` assets: exit 0; exact manifest fields, SVG namespace, referenced icon and Apple touch link passed. |
| Runtime harness | N/A for this scaffold/log-core slice: no engine or main-thread log wiring exists yet. Cross-instance persistence is exercised with fake storage; actual browser crash/reload and iPad installation remain unverified. |
| Rollback boundary | Remove the four new manifest/icon/log/test files and the added Apple touch link; revert only 1.3/1.5 checkboxes and this progress artifact. Preserve all pre-existing scaffold and other artifacts. |

## Deviations and Risks

- Bare `npx`/`npm` commands initially exited 1 with `PSSecurityException` / `UnauthorizedAccess` because PowerShell script execution is disabled. Equivalent `.cmd` launchers passed; no execution-policy change was made.
- Capacity must be a positive safe integer. Invalid restored entry shapes reset the log, and denied storage reads/removals also degrade to memory-only behavior.
- Persistence is best-effort: quota/access failures retain memory but cannot preserve new events across reload; a failed removal may leave old persisted entries. Circular/BigInt data cannot be exported as JSON; use JSON-serializable worker-event payloads.
- iOS prefers a PNG apple-touch-icon. Providing PNG is a follow-up outside spike scope, as requested; on-device icon behavior was not tested.
- The config's greenfield testing description is outdated; actual installed Vitest/TypeScript were used. Config was not edited.
- Git initially refused a read-only status check due to ownership. A command-scoped `safe.directory` exception allowed inspection; no Git configuration was persisted.
- No commits, branches, pushes, remote operations, deploys, dependency installs or unrelated source edits.
- A final existence check found `LICENSE`, absent from the initial root listing; it was created outside this batch and was neither modified nor credited as completed here.

## Next Handoff

Independent SDD verification may inspect this completed slice. The broader change is not complete; LICENSE, engine integration, panel and device testing remain with their assigned owners.

## PR 2 Fetch/Loader — Tasks 2.2–2.5

Status: done for this assigned slice; PR 1 content above is preserved as historical evidence.

- Context: schema `spec-driven`, planning home `openspec`, hybrid persistence, applyState `ready`; proposal, design, assigned specs/tasks and previous file/Engram progress read before implementation. Edit root remains the repository; standard mode, strict TDD off.
- Delivery: auto-chain, stacked-to-main, PR 2 of 5 following committed PR 1 on `main`; no Git mutations or review actors (disabled/unmanaged).
- Cumulative state: tasks 1.1–1.5 are currently checked (including Claude's later work); this batch adds 2.2–2.5 only. Task 2.1 is externally completed per handoff, but its existing unchecked marker remains untouched. Every other marker is unchanged.
- Files: created `scripts/fetch-engine.mjs`, `src/engine/{manifest,stream-loader}.ts` and their two `.test.ts` files; changed only scripts in `package.json`, generated-manifest ignore in `.gitignore`, four task checkboxes, and this appended progress section.
- Generated, ignored outputs: `public/engine/<release>/{st,mt}/`, `public/engine-manifest.json`, and `dist/`; engine lock and cached inputs are unchanged.

### PR 2 Work Unit Evidence

| Evidence | Observed result |
|---|---|
| Focused tests / full suite | `npx.cmd vitest run`: exit 0, 3 files / 46 tests passed (25 engine tests, 21 PR 1 tests); Node environment, fake fetch, no cache dependency. |
| Typecheck | `npm.cmd run typecheck`: exit 0, no diagnostics after fixes to ArrayBuffer-backed stream types and the test-only Node import annotation. |
| Runtime harness | `npm.cmd run fetch-engine`: exit 0, run exactly once after all four cache paths passed preflight; `ENGINE_CACHE_ONLY=1` prevented downloads. Four cache hits; st gzip 9,010,325 bytes and mt gzip 9,370,936 bytes, one part each. Both inputs verified before public outputs were written. |
| Build | `npx.cmd vite build`: exit 0, Vite 8.3.0, 4 modules, 120 ms; prebuild not rerun. Node v22.12.0; npm offline mode enabled throughout. |
| Built-asset integrity | Node fs/zlib/crypto check: both `dist` JS SHA-256 values and reconstructed WASM lengths/SHA-256 values match the lock; every part is at most 20 MiB. |
| Rollback boundary | Remove the five new script/engine files, revert the two package scripts and one ignore entry, uncheck only 2.2–2.5, and remove only this PR 2 appendix. Preserve PR 1, lock, cache and all other task markers. Generated outputs can be regenerated. |

### PR 2 Deviations, Risks and Handoff

- Emscripten's synchronous hook cannot propagate a later asynchronous throw through its synchronous `{}` return. `createInstantiateWasm` therefore exposes `hook.completion`: PR 3 must observe it alongside the `OrcaModule` promise (for example, `Promise.all`). Both-path failure rejects this promise; receiving/instrumentation callback errors do not retry instantiation. Tests cover failure and receiver-callback behavior.
- `@types/node` is not installed. The test-only `node:zlib` import uses a narrowly documented `@ts-expect-error`; no dependency or TypeScript configuration changes were permitted. Production code typechecks without suppressions.
- Real cached gzip files exercise one-part output only; splitting is implemented at 20 MiB but oversized compressed input was not exercised. Loader multipart concat and split magic bytes are covered with synthetic test bytes.
- Actual OrcaModule integration, Safari memory/streaming behavior, pthread startup, isolation and hosted Content-Type remain for PR 3/5 and authorized device testing. The Vite app does not wire the loader yet.
- No network downloads, installs, commits, branches, pushes, remote operations, deployments or secrets. No edits to lock, design/spec/proposal or unrelated PR 1 files.
- Next: independent SDD verification of this slice, then assigned PR 3 worker/profile work. Engram progress/tasks mirror is handled by the parent orchestrator.
- Changed-line estimate: 314 authored additions + deletions (42 tracked changes including this appendix + 272 untracked source/test lines), excluding engine.lock.json and package-lock.json; within the 400-line PR 2 budget.

## PR 3 Worker/Profile - Assigned Tasks 3.2, 3.3, 3.4 and 3.6

Status: partial. Tasks 3.3 and 3.6 complete; 3.2 and 3.4 implemented but unchecked because the real slice harness fails profile validation. All prior progress above is preserved.

- Context: schema `spec-driven`, planning home `openspec`, hybrid persistence, applyState `ready` established from proposal, all specs, design, pending assigned tasks and prior file/Engram progress. Standard mode; strict TDD off; edit root is the repository.
- Delivery: auto-chain, stacked-to-main, PR 1 -> PR 2 -> **PR 3 (current)** -> PR 4 -> PR 5; no Git mutations or review actors, disabled/unmanaged.
- Cumulative state: 1.1-1.5 and 2.1-2.5 remain checked. Only 3.3/3.6 are newly checked; 3.1/3.5 and all other markers are preserved. Profile already existed, so no polling was needed.
- Files: created `src/worker/protocol.ts`, `protocol.test.ts`, `engine.worker.ts`, `engine-bridge.mjs`, `engine-bridge.d.mts`, and `scripts/slice-check.mjs`; added only `slice-check` in `package.json`; changed two task markers and appended this report. `dist/` is regenerated ignored build output.

### PR 3 Work Unit Evidence

| Evidence | Observed result |
|---|---|
| Focused tests | `npx.cmd vitest run src/worker/protocol.test.ts`: exit 0, 1 file / 34 tests passed. Guards cover every kind, required fields, enum variants, invalid buffers, numeric boundaries and untrusted stage objects. |
| Full suite | `npx.cmd vitest run`: exit 0, 4 files / 80 tests passed in 312 ms on final run. |
| Typecheck | `npm.cmd run typecheck`: exit 0, no diagnostics. |
| Runtime harness | `npm.cmd run slice-check`: exit 1 on all three runs; `OrcaWasm (-6): "G92 E0" was found in before_layer_change_gcode, which is incompatible with absolute extruder addressing.` No G-code, actual temperatures, successful slice time or layer count can be reported. |
| Build | `npx.cmd vite build`: exit 0, 6 modules, 84 ms; generated `dist/assets/engine.worker-DvcHnBT3.js` (12.63 kB), proving worker bundling and profile JSON resolution through existing main-thread wiring. |
| Rollback boundary | Remove the six new files listed above, remove only the package `slice-check` script, uncheck only 3.3/3.6, and remove only this appendix. Preserve Claude's profile/resolver/main/index work, PR1/PR2 files and all other task markers. |

### PR 3 Deviations, Risks and Handoff

- The profile uses `M83` and per-layer `G92 E0`, but omits `use_relative_e_distances`; the engine rejects the configuration at slice validation. Claude/profile owner must fix the resolved profile, then rerun all verification before checking 3.2/3.4. No profile override or prohibited-file edit was made. Configured values are nozzle 220 C and plate 60 C, NOT observed G-code temperatures.
- Cached `slicer.js` has no `Module["addFunction"]` or `Module["removeFunction"]` exports. The worker emits only start/end progress for this release; genuine per-stage progress and intermediate heap sampling are unavailable. Optional callback support uses the header's `viii` ABI if a future compatible build exports it.
- Per explicit handoff, `_onewasm_init` consumes flat native JSON and G-code is copied from ABI output pointers, not the stale spec's `init_profile` / design's `FS.readFile` path. Shared plain-ESM marshaling plus TypeScript declarations lets the Node check exercise the same allocation, copying and cleanup helpers as the worker. Single-thread only; `prefer: 'mt'` deliberately selects `st` until PR5.
- Node harness is the authorized runtime substitute; actual browser Blob import, Safari slicing/cancel, reference STL memory ceiling and hosted isolation remain unverified. Worker loading observes both factory and hook completion plus abort rejection; per-request error stages avoid overlapping init/message misclassification.
- `.cmd` launchers avoid the previously established PowerShell execution-policy issue; npm offline mode was enabled. No downloads, installs, secrets, commits, branches, pushes, remote operations or edits to design/spec/proposal, profiles, resolver, main, index or existing PR1/PR2 behavior.
- Changed-line estimate: 327 authored additions plus deletions (293 new source/test/declaration lines, 1 package script, 4 task-marker lines and 29 appended progress lines), excluding `profiles/*.json`, ignored build output and concurrent Claude-owned changes. Parent mirrors this merged report/tasks to Engram; next action is profile-owner correction and rerun, then independent SDD verification.

### PR 3 Resolution (Claude)

Status: done. The slice-check blocker is fixed and 3.1, 3.2, 3.4 and 3.5 are now checked.

- Root cause: `scripts/resolve-profile.mjs` resolved `fdm_machine_common` and `fdm_process_common` from `Custom/`. Creality ships its own bases in `Creality/{machine,process,filament}/`, and OrcaSlicer resolves inherits inside the vendor bundle first.
- Engine rule: the inherited `before_layer_change_gcode` runs `G92 E0` and the Creality start G-code sets `M83`, so the resolver adds the explicit override `use_relative_e_distances: '1'` (documented in `profiles/README.md`).
- Profile: 207 keys; nozzle 220 C (initial 220), all plate temperatures 60 C, `gcode_flavor` marlin, 220x220x250, nozzle 0.4.

| Evidence | Observed result |
|---|---|
| Runtime harness | `npm run slice-check`: exit 0. 20 mm cube → 292,819 bytes of G-code, 100 layers, 856 ms in Node. Temperatures: M104 [150, 220, 0], M109 [220], M140 [60, 0], M190 [60]. |
| Full suite | `npx vitest run`: 4 files / 80 tests passed. |
| Typecheck | `npm run typecheck`: exit 0. |
| Build | `npx vite build`: exit 0; `engine.worker` 12.60 kB, index 4.37 kB. |

- Delivery: authored lines are about 528 (127 tracked + 401 new, excluding the generated 402-line profile JSON), which is over the 400 budget. The maintainer authorized a ledger reset and chose a single PR 3 commit over the auto-chain split (3a profile/bridge ~228, 3b worker/page ~300).
- Open risk: Blob-URL module import of the classic engine script, streaming instantiate, and cancel-by-terminate are not yet exercised in a real browser.

## PR 4 Export/Panel - Tasks 4.1, 4.2 and 4.4

Status: assigned tasks complete; browser smoke remains with Claude. Earlier sections are preserved verbatim.

- Context: schema `spec-driven`, planning home `openspec`, hybrid persistence, applyState `ready` from proposal/design/specs/tasks and prior progress; repository edit root; standard mode, strict TDD off.
- Delivery: auto-chain, stacked-to-main; PR 1 -> PR 2 -> PR 3 -> **PR 4 (current)** -> PR 5. No commits, branches, remote operations, network, installs or review actors (disabled/unmanaged).
- Cumulative tasks: 1.1-3.6 remain checked; this batch checks only 4.1, 4.2 and 4.4. Task 4.3 and all other markers remain untouched.
- Files: new `src/export/save-gcode.ts`, `src/export/save-gcode.test.ts`, `src/instrumentation/panel.ts`, `src/instrumentation/panel.test.ts`; only three checkboxes in `tasks.md` and this appendix. Claude owns `src/main.ts` and `index.html`; neither was edited here.

### PR 4 Work Unit Evidence

| Evidence | Observed result |
|---|---|
| Focused tests | `npx.cmd vitest run src/export/save-gcode.test.ts src/instrumentation/panel.test.ts`: exit 0; 2 files, 20 tests passed. Node fakes verify synchronous share, MIME selection, cancellation and download cleanup. |
| Full suite | `npx.cmd vitest run`: exit 0; 6 files, 100 tests passed, including existing log reload-persistence coverage. |
| Typecheck | `npm.cmd run typecheck`: exit 0; no diagnostics, including Claude's current wiring. |
| Build | `npx.cmd vite build`: exit 0; 9 modules, 197 ms. Ignored `dist/` regenerated; no fetch/prebuild invoked. |
| Runtime harness | Not run in this batch: user assigns WebKit DOM smoke to Claude. Node fakes are not browser evidence; actual iPad Files/PWA retrievability and 10/50/100 MB share remain unverified. |
| Rollback boundary | Remove the four new export/panel files, revert only the three task checkboxes and this appendix; coordinate removal of dependent PR4 wiring with Claude, preserving PR1-PR3. |

- Deviations: explicit handoff refines the older spec's blanket rejection fallback: AbortError returns cancelled without downloading. `PanelMetrics` has no error field; latest engine-error context is shown separately in the panel. Empty MIME candidates reject with TypeError. `.cmd` launchers avoid PowerShell policy restrictions; npm offline mode was enabled.
- Budget: 236 new source/test lines + 6 checkbox additions/deletions + 24 appendix lines = 266 authored changed lines; observed concurrent wiring adds 72, totaling 338/400 at this snapshot.
- Next: Claude's task 4.3/browser smoke, independent SDD verification, then PR5 probe/multithread. No design/spec/proposal or PR1-PR3 implementation files changed.

### PR 4 Wiring and Browser Verification (Claude)

Status: done. Task 4.3 is checked; 4.1, 4.2 and 4.4 were reviewed and verified by Claude.

- 4.3: `src/main.ts` adds a Save G-code button that calls `saveGcode` synchronously inside the tap handler, a `record()` helper that appends to the log and re-renders the panel, an error state (`#engine-status.error`), and log export via `saveFile`. `index.html` adds the save button, the panel section and minimal touch-sized styles.
- Review: `saveFile` invokes `navigator.share` before its first await; AbortError maps to cancelled; the download fallback revokes after 60 s. The panel renders with textContent only.

| Evidence | Observed result |
|---|---|
| Full suite | `npx vitest run`: 6 files / 100 tests passed. |
| Typecheck | `npm run typecheck`: exit 0. |
| Build | `npm run build` (prebuild fetch-engine, cache hits): exit 0; index 7.83 kB, engine.worker 12.60 kB. |
| Browser smoke (Playwright 1.55 WebKit, dist served from https://slicer.test with COOP/COEP/CORP) | 4 of 5 runs fully green: engine ready (st, streaming) ~540-620 ms, slice ~590-800 ms, G-code 292,819 B (G28, M109 220, M190 60, 100 layers); Save fell back to download (no Web Share in WebKit) with suggested name cube.gcode and identical byte length; panel rendered metrics, 8+ recent entries and Export/Clear buttons; cancel restarted the engine in ~0.6 s. One earlier run failed at the cancel step with "Target page, context or browser has been closed" and no crash event; it did not reproduce in 4 later runs. |

- Open risks: the intermittent cancel failure should be watched on device; `crossOriginIsolated` stayed false under the Playwright route (verify on the Cloudflare deploy); real Web Share on iPad Safari and the PWA remains untested.
- Changed lines (authored): about 308 (72 tracked in main/index + 236 new in export/panel and tests), within the 400 budget.

## PR 5 Probe/Multithread - Codex Tasks 5.1 and 5.2

Status: assigned tasks complete; Node harness supports 5.3. Prior sections are preserved verbatim.

- Context: spec-driven, openspec/hybrid, applyState ready from proposal/design/spec/tasks/R2 and prior progress; standard mode, strict TDD off; repository edit root.
- Delivery: auto-chain, stacked-to-main; PR 1 -> PR 2 -> PR 3 -> PR 4 -> **PR 5 (current)**. Review disabled/unmanaged; no Git mutations, network, installs or remote operations.
- Cumulative state: 1.1-4.4 remain checked; only 5.1/5.2 checked here. Claude owns 5.3/5.4; device task 5.5 remains unverified.
- Files: new src/engine/probe.ts and probe.test.ts; extended scripts/slice-check.mjs and package.json; two task markers and this appendix. Claude-owned files and engine-bridge exports are untouched.
- Probe: ordered fallback checks, programming-error RangeError, one reusable fixed allocation (16384 pages / 1 GiB), MT_THREADS=4; 12 fake-based tests. Harness accepts --variant st|mt and --size, retains assertions and bounds the startup pthread pool to eight.

### PR 5 Work Unit Evidence

| Evidence | Observed result |
|---|---|
| Focused / full tests | npx.cmd vitest run src/engine/probe.test.ts: exit 0, 12 tests; npx.cmd vitest run: exit 0, 7 files / 112 tests. |
| Typecheck | npm.cmd run typecheck: exit 0, no diagnostics, including concurrent wiring. |
| Default st | npm.cmd run slice-check: exit 0; sliceMs=753.2101, gcodeBytes=292819, memoryBytes=268435456, 100 layers. |
| Fixed-memory mt | npm.cmd run slice-check:mt: exit 0; sliceMs=811.0413, gcodeBytes=292819, memoryBytes=1073741824, 100 layers; clean exit. |
| Larger st | node scripts/slice-check.mjs --variant st --size 60: exit 0; sliceMs=2169.6921, gcodeBytes=3733909, memoryBytes=268435456, 300 layers. |
| Larger mt | node scripts/slice-check.mjs --variant mt --size 60: exit 0; sliceMs=1869.8623, gcodeBytes=3733909, memoryBytes=1073741824, 300 layers; clean exit. |
| Rollback boundary | Remove both probe files and only this harness/package delta, 5.1/5.2 markers and appendix; coordinate dependent Claude wiring separately. Preserve PR1-PR4. |

- Initial mt failure: ReferenceError [Error]: require is not defined in ES module scope, you can use import instead (slicer-mt.js:25:13). Root type=module classified the cached CommonJS pthread script as ESM. Harness-only scoped Worker bootstrap compiles that exact file as CommonJS; absolute mainScriptUrlOrBlob and fixed wasmMemory remain unchanged. No cache edits.
- Diagnostic: INITIAL_MEMORY=1073741824 without wasmMemory passed once after the bootstrap fix (937.913 ms); never retained. Two earlier stdin diagnostic-launch attempts failed with ERR_INPUT_TYPE_NOT_ALLOWED before slicing because workers inherited --input-type; corrected by using plain Node stdin.
- Budget: 158 implementation/test/package changed lines + 4 checkbox lines + 27 appendix lines = 189 authored additions plus deletions, excluding concurrent Claude changes. No source compression or unrelated edits.
- Risks / next: Node timings are single-run observations, not device performance evidence; fixed 1 GiB allocation and Safari pthread startup still require task 5.5. Bootstrap uses Node internal Module._compile/_nodeModulePaths. Independent SDD verification remains with the orchestrator; no review actors launched.

### PR 5 Multithread Wiring and Browser Verification (Claude)

Status: done. Tasks 5.3 and 5.4 are checked; 5.1, 5.2 and the Node multithread harness were reviewed and re-verified by Claude. Task 5.5 (on-device iPad) remains human/remote.

- 5.3 `engine.worker.ts`: `probeThreading()` chooses the variant. For mt it passes `Module.wasmMemory` = the probe fixed shared memory (16384 pages, 1 GiB, initial === maximum), `mainScriptUrlOrBlob` = absolute `slicer-mt.js` URL (pthreads load the raw classic script), and overrides `navigator.hardwareConcurrency` to `MT_THREADS` = 4 (pool 8). `ready` carries the probe reason.
- 5.4 `main.ts`/`index.html`: a variant select (auto/st/mt). The choice lives in `?variant=` and a change reloads the page. Auto prefers mt when cross-origin isolated. Cancel restarts the worker for mt; for st it is a soft cancel that discards the result when it arrives.

| Evidence | Observed result |
|---|---|
| Full suite | `npx vitest run`: 7 files / 112 tests passed. |
| Typecheck / build | `npm run typecheck` exit 0; `npx vite build` exit 0 (engine.worker 13.70 kB). |
| Node harness (Codex, re-read by Claude) | mt with fixed 1 GiB shared memory slices byte-identical G-code to st: 20 mm cube 292,819 B; 60 mm cube 3,733,909 B, st 2170 ms vs mt 1870 ms (single runs). |
| WebKit isolation (real Node server with COOP/COEP) | crossOriginIsolated true; a 16384-page shared WebAssembly.Memory allocates 1,073,741,824 B. Playwright route.fulfill had reported false (harness artifact). |
| WebKit smoke, mt (4 runs) | Engine ready (mt, streaming) ~300-350 ms; slice ~800-840 ms; identical 292,819 B G-code; save download matches; cancel restart ready ~300-440 ms; no crash. |
| WebKit smoke, st soft cancel (3 runs) | Slice ~590 ms; save matches; cancel discards the in-flight result and returns "engine ready"; no crash. |
| WebKit crash diagnosis | Terminate + new st worker: 3/3 crash. Page reload to st after st: crash, also after a 3 s delay; mt -> st reload: crash; st -> mt reload: ok. The st build defines non-shared growable memory (256 MiB min, 4 GiB max), so a second st engine instance in the same WebKit process crashes. |

- Open risks: switching the select to st after any engine already loaded in the page process can still crash WebKit (the first st load in a fresh process works); confirm on iPad Safari. A durable fix needs an OrcaWasm st build with a lower MAXIMUM_MEMORY or imported memory. Node slice-check mt relies on internal Node module APIs (test-only).
