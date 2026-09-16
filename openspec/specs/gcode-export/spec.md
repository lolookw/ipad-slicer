# gcode-export Specification

## Purpose

Save the sliced G-code as a file the user can retrieve afterward, primarily via Web Share with a download fallback, working in both Safari tab and home-screen PWA.

## Requirements

### Requirement: Primary Save via Web Share

The system MUST attempt `navigator.share({ files })` with the produced `.gcode` File, gated behind an explicit user gesture, when `navigator.canShare` reports the file is shareable.

#### Scenario: Share completes successfully

- GIVEN a slice has produced a `.gcode` file
- WHEN the user taps Save/Share
- THEN the share sheet opens and the file is saved to the user's chosen destination

### Requirement: Download Fallback

The system MUST fall back to an `<a download>` Blob-based download when Web Share is unavailable, `canShare` returns false, or the share attempt fails/is rejected.

#### Scenario: Fallback triggers automatically

- GIVEN `navigator.share` is unavailable or rejects
- WHEN the user attempts to save the G-code
- THEN the system downloads the file via Blob URL without requiring a second user action to discover the fallback

### Requirement: Post-Save Retrievability

The saved G-code file MUST be retrievable by the user after the save/share flow completes, in both a Safari tab and a home-screen-installed PWA context.

#### Scenario: File retrievable in Files app

- GIVEN the user saved a G-code file via share or download
- WHEN the user later opens the Files app or Downloads
- THEN the exact `.gcode` file produced by the slice is present and openable

#### Scenario: PWA context does not dead-end

- GIVEN the harness runs as a home-screen PWA
- WHEN the user completes the save flow
- THEN the user can return to the running app without losing context
