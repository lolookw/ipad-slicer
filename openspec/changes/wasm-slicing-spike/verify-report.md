```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:fd2dd7f0aff02d3fc859aa31c089c7aff9c87f899477205cb4d45876a90a9fe6
verdict: fail
blockers: 2
critical_findings: 2
requirements: 9/17
scenarios: 13/23
test_command: npx.cmd vitest run
test_exit_code: 0
test_output_hash: sha256:b4bf28b8cbd1767b030a561ab54ce707b88988e7fa760b6ae1eeb575ba982bee
build_command: npm.cmd run build
build_exit_code: 0
build_output_hash: sha256:77289cd6b61cbdaa11214a8d8d7271d0a0029897ec2d7c943ea3610a238268f8
```

## Verification Report

**Change**: wasm-slicing-spike
**Version**: N/A (spike, pre-archive)
**Mode**: Standard (Strict TDD off)

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 35 |
| Tasks complete | 35 |
| Tasks incomplete | 0 |

All 35 tasks across Phases 1-8 are checked in tasks.md, matching apply-progress.md cumulative task-state ledger.

### Build & Tests Execution

**Build**: PASSED
```text
npm.cmd run build
prebuild: node scripts/fetch-engine.mjs -> cache hit (st, mt), no downloads (offline, .engine-cache present)
vite build -> 10 modules transformed, dist/index.html 2.23 kB, engine.worker-CK0zwc3q.js 13.70 kB, index-D27rq1Wk.js 10.78 kB, built in 308ms
postbuild: LICENSE copied to dist/LICENSE
exit 0
```

**Tests**: 117 passed / 0 failed / 0 skipped
```text
npx.cmd vitest run
Test Files  8 passed (8)
Tests  117 passed (117)
exit 0
```

**Typecheck**:
```text
npm.cmd run typecheck (tsc --noEmit)
exit 0, no diagnostics
```

**slice-check (single-thread, Node harness)**:
```text
npm.cmd run slice-check
exit 0: variant st, sliceMs 736.07, gcodeBytes 292819, memoryBytes 268435456 (256 MiB), 100 layers
temperatures M104 [150,220,0], M109 [220], M140 [60,0], M190 [60] match the bundled Ender-3 V2 / PLA profile
```

**slice-check:mt (multithread, Node harness)**:
```text
npm.cmd run slice-check:mt
exit 0: variant mt, sliceMs 933.83, gcodeBytes 292819, memoryBytes 1073741824 (1 GiB fixed), 100 layers
same G-code byte length as st (byte-identical output confirmed)
```

**Coverage**: Not configured / Not available

### Spec Compliance Matrix

#### wasm-slicing-engine (5 requirements, 8 scenarios)

| Requirement | Scenario | Test / Evidence | Result |
|---|---|---|---|
| Engine Loading in Worker | Successful load | Device log engine-ready (loadPath streaming, loadMs 1665.28); stream-loader.test.ts | COMPLIANT |
| Engine Loading in Worker | Load failure surfaces error | stream-loader.test.ts failure branches; engine.worker.ts error stage load; main.ts #engine-status.error; not exercised end-to-end on device | PARTIAL |
| Bundled Profile Application | Profile applied before slicing | npm run slice-check correct temps (M104/M109/M140/M190) before slice completes; device slice-done entries carry matching G-code | COMPLIANT |
| STL Slicing With Progress and Cancel | Reference STL slices without crash | Device log: 10 MB / 20 MB / 50 MB slice-done, no crash (task 7.4/7.5) | COMPLIANT |
| STL Slicing With Progress and Cancel | User cancels mid-slice | mt: WebKit smoke, cancel restart ~300-440ms, no crash. st: documented deviation, cancel is soft (worker keeps running, result discarded on arrival) because terminating and re-instantiating the st engine in the same WebKit process crashes | PARTIAL |
| Thread-Variant Selection via Probe | Probe succeeds, isolation active | Device log: crossOriginIsolated true, probe fixed shared memory 1024 MiB, engine-ready variant mt | COMPLIANT |
| Thread-Variant Selection via Probe | Probe fails or isolation absent | probe.test.ts 12 tests (mock success/throw); never triggered on the tested device | COMPLIANT (unit-test only) |
| Single-Thread Memory Ceiling | Peak memory within ceiling | slice-check (Node, up to 60MB-equivalent cube): 268,435,456 B (256 MiB), well under approximately 1GB. Desktop WebKit ladder: st peak heap flat at 256 MB for 1/10/20MB spheres, 50MB st was not run in a real browser. On the iPad, isolation was always true so the device auto-selected mt for every run; the exact scenario was never directly exercised | PARTIAL |

Subtotal: 5/8 compliant, 3/8 partial

