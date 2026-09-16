```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:5c9cf3167d853ff634985f6154c1ba17a7ed50d466f6c7d168ed3bd625556996
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 17/17
scenarios: 23/23
test_command: npx.cmd vitest run
test_exit_code: 0
test_output_hash: sha256:7e742a1d7f9826dcfba99e298340967ac5b74a1c29cb771a57b62e13f682402e
build_command: npm.cmd run build
build_exit_code: 0
build_output_hash: sha256:be7823d50794ef3ece5773cfd301ef8ddd7efa710b2f9b7f8c671b6e301a3040
```

## Verification Report

**Change**: wasm-slicing-spike
**Version**: N/A (spike, pre-archive)
**Mode**: Standard (Strict TDD off)
**Re-verify context**: This supersedes the prior FAIL report on disk. New evidence
(evidence/post-save-retrievability-2026-09-15.md + evidence/ipad-air-m2-safari-26.6.1-2026-09-15.json)
was weighed against the current code, which now also carries touch-slicing-ui's
concurrent in-progress changes (32/82 of its tasks checked; the spike-relevant code
paths it modifies per its MODIFIED specs -- multi-object slicing, catalog-driven
profiles, Diagnostics-only panel -- are not yet implemented, so the spike specs below
were verified against what the code does today, not against touch-slicing-ui's future
target state).

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 35 |
| Tasks complete | 35 |
| Tasks incomplete | 0 |

All 35 tasks across Phases 1-8 remain checked in tasks.md, matching apply-progress.md's cumulative task-state ledger. No regression: unchanged since the prior FAIL verify.

### Build & Tests Execution

Commands re-run fresh in this pass, offline, .engine-cache/ present, no downloads:

**Build**: PASSED
```text
npm.cmd run build
prebuild: fetch-engine cache hit (st, mt) + catalog:verify (6 packs, 63 smoke-gated combos)
vite build -> 47 modules transformed; dist/index.html, dist/harness.html, engine.worker-CK0zwc3q.js 13.70 kB,
  app-DSZpsg_X.js 65.23 kB, harness-CVTYO74y.js 8.91 kB, built in 622ms
postbuild: LICENSE copied to dist/LICENSE
exit 0
```

**Tests (full repo)**: 186 passed / 0 failed / 0 skipped, 20 files
```text
npx.cmd vitest run
Test Files  20 passed (20)
Tests  186 passed (186)
exit 0
```
The repo-wide count grew from 117 (prior verify) to 186 because touch-slicing-ui added
i18n/app/tier/catalog/settings/storage/ui test files. Re-running only the spike-owned
subset (src/instrumentation src/export src/engine src/worker src/testing) still yields
exactly 8 files / 117 tests passed, identical to the prior verify -- confirming
touch-slicing-ui's concurrent work has not regressed anything the spike specs require.

**Typecheck**:
```text
npm.cmd run typecheck (tsc --noEmit)
exit 0, no diagnostics
```

**slice-check (single-thread, Node harness)**:
```text
npm.cmd run slice-check
exit 0: variant st, sliceMs 1034.55, gcodeBytes 292819, memoryBytes 268435456 (256 MiB), 100 layers
temperatures M104 [150,220,0], M109 [220], M140 [60,0], M190 [60] match the bundled Ender-3 V2 / PLA profile
```

**slice-check:mt (multithread, Node harness)**:
```text
npm.cmd run slice-check:mt
exit 0: variant mt, sliceMs 937.25, gcodeBytes 292819, memoryBytes 1073741824 (1 GiB fixed), 100 layers
same G-code byte length as st (byte-identical output confirmed)
```

**Coverage**: Not configured / Not available

### Spec Compliance Matrix

#### wasm-slicing-engine (5 requirements, 8 scenarios) -- unchanged since prior verify

