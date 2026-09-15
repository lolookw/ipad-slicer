# Research: wasm-slicing-spike

Selected lanes: R1, R2, R3, R4 (user-selected 2026-09-15). R5 (Windows iPad debugging) not selected.
Engram mirrors: `sdd/wasm-slicing-spike/research-r1` … `research-r4`, decisions in `sdd/wasm-slicing-spike/decisions`.

## Confirmed product decisions

- License: AGPL-3.0 accepted; source is public.
- Spike hosting: Cloudflare Pages (native `_headers` for COOP/COEP).
- Pass/fail thresholds: a 20–50MB reference STL slices without tab crash/OOM on a mainstream iPad; peak memory under ~1GB for single-thread; G-code is saved or shared as a file retrievable afterward; multithread is a stretch goal, not a blocker.

## R1 — Saving G-code on iOS/iPadOS Safari

Status: done (evidence-bounded).

- `<a download>` + Blob URL regresses across releases: iOS 17.4.1 blob breakage fixed in 17.5 ([Apple forums 751063](https://developer.apple.com/forums/thread/751063)); iOS 18.2–18.3 Files-app visibility bug fixed in 18.4 dev ([Apple forums 769229](https://developer.apple.com/forums/thread/769229)).
- Standalone PWA download dead-end (no way back into the app) since Safari 15; moved out of WebKit scope to Apple Radar, not publicly fixed ([WebKit 236943](https://bugs.webkit.org/show_bug.cgi?id=236943)).
- `data:` URLs inflate ~33% and approach mobile Safari page-memory crash territory ([lapcatsoftware](https://lapcatsoftware.com/articles/2026/1/7.html)). Avoid.
- Web Share Level 2 `navigator.share({ files })` supported since iOS 15, gesture-gated, share sheet offers Save to Files ([adactio](https://adactio.medium.com/the-web-share-api-in-safari-on-ios-a192dd607a0e), [MDN canShare](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/canShare)). No documented MIME allowlist or size cap — unverified for `.gcode` at 50–100MB.
- Service Worker streaming download (Safari 15.4+, [WebKit 202142](https://bugs.webkit.org/show_bug.cgi?id=202142)) avoids double in-memory buffering; regressed in 18.2–18.3, fixed in 18.4 ([StreamSaver.js #373](https://github.com/jimmywarting/StreamSaver.js/issues/373)).
- Blob memory kills observed at 1.41GB while 227MB succeeded (StreamSaver.js #373): 50–100MB is likely fine but device-dependent.
- No iOS 26.x-specific evidence for any mechanism.

**Recommendation:** primary Web Share (`canShare` → `share({ files })`) from the user gesture; fallback `<a download>` with a Blob URL (or Service Worker streaming). Test both in Safari tab and home-screen PWA on iOS 18.x and 26.x at 10/50/100MB.

## R2 — Multithread WASM on iPadOS

Status: done.

- Growable shared memory + threads crashes on iPadOS 26.2, fine through 26.1; open ([emscripten #25905](https://github.com/emscripten-core/emscripten/issues/25905)).
- iOS 16.4 `shared: true` OOM with default 2GiB maximum; WebKit bug still NEW ([WebKit 255103](https://bugs.webkit.org/show_bug.cgi?id=255103), [emscripten #19144](https://github.com/emscripten-core/emscripten/issues/19144)). Recurring defect class.
- Gigacage ~1.88GB cap on an 8GB iPad; reportedly raised by bug 272232, new ceiling unverified ([WebKit 268816](https://bugs.webkit.org/show_bug.cgi?id=268816)).
- Cloudflare Pages `_headers` can set COOP/COEP ([Cloudflare docs](https://developers.cloudflare.com/pages/configuration/headers/)); community reports of it not applying are unverified — confirm in Web Inspector.
- ffmpeg.wasm recommends single-thread in production ([ffmpeg.wasm #294](https://github.com/ffmpegwasm/ffmpeg.wasm/issues/294)); Godot 4.3 defaults to single-thread web export because threads fail on iOS ([Godot blog](https://godotengine.org/article/progress-report-web-export-in-4-3/)).
- `ALLOW_MEMORY_GROWTH` with pthreads is slow/fragile ([Emscripten pthreads](https://emscripten.org/docs/porting/pthreads.html)).

**Recommendation:** single-thread is GO and primary. Multithread with growable memory is NO-GO. Multithread with fixed memory (`-sALLOW_MEMORY_GROWTH=0`, `INITIAL_MEMORY == MAXIMUM_MEMORY`, small `PTHREAD_POOL_SIZE`) is a conditional GO behind an on-device `new WebAssembly.Memory({ shared: true })` probe that falls back to single-thread.

## R3 — Minimal OrcaSlicer profile

Status: done (with gaps).

- Presets resolve through `inherits` by preset name; `instantiation: "true"` marks selectable leaves.
- Ender-3 V2 0.4 machine leaf ([raw JSON](https://raw.githubusercontent.com/OrcaSlicer/OrcaSlicer/main/resources/profiles/Creality/machine/Creality%20Ender-3%20V2%200.4%20nozzle.json)): `nozzle_diameter ["0.4"]`, `printable_area` 220×220, `printable_height 250`; inherits `fdm_creality_common` (`gcode_flavor marlin`, `retraction_length 5`, start/end G-code) → `fdm_machine_common` (`resources/profiles/Custom/machine/`).
- Process leaf `0.20mm Standard @Creality Ender3V2`: `layer_height 0.2`, ~99 keys.
- Filament `Generic PLA @Creality…`: max volumetric speed 18; temperature values UNVERIFIED — re-read the raw JSON before use.
- CLI loads per-tab exported JSON: `--load-settings "process.json;printer.json" --load-filaments filament.json` ([OrcaSlicer wiki](https://www.orcaslicer.com/wiki/cli/cli_mode)).
- OrcaWasm `onewasm_init_profile` accepts a flattened `project.3mf`; no bundled vendor profiles ([OrcaWasm](https://github.com/Hiosdra/OrcaWasm)).
- three-slicer bundles extracted preset catalogs (`three-slicer/data`); `slice(stl, params)` takes sparse keys over a bundled preset ([Web_Three_Slicer](https://github.com/kimgh06/Web_Three_Slicer)).
- `resources/profiles` is covered by the repo AGPL-3.0 ([LICENSE.txt](https://raw.githubusercontent.com/OrcaSlicer/OrcaSlicer/main/LICENSE.txt)).
- Gaps: PrintConfig.cpp defaults not retrieved; process/filament global bases unverified; one summarized raw fetch returned inconsistent JSON — always verify raw files directly.

## R4 — Candidate bases

Status: completed (with gaps). Revises the exploration's ranking.

| | OrcaWasm | three-slicer | orcaslicer-wasm |
|---|---|---|---|
| License | AGPL-3.0 | kernel AGPL-3.0-or-later, viewer MIT | LICENSE AGPL-3.0 but NOTICE.md says "all rights reserved" |
| Last activity | release `wasm-v2.4.2-patch19`, 2026-09-12 | npm 0.3.0, 2026-09-08 | 2025-10-27 (stale) |
| Upstream | OrcaSlicer v2.4.2 | not documented | v2.3.1 |
| Artifacts | `slicer.wasm` 38.1MB, `slicer-mt.wasm` 37.3MB | 13.6MB unpacked (incl. viewer) | `slicer.data` 150.8MB |
| Threading | single + multithread | not documented | single only |
| Progress / cancel | documented (`onewasm_set_progress_callback`, `PrintBase::cancel`) | not documented | not documented |
| Profiles | caller supplies flattened `project.3mf` | bundled preset catalogs | — |

Sources: [OrcaWasm](https://github.com/Hiosdra/OrcaWasm), [OrcaWasm latest release](https://api.github.com/repos/Hiosdra/OrcaWasm/releases/latest), [three-slicer npm](https://registry.npmjs.org/three-slicer), [Web_Three_Slicer](https://github.com/kimgh06/Web_Three_Slicer), [orcaslicer-wasm LICENSE](https://raw.githubusercontent.com/allanwrench28/orcaslicer-wasm/main/LICENSE), [orcaslicer-wasm NOTICE.md](https://raw.githubusercontent.com/allanwrench28/orcaslicer-wasm/main/NOTICE.md).

**Recommendation:** OrcaWasm primary, three-slicer secondary pending source inspection, orcaslicer-wasm rejected. The 38MB download is itself a cold-load risk to measure.

## Open questions for on-device testing

1. Web Share acceptance of a real G-code `File` at 10/50/100MB, Safari tab vs PWA.
2. `crossOriginIsolated` actually true on Cloudflare Pages on iPad.
3. Shared memory allocation probe at target size; fixed-memory multithread build across iPadOS 18.x, 26.0/26.1, 26.2+.
4. Peak memory and slice time for the reference STL ladder, single vs multithread.
5. Cold download + instantiate time for the 38MB wasm.