#### gcode-export (3 requirements, 4 scenarios)

| Requirement | Scenario | Test / Evidence | Result |
|---|---|---|---|
| Primary Save via Web Share | Share completes successfully | Device log: gcode-save method share, mimeType text/x.gcode (10MB run, task 7.4) | COMPLIANT |
| Download Fallback | Fallback triggers automatically | save-gcode.test.ts 20 tests; Playwright WebKit smoke: Save fell back to download (no Web Share in WebKit), identical byte length | COMPLIANT |
| Post-Save Retrievability | File retrievable in Files app | No direct confirmation found. apply-progress.md explicitly lists Files-app visibility as not confirmed (task 7.4). Share completed successfully (proxy signal only) | UNTESTED |
| Post-Save Retrievability | PWA context does not dead-end | Add to Home Screen works (task 7.4) confirms install only, not the save-then-return-to-app round trip specified by this scenario. No dedicated test/evidence found | UNTESTED |

Subtotal: 2/4 compliant, 0/4 partial, 2/4 untested

#### isolated-hosting (5 requirements, 6 scenarios)

| Requirement | Scenario | Test / Evidence | Result |
|---|---|---|---|
| Cross-Origin Isolation Headers | Isolation active in production | Device log crossOriginIsolated true; task 7.3 desktop Playwright WebKit over real HTTPS confirmed isolated | COMPLIANT |
| Same-Origin WASM Delivery Within Platform Limits | Engine instantiates despite 25MiB cap | check-deploy.mjs: st 9,010,325 B / mt 9,370,936 B gzip, single part each, 0 FAIL; device loadPath streaming, loadMs 1665.28 | COMPLIANT |
| Same-Origin WASM Delivery Within Platform Limits | Isolation preserved by delivery mechanism | Same device log entry: isolated true with mt (delivery mechanism) active | COMPLIANT |
| Correct WASM Content-Type | Streaming compile receives wasm content type | stream-loader.test.ts; device loadPath streaming succeeded (Safari enforces application/wasm for instantiateStreaming) | COMPLIANT |
| Git-Connected Deployment | Branch preview available for device testing | Task 7.2: non-production branch builds enabled in Cloudflare dashboard (configuration only). No evidence of an actual push producing a working preview URL with matching headers | PARTIAL |
| PWA and License Compliance | License and manifest reachable | LICENSE 404 gap found and fixed in 8.2 (postbuild copy), re-verified HTTP 200 / 34,523 bytes against a local server only; not re-confirmed against the live Cloudflare deployment after the fix | PARTIAL |

Subtotal: 4/6 compliant, 2/6 partial

#### spike-instrumentation (4 requirements, 5 scenarios)

| Requirement | Scenario | Test / Evidence | Result |
|---|---|---|---|
| Slice Metrics Capture | Metrics recorded per attempt | Device log: every slice-done carries variant, model, gcodeBytes, sliceMs, peakHeapBytes; engine-ready carries loadMs/loadPath | COMPLIANT |
| Persisted On-Device Log | Log survives reload | log.test.ts reload-persistence coverage (fake storage, Node); apply-progress.md explicitly lists log survival across a real reload as a remaining partial | PARTIAL |
| Error Capture | Probe fallback is logged | Code fix in 8.2 (probe-fallback log entry); probe.test.ts/main.ts wiring unit-tested; never triggered on the tested device | PARTIAL |
| Error Capture | Share rejection is logged | Code fix in 8.2 (shareError + engine-error stage export); save-gcode.test.ts covers rejection branches; device only saw AbortError-class dismissal and success | PARTIAL |
| Cross-Origin Isolation Assertion | Isolation status visible | panel.test.ts; device page-load log entry carries crossOriginIsolated true | COMPLIANT |

Subtotal: 2/5 compliant, 3/5 partial