| Requirement | Scenario | Test / Evidence | Result |
|---|---|---|---|
| Engine Loading in Worker | Successful load | Device log engine-ready (loadPath streaming, loadMs 1665.28); stream-loader.test.ts | COMPLIANT |
| Engine Loading in Worker | Load failure surfaces error | stream-loader.test.ts failure branches; engine.worker.ts error stage load; harness #engine-status.error; not exercised end-to-end on device | PARTIAL |
| Bundled Profile Application | Profile applied before slicing | npm run slice-check correct temps (M104/M109/M140/M190) before slice completes; device slice-done entries carry matching G-code | COMPLIANT |
| STL Slicing With Progress and Cancel | Reference STL slices without crash | Device log: 10 MB / 20 MB / 50 MB slice-done, no crash (task 7.4/7.5) | COMPLIANT |
| STL Slicing With Progress and Cancel | User cancels mid-slice | mt: WebKit smoke, cancel restart ~300-440ms, no crash. st: documented deviation, cancel is soft (worker keeps running, result discarded on arrival) because terminating and re-instantiating the st engine in the same WebKit process crashes | PARTIAL |
| Thread-Variant Selection via Probe | Probe succeeds, isolation active | Device log: crossOriginIsolated true, probe fixed shared memory 1024 MiB, engine-ready variant mt | COMPLIANT |
| Thread-Variant Selection via Probe | Probe fails or isolation absent | probe.test.ts 12 tests (mock success/throw); never triggered on the tested device | COMPLIANT (unit-test only) |
| Single-Thread Memory Ceiling | Peak memory within ceiling | slice-check (Node, up to 60MB-equivalent cube): 268,435,456 B (256 MiB), well under approximately 1GB. Desktop WebKit ladder: st peak heap flat at 256 MB for 1/10/20MB spheres, 50MB st was not run in a real browser. On the iPad, isolation was always true so the device auto-selected mt for every run; the exact scenario was never directly exercised | PARTIAL |

Subtotal: 5/8 compliant, 3/8 partial -- same as prior verify; src/worker/engine.worker.ts still uses the single, bundled profiles/ender3v2-020-pla.json profile and start/end-only progress, so touch-slicing-ui's MODIFIED profile/progress requirements have not yet reached this code path.

#### gcode-export (3 requirements, 4 scenarios) -- RE-VERIFIED with new device evidence

| Requirement | Scenario | Test / Evidence | Result |
|---|---|---|---|
| Primary Save via Web Share | Share completes successfully | Device log: gcode-save method share, mimeType text/x.gcode (10MB run, task 7.4) | COMPLIANT |
| Download Fallback | Fallback triggers automatically | save-gcode.test.ts 20 tests; Playwright WebKit smoke: Save fell back to download (no Web Share in WebKit), identical byte length | COMPLIANT |
| Post-Save Retrievability | File retrievable in Files app | evidence/post-save-retrievability-2026-09-15.md: maintainer confirms the shared G-code was saved to, remained visible in, and opened successfully from the Files app on the same iPad Air M2 / Safari 26.6.1 session used for the rest of the device evidence | COMPLIANT (caveat -- see below) |
| Post-Save Retrievability | PWA context does not dead-end | Same evidence file: maintainer confirms saving from the installed home-screen PWA opened the share flow and that returning to the PWA preserved the loaded model and usable state | COMPLIANT (caveat -- see below) |

Subtotal: 4/4 compliant (2 with an evidence-strength caveat), 0/4 partial, 0/4 untested

