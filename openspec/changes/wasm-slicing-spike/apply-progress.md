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