Compliance summary: 13/23 scenarios fully compliant, 8/23 partial (evidence exists but incomplete/indirect), 2/23 untested (no covering evidence)

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| EngineManifest/ToWorker/FromWorker contracts (design.md) | Implemented | protocol.ts message-shape guards, 34 tests |
| Stream loader (concat, sniff, gunzip, streaming/buffered fallback) | Implemented | stream-loader.ts plus tests |
| Fixed-memory multithread probe | Implemented | probe.ts, fixed 16384-page (1 GiB) shared memory, MT_THREADS=4 |
| G-code export (share + Blob fallback) | Implemented | save-gcode.ts |
| Instrumentation log and panel | Implemented | log.ts (500-entry ring buffer), panel.ts |
| _headers COOP/COEP/CORP, immutable /engine/* | Implemented | public/_headers; confirmed via check-deploy.mjs 0 FAIL |
| AGPL-3.0 LICENSE served | Implemented (fixed in 8.2) | postbuild copy; verified locally, not re-verified against the live deployment |

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Gzipped static parts streamed and gunzipped into instantiateStreaming (option D) | Yes | Both st/mt fit one part (<20 MiB); device loadPath streaming confirms the primary path was used, not the buffered fallback |
| Cancel via worker.terminate() then re-create | Partially | True for mt. For st the implementation deviates to a soft cancel (worker not terminated, result discarded) because terminate+reinstantiate crashes WebKit for st specifically. Documented as a deliberate, evidence-based deviation, not an oversight |
| Profile via onewasm_init plus flat orca.native-json (not onewasm_init_profile/FS.readFile) | Yes | Stale spec/design text was corrected in 8.2 to match; code and Node harness confirm the ABI actually used |
| Cloudflare Workers static assets plus Workers Builds Git integration | Yes | wrangler.jsonc, deployed, live per task 7.1/7.2 |
| Instrumentation via localStorage ring buffer, no remote debugger | Yes | log.ts, 500-entry cap |

### Issues Found

**CRITICAL**:
1. gcode-export / Post-Save Retrievability: File retrievable in Files app has zero direct confirmation; apply-progress.md itself lists this as unconfirmed. A MUST scenario with no covering evidence.
2. gcode-export / Post-Save Retrievability: PWA context does not dead-end (save flow round-trip while installed as a home-screen app) has no dedicated test or device confirmation beyond a general Add to Home Screen works note.

**WARNING**:
1. wasm-slicing-engine / Single-Thread Memory Ceiling: the literal 50MB-on-single-thread-in-Safari scenario was never exercised on the device because isolation was always true there and mt was auto-selected; only Node-harness and desktop-WebKit-up-to-20MB evidence exists for st memory.
2. wasm-slicing-engine / User cancels mid-slice: single-thread cancel is a documented soft cancel deviation from the design terminate()-based cancel, due to a WebKit crash re-instantiating the st engine; behaviorally acceptable (UI returns to ready, no crash) but not literally the worker stops slicing.
3. isolated-hosting / Git-Connected Deployment: non-production branch builds are enabled in the Cloudflare dashboard but no evidence a branch push actually produced a working preview URL with the required headers.
4. isolated-hosting / PWA and License Compliance: the LICENSE-404 fix (8.2) was verified against a local server only; the live Cloudflare deployment was not re-checked after the fix (the deployment 0-FAIL check-deploy run predates the fix).
5. spike-instrumentation: Log survives reload, Probe fallback is logged, and Share rejection is logged are unit-tested but never exercised on the real device (no reload test, no real probe failure, no genuine share rejection occurred there).
6. PR 3 authored change size (about 528 lines) exceeded the 400-line review budget; the maintainer explicitly authorized a ledger reset / single-commit exception in apply-progress.md, so this is a documented exception, not an unresolved gap.
7. iPadOS 17/18 were never tested (only iPad Air M2 / Safari 26.6.1 evidence exists); no progress-percentage UI exists (only start/end progress, a known engine-release limitation).

**SUGGESTION**:
1. Add an automated or scripted on-device check (or at minimum a manual checklist item) for Files-app retrievability and PWA round-trip before treating the gcode-export capability as production-ready.
2. Re-run check-deploy.mjs against the live Cloudflare URL after the LICENSE postbuild fix to close the isolated-hosting PARTIAL.
3. Consider a targeted single-thread 50MB Safari run (for example, temporarily forcing variant=st) to directly close the memory-ceiling scenario instead of relying on proxy evidence.

### Verdict
**FAIL**

All 35/35 tasks are complete, the full test suite (117/117), typecheck, build, and both slice-check harnesses are green, and the spike core feasibility questions (10-50MB STL slicing without crash, memory well under 1GB via strong proxy evidence, G-code export success, cross-origin isolation, multithread with graceful fallback, deployment) are backed by real device evidence from the iPad Air M2 / Safari 26.6.1 run. This is not a build or runtime failure: every automated command is green. It is a spec-compliance failure by the strict rule that an untested MUST scenario is CRITICAL and blocks a passing verdict. Two gcode-export scenarios (Files-app retrievability, PWA save round-trip) have zero direct confirmation, and 8 of 23 scenarios across the other three specs have only partial or indirect evidence rather than a full passing covering test or device confirmation. None of these represent a proven functional break; they are honestly-documented open items consistent with apply-progress.md own gap list. Recommended path: run the two CRITICAL on-device checks (Files app, PWA round-trip) plus the SUGGESTION items, then re-verify; this change is close to a clean PASS but is not yet archive-ready under the strict spec-scenario rule.
