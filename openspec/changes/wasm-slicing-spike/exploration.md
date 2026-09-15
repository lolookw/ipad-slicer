## Exploration: WASM OrcaSlicer engine on iPad Safari — technical spike

### Current State
Greenfield repo (no source code, no commits). This is a pre-code technical-feasibility spike for a free, touch-first, iPad-native web app that slices STL files client-side using an OrcaSlicer-derived WASM engine and lets the user download G-code, positioned as a UX-focused alternative to existing (functional but iPad-unfriendly) web slicers.

### Affected Areas
None (no code exists yet). This exploration informs the base-engine choice and hosting/runtime constraints that the eventual proposal and spike tasks will target.

### Candidate Bases

| Candidate | License | Activity | OrcaSlicer version | API surface | Notes |
|---|---|---|---|---|---|
| **OrcaWasm** (https://github.com/Hiosdra/OrcaWasm) | AGPL-3.0 | 145 commits, CI builds, 3 open issues | v2.4.2 (tags `wasm-v2.4.2*`, newest of the three) | Low-level C API (`onewasm_slice_stl`, `onewasm_slice_stl_multi`, `onewasm_init`/`onewasm_init_profile`) via Emscripten virtual FS; ships `slicer.js/.wasm` (single-thread) and `slicer-mt.js/.wasm` (multithread, needs COOP/COEP) as GitHub Release artifacts; no npm package | README does not mention iOS/Safari (unverified for iPad). Demo site https://hiosdra.github.io/OrcaWeb/ is 404 — not evidence of engine failure, just broken deployment. Requires Emscripten 3.1.74 to build. |
| **orcaslicer-wasm** (https://github.com/allanwrench28/orcaslicer-wasm) | LICENSE file present, type not confirmed (unverified) | 51 commits, 0 open issues, 0 PRs, 2 stars/2 forks — low community signal | v2.3.1 (older) | Node.js headless test workflow (`node scripts/test-slicer.js --stl ... --out ...gcode`); browser integration via manually staged `slicer.js/.wasm` in `web/public/wasm/` | Very low external engagement is a maintenance-risk flag. No npm package, no formal releases. No iOS/Safari mention. |
| **Three Slicer / Web_Three_Slicer** (https://github.com/kimgh06/Web_Three_Slicer, site https://slicer.kimgh06.com/) | Dual-licensed: `three-slicer` kernel AGPL-3.0-or-later (derived from OrcaSlicer), `three-slicer-viewer` MIT | 237 commits, 4 open issues, 1 open PR, test suites + release automation — most active of the three | Not pinned in README (unverified) | Two npm packages: `three-slicer` (headless: `const s = await createSlicer(); s.slice(stl, params)`) and `three-slicer-viewer` (React `<Viewport/>`, three.js). Also supports SLA slicing via ported PrusaSlicer 2.9.6 chain. | Best maintenance signal. Its demo UX is poor per user, but the kernel package is separable from its viewer/UI — a custom touch-first UI can be built on the headless kernel. |
| Own Emscripten build of libslic3r | AGPL-3.0 (upstream) | N/A — full control | Latest OrcaSlicer | Full control of exposed API | Highest effort/risk; only justified if all existing WASM ports fail the spike's pass/fail bar. |

**License implication (verified):** all candidates and an own build are AGPL-3.0/AGPL-3.0-or-later. Any derivative served over the web must make corresponding source available to users (AGPL §13, network-use clause). Source: https://github.com/OrcaSlicer/OrcaSlicer and repo-level LICENSE files above.

**Recommendation for spike base:** Three Slicer's `three-slicer` kernel package is the strongest starting candidate on maintenance signal and API ergonomics. OrcaWasm is the second candidate — newest upstream version (v2.4.2) and ships both single-thread/multithread artifacts, useful for the required comparison. orcaslicer-wasm is deprioritized.

### iPad Safari Constraints

- **WASM memory ceiling on iPad:** practical in-page budgets observed around 1.37–1.88GB (WebKit bug https://bugs.webkit.org/show_bug.cgi?id=268816, "iPad with 8GB of RAM offers only 1.88GB of RAM to a website"). Bounds usable STL/mesh size. Exact number per current iPadOS/hardware is unverified; the spike should measure it.
- **SharedArrayBuffer / COOP+COEP:** supported on iOS/iPadOS Safari since 16.4, gated behind cross-origin isolation (`Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`). Sources: MDN COEP docs, https://blog.agektmr.com/en/2021/11/cross-origin-isolation.html.
- **Multithread build risk on iOS Safari:** growable shared memory on iOS 26.2 crashes with "RuntimeError: Out of bounds memory access" (https://github.com/emscripten-core/emscripten/issues/25905), and an earlier iOS 16.4 regression caused "WASM Out Of Memory with shared=true" (https://bugs.webkit.org/show_bug.cgi?id=255103). Reported workaround: `shared:false` / single-thread. Multithread should be tested defensively; single-thread is the safe path.
- **GitHub Pages cannot set COOP/COEP headers.** Options: (a) `coi-serviceworker` (https://github.com/gzuidhof/coi-serviceworker) — generic, but an unverified report mentions iOS-specific problems; (b) Cloudflare Pages or Netlify with native `_headers` config — lower risk, free-tier friendly.
- **Memory64:** Chrome ≥133 and Firefox ≥143 support it; Safari support is immature as of 2026 (https://webstatus.dev/features/wasm-memory64, https://caniuse.com/wf-wasm-memory64). Design around the ~2GB wasm32 ceiling.
- **Web Workers:** broadly supported in Safari/iPadOS; no new risk.
- **File import:** `<input type="file">` works in iOS Safari and installed PWAs and can source from the Files app; File System Access API is not supported and not needed. Source: https://firt.dev/notes/pwa-ios/.
- **G-code download in Safari — significant UX risk:** the `download` attribute has historically not reliably saved to Files on iOS Safari; iOS 18.2/18.5 have documented blob-URL bugs where files get stuck in a temporary Safari cache (https://github.com/eligrey/FileSaver.js/issues/12, https://developer.apple.com/forums/thread/751063, https://discussions.apple.com/thread/256063732). A `navigator.share({ files: [...] })` fallback may be needed.
- **PWA / EU caveat:** since March 2024, PWAs run inside regular Safari tabs for EU users (DMA). Affects later installed-PWA assumptions, not the spike. Source: https://firt.dev/notes/pwa-ios/.

### Spike Measurement Plan

**What to measure:**
- Peak WASM heap during slicing (Emscripten memory-growth hook, logged in-page — Safari does not expose `performance.measureUserAgentSpecificMemory`).
- Slice time for reference STLs of increasing size (calibration cube, ~10MB, ~50MB+), single-thread vs multithread.
- Bundle download size and WASM compile/instantiate time (cold vs warm cache).
- Pass/fail on G-code download producing a retrievable file.

**How to measure on a real iPad from Windows (no Mac):**
1. Preferred: ios-webkit-debug-proxy (https://github.com/google/ios-webkit-debug-proxy) or the maintained kit https://github.com/HimbeersaftLP/ios-safari-remote-debug-kit, bridged to Chrome DevTools, with Safari Web Inspector enabled on the device. Unverified against latest iOS/Windows drivers; validate at kickoff.
2. Fallback: in-page instrumentation (on-screen debug panel or IndexedDB log) capturing memory growth, timers, and errors — needed regardless to catch crashes outside a debugger session.
3. Real-device cloud (BrowserStack/Sauce Labs) as a secondary option — cost/free-tier fit unverified.

**Draft pass/fail thresholds (need product-owner confirmation):**
- A mid-size reference STL (~20–50MB) slices on a mainstream iPad without tab crash or OOM.
- Peak memory under ~1GB for the single-thread build.
- Generated G-code downloads or shares as a file the user can find afterward.
- Multithread build is a stretch goal, not a blocker.

### Printer/Filament Profiles
`OrcaSlicer/resources/profiles` (https://github.com/OrcaSlicer/OrcaSlicer/tree/main/resources/profiles) is organized by manufacturer folder, each with a manufacturer JSON plus nested printer/process/filament JSONs, and a `Custom` folder. The minimal-field schema for one valid printer+filament+process combination still needs a direct read of an actual profile JSON before the spike hardcodes a config.

### Risks (ranked)

1. **G-code download reliability on iOS Safari** (High, evidence-backed) — core product promise; validate on device early, with a Web Share API fallback.
2. **Multithread WASM stability on recent iPadOS** (High, evidence-backed) — single-thread primary, multithread measured but optional.
3. **Peak memory ceiling for realistic STL sizes** (Medium-High, partially verified) — may force an explicit max model size.
4. **AGPL-3.0 network-use obligation** (Medium, verified, product-level) — needs explicit confirmation before proposal.
5. **coi-serviceworker reliability on iOS** (Medium, unverified) — test directly or use a header-capable host.
6. **orcaslicer-wasm license and maintenance** (Low-Medium, unverified).
7. **Minimal valid profile schema** (Low, small follow-up).
8. **Windows-only iPad debugging workflow** (Low-Medium, unverified) — smoke-test at kickoff.

### Candidate Research Lanes
- **R1 — G-code download/save behavior on current iOS Safari:** `download` attribute vs Web Share API reliability across recent iOS/iPadOS versions.
- **R2 — Multithread WASM stability on current iPadOS:** consolidate WebKit/Emscripten bug reports into a go/no-go for the multithread path.
- **R3 — Minimal valid OrcaSlicer printer+filament+process profile JSON.**
- **R4 — orcaslicer-wasm exact license and freshness.**
- **R5 — Windows-based iPad Safari remote debugging setup.**

### Product Decisions Needed Before Proposal
- Accept the AGPL-3.0 source-availability obligation for the hosted app.
- Confirm or adjust draft pass/fail thresholds (max STL size, memory ceiling, timing).
- Choose spike hosting (GitHub Pages + coi-serviceworker vs Cloudflare Pages/Netlify with native headers).

### Ready for Proposal
No — run sdd-research for R1 and R2 first; R3–R5 can fold into spike task-writing. Confirm the three product decisions before proposal.
