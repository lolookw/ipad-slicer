# Proposal: Touch-First Slicing UI

## Intent

The repo ships a measurement harness: one hardcoded profile, sub-44pt controls, no preview. Replace it with a free, touch-first iPad slicer PWA on the existing OrcaSlicer 2.4.2 WASM worker.

## Scope

### In Scope
- SolidJS shell: Import → Configure → Slice → Preview → Save; EN/ES selector; iPadOS 17+; 44pt targets, safe areas, both orientations, dark mode
- One adaptive build: feature detection plus Standard/Full toggle
- Curated catalog (BBL, Prusa, Creality, Elegoo, Anycubic, Voron): lazy per-printer packs, index, compatibility filter, generic PLA/PETG/ABS, custom printer; smoke-tested combos only
- Simple mode (≤10 controls), advanced by Orca category, client validation and bounds
- IndexedDB presets with JSON export/import; per-object brim/supports
- 3D viewer, touch gizmo, auto-orient/arrange, scaling with units
- Time/filament/cost readout; G-code toolpath preview
- Offline service worker; diagnostics section

### Out of Scope
- Next: link import, LAN send, support painting, slice history, Pencil, OBJ/STEP/3MF, multi-extruder
- Excluded: Bambu LAN printing

## Capabilities

### New Capabilities
- `app-shell`: flow, i18n, adaptive tiers, touch layout
- `profile-catalog`: packs, index, compatibility, custom printer
- `slice-settings`: settings model, modes, validation, presets
- `model-workspace`: import, viewer, gizmo, orient/arrange, scaling
- `slice-results`: estimates, toolpath preview
- `offline-pwa`: service worker caching under COOP/COEP

### Modified Capabilities
- `wasm-slicing-engine`: selected per-slice profile replaces bundled one; multi-object transforms; cancel semantics
- `spike-instrumentation`: moves behind diagnostics

## Approach

Keep the worker protocol; send the resolved profile plus validated overrides per slice. Evolve `resolve-profile.mjs` into a catalog builder. Read estimates from statistics or G-code header. three.js viewer; `<gcode-preview>` Web Component, lines only.

Chained PRs (auto-chain; >800 lines splits):
1. Shell, i18n, adaptive tiers
2. Catalog builder, packs
3. Settings, validation, presets
4. Viewer, gizmo, arrange
5. Slice integration, estimates (harness removed)
6. Toolpath preview
7. Offline PWA, diagnostics

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `index.html`, `src/main.ts` | Modified | Harness → app |
| `src/worker/` | Modified | Dynamic profile, multi-object |
| `scripts/resolve-profile.mjs`, `profiles/` | Modified | Catalog builder |
| `src/app/`, `src/settings/`, `src/viewer/`, `src/preview/`, `public/sw.js` | New | App modules |
| `src/instrumentation/` | Modified | Diagnostics |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Spike device results change budgets | High | Gate PRs 4–6 on iPad numbers |
| Engine + WebGL exceed iOS memory | High | Lines-only, visible layers |
| Invalid enums silently ignored | Certain | Pinned client schema |
| Per-object settings unsupported | Med | Verify `slice_stl_multi` early |
| No progress; hard cancel restarts worker | Certain | Indeterminate UI |
| SW with COOP/COEP unverified | Med | Prototype in PR 7 |

## Rollback Plan

Roll back the Cloudflare deployment; revert PRs newest-first. Data stays local; a kill-switch release unregisters the service worker.

## Dependencies

- `wasm-slicing-spike` device findings and archive (modified-spec baseline)
- three.js, camera-controls, ChestnutLabs `gcode-preview`, SolidJS

## Success Criteria

- [ ] A catalog printer slices end to end on iPad
- [ ] Every shipped combo passes the smoke test
- [ ] Controls ≥44pt in both orientations and languages
- [ ] Invalid values blocked before slicing
- [ ] Toolpath preview within ~150 MB WebGL
- [ ] Installed app reopens offline
- [ ] Each PR ≤800 changed lines