Honest evidence-strength assessment for the two caveated scenarios: Unlike the isolation/timing/G-code claims in this change, which are backed by a raw exported instrumentation log (evidence/ipad-air-m2-safari-26.6.1-2026-09-15.json -- machine-recorded page-load, engine-ready, slice-done, gcode-save entries), the Files-app and PWA-round-trip confirmations are NOT present as events in that JSON log. They exist only as prose in evidence/post-save-retrievability-2026-09-15.md, recorded by a prior Codex session relaying the maintainer's direct statement, not captured by this verifier and not captured by any on-device instrumentation. That makes this weaker, single-source, single-session evidence: no screenshot or file-listing artifact, no iPadOS 17/18 coverage, and it cannot be independently cross-checked against a machine log the way the rest of the device evidence can. It is nonetheless genuine first-person human confirmation of the exact scenario text, on the exact device/browser already used for every other device claim in this report, consistent with how every other Human/remote device-confirmed scenario in this change (e.g. isolated-hosting's crossOriginIsolated check) has been treated as covering evidence throughout this change's verification history. Net judgment: sufficient to lift these two scenarios out of a blocking classification, but not strong enough to call them equivalent to the log-backed COMPLIANT items -- hence COMPLIANT-with-caveat, tracked as a WARNING below rather than silently upgraded to an unqualified pass.

#### isolated-hosting (5 requirements, 6 scenarios) -- unchanged since prior verify

| Requirement | Scenario | Test / Evidence | Result |
|---|---|---|---|
| Cross-Origin Isolation Headers | Isolation active in production | Device log crossOriginIsolated true; task 7.3 desktop Playwright WebKit over real HTTPS confirmed isolated | COMPLIANT |
| Same-Origin WASM Delivery Within Platform Limits | Engine instantiates despite 25MiB cap | check-deploy.mjs: st 9,010,325 B / mt 9,370,936 B gzip, single part each, 0 FAIL; device loadPath streaming, loadMs 1665.28 | COMPLIANT |
| Same-Origin WASM Delivery Within Platform Limits | Isolation preserved by delivery mechanism | Same device log entry: isolated true with mt (delivery mechanism) active | COMPLIANT |
| Correct WASM Content-Type | Streaming compile receives wasm content type | stream-loader.test.ts; device loadPath streaming succeeded (Safari enforces application/wasm for instantiateStreaming) | COMPLIANT |
| Git-Connected Deployment | Branch preview available for device testing | Task 7.2: non-production branch builds enabled in Cloudflare dashboard (configuration only). No evidence of an actual push producing a working preview URL with matching headers | PARTIAL |
| PWA and License Compliance | License and manifest reachable | LICENSE 404 gap found and fixed in 8.2 (postbuild copy), re-verified HTTP 200 / 34,523 bytes against a local server only; not re-confirmed against the live Cloudflare deployment after the fix | PARTIAL |

Subtotal: 4/6 compliant, 2/6 partial -- no new evidence was provided for this spec in this pass; findings carried forward unchanged.

#### spike-instrumentation (4 requirements, 5 scenarios) -- unchanged since prior verify

| Requirement | Scenario | Test / Evidence | Result |
|---|---|---|---|
| Slice Metrics Capture | Metrics recorded per attempt | Device log: every slice-done carries variant, model, gcodeBytes, sliceMs, peakHeapBytes; engine-ready carries loadMs/loadPath | COMPLIANT |
| Persisted On-Device Log | Log survives reload | log.test.ts reload-persistence coverage (fake storage, Node); real-device log survival across an actual reload remains unconfirmed | PARTIAL |
| Error Capture | Probe fallback is logged | Code fix in 8.2 (probe-fallback log entry); probe.test.ts/main.ts wiring unit-tested; never triggered on the tested device (isolation was always true, mt always selected) | PARTIAL |
| Error Capture | Share rejection is logged | Code fix in 8.2 (shareError + engine-error stage export); save-gcode.test.ts covers rejection branches; device only saw AbortError-class dismissal (method: cancelled in the new JSON log) and success, never a genuine non-abort rejection | PARTIAL |
| Cross-Origin Isolation Assertion | Isolation status visible | panel.test.ts; device page-load log entry carries crossOriginIsolated true | COMPLIANT |

Subtotal: 2/5 compliant, 3/5 partial -- no new evidence was provided for this spec in this pass; findings carried forward unchanged.

