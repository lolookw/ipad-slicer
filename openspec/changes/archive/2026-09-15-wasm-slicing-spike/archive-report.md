# Archive Report: wasm-slicing-spike

**Change**: wasm-slicing-spike  
**Archived**: 2026-09-15  
**Status**: ARCHIVED — PASS WITH WARNINGS, archive-ready  
**Mode**: openspec/hybrid  

## Executive Summary

The wasm-slicing-spike feasibility change has been fully implemented, verified, and archived. This is a technical spike validating WASM-based slicer capability on iPad Safari, not a shipped product feature; the product continuation is the concurrent touch-slicing-ui change already in progress. All 35 implementation tasks are complete. The full test suite (186 tests, 117 on spike-owned code), typecheck, build, and both slice-check harnesses are green. Device evidence on iPad Air M2 / Safari 26.6.1 confirms cross-origin isolation, streaming WASM compile, slicing without crash, and file retrieval via Web Share and the Files app. Archive contains 9 tracked but non-blocking warning items appropriate to a feasibility spike; no CRITICAL blockers remain.

## Artifacts Archived

**Location**: `openspec/changes/archive/2026-09-15-wasm-slicing-spike/`

### Contents Verified ✓
- `proposal.md` — feasibility scope and approach
- `design.md` — architecture decisions and contracts
- `tasks.md` — 35/35 complete (all [x] checked)
- `apply-progress.md` — implementation ledger and per-PR commitments
- `verify-report.md` — verification verdict (PASS WITH WARNINGS)
- `specs/` — 4 delta specs synced to main specs (see Spec Sync below)
- `evidence/` — device test logs and post-save retrievability confirmation
- `exploration.md`, `research.md` — discovery and research artifacts

## Spec Sync Summary

**All 4 delta specs synced to main specs (new, not deltas):**

| Domain | File | Lines | Notes |
|--------|------|-------|-------|
| wasm-slicing-engine | `openspec/specs/wasm-slicing-engine/spec.md` | 75 | 5 requirements, 8 scenarios (Partial: 5/8 compliant) |
| gcode-export | `openspec/specs/gcode-export/spec.md` | 43 | 3 requirements, 4 scenarios (All compliant; 2 with evidence-strength caveat) |
| spike-instrumentation | `openspec/specs/spike-instrumentation/spec.md` | 53 | 4 requirements, 5 scenarios (Partial: 2/5 compliant) |
| isolated-hosting | `openspec/specs/isolated-hosting/spec.md` | 63 | 5 requirements, 6 scenarios (Partial: 4/6 compliant) |

**Readback verification**: All 4 specs confirmed identical (diff -r) to delta sources.

**Source of truth updated**: openspec/specs/ is the authoritative specification for this change's capabilities; all four specs now live there and remain accessible for future reference and delta updates.

## Task Completion Gate ✓

**Result**: PASS — all 35 implementation tasks marked [x] complete  

Per tasks.md:
- Phase 1 (Scaffold, Headers, Log): 5/5 ✓
- Phase 2 (Fetch, Stream Loader): 5/5 ✓
- Phase 3 (Worker, Profile, Single-Thread): 6/6 ✓
- Phase 4 (Export, Panel): 4/4 ✓
- Phase 5 (Probe, Multithread): 5/5 ✓
- Phase 6 (Contingency): 1/1 ✓ (not triggered)
- Phase 7 (Deploy, Device): 5/5 ✓
- Phase 8 (Verification): 2/2 ✓

No unchecked implementation tasks remain. Archive proceeds without exceptional reconciliation.

## Verification Summary

**Verdict** (per verify-report.md): **PASS WITH WARNINGS**

### Completeness
- **Tasks**: 35/35 complete
- **Tests**: 186 passed (repo-wide); 117/117 on spike-owned subset (identical to prior verify)
- **Build**: `npm run build` ✓ — 47 modules, dist built in 622 ms
- **Typecheck**: `tsc --noEmit` ✓ — zero diagnostics
- **Slice harness**: Single-thread and multithread both green

### Device Evidence (Authoritative)

**Device**: iPad Air M2, Safari 26.6.1

