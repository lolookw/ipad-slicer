# spike-instrumentation Specification

## Purpose

Capture and persist on-device measurements (memory, timing, load cost, errors) needed to make the go/no-go decision, since testing happens on an iPad with no attached Mac/devtools.

## Requirements

### Requirement: Slice Metrics Capture

The system MUST capture peak heap, slice duration, wasm download+instantiate duration, and the thread-variant used, for each slice attempt.

#### Scenario: Metrics recorded per attempt

- GIVEN a slice attempt completes (success or failure)
- WHEN instrumentation runs
- THEN peak heap, slice duration, load duration, and thread-variant are recorded for that attempt

### Requirement: Persisted On-Device Log

The system MUST persist captured metrics and errors on-device so they survive a page reload and can be reviewed without external tooling.

#### Scenario: Log survives reload

- GIVEN metrics were recorded before a reload
- WHEN the user reopens the harness
- THEN the prior metrics log is still visible

### Requirement: Error Capture

The system MUST record errors (probe failure, share rejection, load failure, slice crash) with a timestamp and context, and MUST NOT silently swallow them.

#### Scenario: Probe fallback is logged

- GIVEN multithread was preferred and the shared-memory probe fell back (isolation absent, allocation failed, or memory not shared)
- WHEN the engine reports ready on single-thread
- THEN a `probe-fallback` entry with timestamp and the probe reason is added to the log

#### Scenario: Share rejection is logged

- GIVEN Web Share rejects for a reason other than the user dismissing the sheet
- WHEN the save falls back to a download
- THEN an error entry with timestamp, stage `export`, and the rejection reason is added to the log

### Requirement: Cross-Origin Isolation Assertion

The system MUST assert and display the current `crossOriginIsolated` boolean in the instrumentation panel so `_headers` application can be verified on-device.

#### Scenario: Isolation status visible

- GIVEN the harness has loaded
- WHEN the user opens the instrumentation panel
- THEN the panel shows whether `crossOriginIsolated` is currently true or false