Compliance summary: 15/23 scenarios fully compliant (2 of those with an evidence-strength caveat), 8/23 partial (evidence exists but incomplete/indirect), 0/23 untested (no covering evidence). This is an improvement from the prior verify's 13/23 compliant, 8/23 partial, 2/23 untested -- the 2 previously-untested CRITICAL scenarios are now covered by direct evidence, at reduced-but-nonzero evidentiary strength.

Note on the yaml envelope's requirements/scenarios counts (17/17, 23/23): those integers
report zero remaining CRITICAL (UNTESTED/FAILING) requirements or scenarios, which is what the
validator's completed/total fields gate for a passing verdict. They do NOT claim all 23 scenarios
are flawlessly COMPLIANT -- 8 remain PARTIAL, listed above and tracked as WARNINGs below. Read the
matrices and the WARNING list, not just the envelope integers, for the true compliance picture.

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| EngineManifest/ToWorker/FromWorker contracts (design.md) | Implemented | protocol.ts message-shape guards, 34 tests |
| Stream loader (concat, sniff, gunzip, streaming/buffered fallback) | Implemented | stream-loader.ts plus tests |
| Fixed-memory multithread probe | Implemented | probe.ts, fixed 16384-page (1 GiB) shared memory, MT_THREADS=4 |
| G-code export (share + Blob fallback) | Implemented | save-gcode.ts |
| Instrumentation log and panel | Implemented | log.ts (500-entry ring buffer), panel.ts, now wired from src/harness/main.ts (moved from src/main.ts by touch-slicing-ui Slice 1a; behavior unchanged) |
| _headers COOP/COEP/CORP, immutable /engine/* | Implemented | public/_headers; confirmed via check-deploy.mjs 0 FAIL |
| AGPL-3.0 LICENSE served | Implemented (fixed in 8.2) | postbuild copy; verified locally, not re-verified against the live deployment |

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Gzipped static parts streamed and gunzipped into instantiateStreaming (option D) | Yes | Both st/mt fit one part (<20 MiB); device loadPath streaming confirms the primary path was used, not the buffered fallback |
| Cancel via worker.terminate() then re-create | Partially | True for mt. For st the implementation deviates to a soft cancel (worker not terminated, result discarded) because terminate+reinstantiate crashes WebKit for st specifically. Documented as a deliberate, evidence-based deviation, not an oversight |
| Profile via onewasm_init plus flat orca.native-json (not onewasm_init_profile/FS.readFile) | Yes | Stale spec/design text was corrected in 8.2 to match; code and Node harness confirm the ABI actually used; still true today |
| Cloudflare Workers static assets plus Workers Builds Git integration | Yes | wrangler.jsonc, deployed, live per task 7.1/7.2 |
| Instrumentation via localStorage ring buffer, no remote debugger | Yes | log.ts, 500-entry cap; unaffected by the harness's move to src/harness/main.ts |

### Issues Found

**CRITICAL**: None

Both previously CRITICAL findings (Files-app retrievability, PWA save round-trip) are resolved by
evidence/post-save-retrievability-2026-09-15.md and downgraded to a WARNING reflecting the
evidence's actual strength (see the caveat discussion above), not silently cleared.

**WARNING**:
1. gcode-export / Post-Save Retrievability: both scenarios now pass on direct maintainer confirmation, but that confirmation is prose from a prior session, not a raw device log entry, screenshot, or file-listing artifact; it is single-session and has no iPadOS 17/18 coverage. Recommend capturing a screenshot or Files-app listing on the next real device session to convert this into log-grade evidence.
2. wasm-slicing-engine / Single-Thread Memory Ceiling: the literal 50MB-on-single-thread-in-Safari scenario was never exercised on the device because isolation was always true there and mt was auto-selected; only Node-harness and desktop-WebKit-up-to-20MB evidence exists for st memory.
3. wasm-slicing-engine / User cancels mid-slice: single-thread cancel is a documented soft cancel deviation from the design terminate()-based cancel, due to a WebKit crash re-instantiating the st engine; behaviorally acceptable (UI returns to ready, no crash) but not literally the worker stops slicing.
4. isolated-hosting / Git-Connected Deployment: non-production branch builds are enabled in the Cloudflare dashboard but no evidence a branch push actually produced a working preview URL with the required headers.
5. isolated-hosting / PWA and License Compliance: the LICENSE-404 fix (8.2) was verified against a local server only; the live Cloudflare deployment was not re-checked after the fix (the deployment 0-FAIL check-deploy run predates the fix).
6. spike-instrumentation: Log survives reload, Probe fallback is logged, and Share rejection is logged are unit-tested but never exercised on the real device (no reload test, no real probe failure, no genuine share rejection occurred there; the new device log's only save-related non-success event is method: cancelled, a sheet dismissal, not a rejection).
7. PR 3 authored change size (about 528 lines) exceeded the 400-line review budget; the maintainer explicitly authorized a ledger reset / single-commit exception in apply-progress.md, so this is a documented exception, not an unresolved gap.
8. iPadOS 17/18 were never tested (only iPad Air M2 / Safari 26.6.1 evidence exists); no progress-percentage UI exists (only start/end progress, a known engine-release limitation).
9. touch-slicing-ui is a concurrent, in-progress change (32/82 tasks checked) that has already moved the spike harness from src/main.ts to src/harness/main.ts and reorganized the build into a multi-page app+harness setup. This verify confirms the spike-owned test subset (117/117) and the spike-relevant runtime harnesses (slice-check st/mt) are unaffected today, but the spike specs' MODIFIED-by-touch-slicing-ui requirements (multi-object slicing, catalog-driven per-slice profiles, Diagnostics-only instrumentation) are not yet implemented, so this spike's specs remain the correct target for the harness code path and should be re-checked again if touch-slicing-ui reaches those phases before this change archives.

**SUGGESTION**:
1. Capture a screenshot or an on-device Files-app listing (or at minimum a recorded screen capture) of the retrieved G-code file and the PWA round trip, to upgrade the two caveated gcode-export scenarios to full log-grade evidence.
2. Re-run check-deploy.mjs against the live Cloudflare URL after the LICENSE postbuild fix to close the isolated-hosting PARTIAL.
3. Consider a targeted single-thread 50MB Safari run (for example, temporarily forcing variant=st) to directly close the memory-ceiling scenario instead of relying on proxy evidence.

### Verdict
**PASS WITH WARNINGS**

All 35/35 tasks are complete. The full test suite (186/186 repo-wide, 117/117 on the spike-owned
subset -- identical to the prior verify), typecheck, build, and both slice-check harnesses are green.
The two previously CRITICAL gcode-export scenarios (Files-app retrievability, PWA save round-trip)
now have direct maintainer device confirmation recorded in evidence/post-save-retrievability-2026-09-15.md
and are no longer blocking; that evidence is honestly weaker than this change's log-backed device
evidence (no raw log entry, single session, no screenshot), so they are recorded as COMPLIANT with an
explicit caveat and a WARNING, not silently upgraded to an unqualified pass. 15/23 scenarios are now
fully compliant (up from 13/23), 8/23 remain partial with honestly-documented gaps, and 0/23 are
untested (down from 2/23). None of the remaining partials represent a proven functional break; they
are open items consistent with apply-progress.md's own gap list, and none were newly introduced or
worsened by the concurrent touch-slicing-ui work, which was independently confirmed not to have
regressed the spike-owned test subset.

**Archive readiness**: READY. No CRITICAL blockers remain. The 9 WARNING items are honestly-documented,
non-blocking follow-ups appropriate to close out a feasibility spike (evidence-strength gaps, a
Cloudflare branch-preview check, a post-fix live-deployment re-check, and device coverage limited to a
single iPad Air M2 / Safari 26.6.1 session) rather than proof of a functional failure. Recommend
archiving this change and tracking the WARNING items as follow-up device-verification tasks, most of
which are naturally superseded by touch-slicing-ui's own device-testing phases as that change
progresses.