- **Cross-origin isolation**: Active (crossOriginIsolated = true)
- **WASM delivery**: Streaming compile via `instantiateStreaming` (loadMs 1665.28)
- **Slicing performance**: 
  - 10 MB: 3.5 s (multithread)
  - 20 MB: 4.1 s (multithread)
  - 50 MB: 6.6 s (multithread)
  - No crashes observed
- **G-code save**: Web Share succeeded with `text/x.gcode` MIME type
- **File retrieval**: Saved G-code confirmed visible and retrievable in the Files app (post-save-retrievability-2026-09-15.md)
- **PWA round-trip**: Saving from the installed home-screen PWA preserved state and returned successfully

### Spec Compliance Matrix (23 scenarios)

- **Compliant**: 15/23 (2 of those with evidence-strength caveat)
- **Partial**: 8/23 (complete coverage list below)
- **Untested**: 0/23

**Previously CRITICAL scenarios now resolved:**
- `gcode-export / Post-Save Retrievability (Files app)` — COMPLIANT (caveat: maintainer prose confirmation, not raw log entry)
- `gcode-export / Post-Save Retrievability (PWA)` — COMPLIANT (caveat: maintainer prose confirmation, not raw log entry)

These two scenarios moved from CRITICAL (blocking archive) to COMPLIANT-with-caveat (non-blocking WARNING), backed by evidence/post-save-retrievability-2026-09-15.md.

## Warnings (9 Items — Non-Blocking Follow-Ups)

Per verify-report.md and explicit final-state facts:

1. **gcode-export / Post-Save Retrievability (evidence strength)**: Files-app and PWA confirmations are maintainer prose (not raw device log entries); no screenshot or file-listing artifact; single session on a single device. Recommend capturing a screenshot or Files-app listing on the next device session to upgrade to log-grade evidence.

2. **wasm-slicing-engine / Single-Thread Memory Ceiling (scenario untested on device)**: The literal 50 MB on single-thread in Safari was never exercised on the device because cross-origin isolation was always true and multithread was auto-selected. Only Node harness and desktop WebKit (up to 20 MB) evidence exists for single-thread memory. Desktop single-thread up to 20 MB stayed at 256 MB peak heap.

3. **wasm-slicing-engine / User cancels mid-slice**: Single-thread cancel is a documented soft-cancel deviation (worker kept running, result discarded on arrival) because terminating and re-instantiating the single-thread engine in the same WebKit process crashes. Multithread cancel via `terminate()` works as designed. Behaviorally acceptable (UI returns to ready state) but not literally worker-stops-slicing.

4. **isolated-hosting / Git-Connected Deployment (branch preview)**: Non-production branch builds are enabled in Cloudflare dashboard (configuration only). No evidence that an actual branch push produced a working preview URL with required headers. Recommend pushing a test branch and verifying the preview URL once to close this item.

5. **isolated-hosting / PWA and License Compliance (live deployment check)**: LICENSE 404 gap was found and fixed in phase 8.2 (postbuild copy). Verified against local server only. The live Cloudflare deployment was not re-checked after the fix (prior check-deploy run predates the LICENSE fix). Recommend re-running check-deploy.mjs against the live deployment to confirm HTTP 200 / 34,523 bytes.

6. **spike-instrumentation / Persisted On-Device Log (reload survival)**: Log reload-persistence is unit-tested (log.test.ts, fake storage on Node); actual device reload survival across a real session reload remains unconfirmed. Recommended: reload the app on the next device session and confirm the log persists.

7. **spike-instrumentation / Error Capture (probe fallback)**: Probe fallback is unit-tested (probe.test.ts); never triggered on the device because cross-origin isolation was always true and multithread was selected every time. Code path exists and is correct, but lacks real device exercise. If probe ever fails in production, this scenario will be covered.

8. **spike-instrumentation / Error Capture (share rejection)**: Share rejection is unit-tested (save-gcode.test.ts rejection branches); device only saw AbortError-class dismissal (sheet closed by user) and success, never a genuine network or permission rejection. Code path exists and is correct, but lacks real device exercise of this scenario.

9. **Device coverage (iPadOS versions)**: iPad Air M2 / Safari 26.6.1 is the only tested device. iPadOS 17/18 variants were never tested (only iPadOS ~26.x evidence exists). Recommend testing on a device running iPadOS 17 to confirm behavior is consistent.

**Relationship to touch-slicing-ui**: The concurrent touch-slicing-ui change (32/82 tasks checked) has moved the spike harness from `src/main.ts` to `src/harness/main.ts` and reorganized the build. The spike-owned test subset (117/117) remains unaffected and green. Touch-slicing-ui's MODIFIED spec requirements (multi-object slicing, catalog-driven profiles, Diagnostics-only panel) are not yet implemented; spike specs remain correct for current code. Recommend re-checking spike specs against touch-slicing-ui once its multi-object and profile phases complete.

## Correctness (Static Evidence)

| Requirement | Status | Notes |
|---|---|---|
| EngineManifest/ToWorker/FromWorker contracts | Implemented | protocol.ts message-shape guards, 34 tests |
| Stream loader (concat, sniff, gunzip, streaming/buffered fallback) | Implemented | stream-loader.ts plus tests; device confirmed streaming path active |
| Fixed-memory multithread probe | Implemented | probe.ts, fixed 1 GiB shared memory, MT_THREADS=4 |
| G-code export (share + Blob fallback) | Implemented | save-gcode.ts; device confirmed share succeeded |
| Instrumentation log and panel | Implemented | log.ts (500-entry ring buffer), panel.ts, wired from src/harness/main.ts |
| _headers COOP/COEP/CORP, immutable /engine/* | Implemented | public/_headers; check-deploy.mjs confirmed 0 FAILs |
| AGPL-3.0 LICENSE served | Implemented (fixed in 8.2) | postbuild copy; verified locally, not re-verified on live deployment |

## Coherence (Design)

All major design decisions are followed:

- **Gzipped static parts**: Streamed and gunzipped into `instantiateStreaming` ✓ (device confirms loadPath: streaming)
- **Cancel mechanism**: worker.terminate() + re-create for multithread ✓; soft cancel (documented deviation) for single-thread ✓
- **Profile application**: Via onewasm_init + flat orca.native-json ✓ (spec text corrected in 8.2)
- **Deployment**: Cloudflare Workers static assets + Workers Builds Git integration ✓
- **Instrumentation**: localStorage ring buffer, no remote debugger ✓

## Review Workload Forecast

Per tasks.md:

| Item | Value |
|------|-------|
| Estimated changed lines | ~1400–1800 across 5 code slices |
| Per-slice average | ~250–350 lines |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main (user decision 2026-09-15) |
| PR 3 size exception | Yes — ~528 lines, explicitly authorized by maintainer in apply-progress.md, documented ledger reset |

## Archive Readiness Confirmation

✓ All 35 tasks complete  
✓ No CRITICAL findings (0 blockers remain)  
✓ 9 warnings documented (all non-blocking, appropriate to a feasibility spike)  
✓ Device evidence recorded for all major scenarios  
✓ 4 specs synced to openspec/specs/ (source of truth updated)  
✓ All artifacts present and verified (proposal, design, tasks, apply-progress, verify-report, evidence)  
✓ Archive folder moved to `openspec/changes/archive/2026-09-15-wasm-slicing-spike/`  
✓ Active change directory (`openspec/changes/wasm-slicing-spike/`) removed  

**Verdict**: Archive is READY. This change is complete and closed.

## SDD Cycle Summary

**Phases executed**: Explore, Research, Propose, Spec, Design, Tasks, Apply (5 chained PRs), Verify, Archive  

**Outcome**: Technical feasibility spike on iPad Safari WASM slicing is validated and archived. All capability specs are now stored in the main openspec/specs/ directory. Device evidence confirms the primary delivery mechanisms work on real hardware without crashes. 9 non-blocking follow-up items are tracked as future device-verification tasks; most will be naturally superseded by the concurrent touch-slicing-ui change as that work progresses toward production.

**Next recommended step**: Archive this change and transition focus to touch-slicing-ui production phases.
