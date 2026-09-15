# spike-instrumentation Specification

## Purpose

Preserve on-device metrics, logs, variant selection, and export behind Advanced → Diagnostics instead of the main slicing flow.

## MODIFIED Requirements

### Requirement: Slice Metrics Capture

The system MUST capture peak heap, slice duration, wasm download+instantiate duration, and the thread variant used for each slice attempt. Capture MUST continue while Advanced → Diagnostics is closed; metrics presentation MUST be confined to that section rather than the main workflow.

#### Scenario: Capture without opening diagnostics

- GIVEN Advanced → Diagnostics remains closed
- WHEN a slice attempt completes successfully or fails
- THEN peak heap, slice duration, load duration, and thread variant are recorded for that attempt and are available when Diagnostics is opened

### Requirement: Persisted On-Device Log

The system MUST persist captured metrics and errors on-device so they survive a page reload and can be reviewed without external tooling. The persisted log MUST be accessible in Advanced → Diagnostics, hidden from the main flow, and available for export.

#### Scenario: Review a persisted log after reload

- GIVEN metrics and errors were recorded before a reload
- WHEN the user reopens the app and opens Advanced → Diagnostics
- THEN the prior log is available there and does not occupy the main slicing flow

### Requirement: Cross-Origin Isolation Assertion

The system MUST assert and display the current `crossOriginIsolated` boolean in Advanced → Diagnostics so response-header and offline isolation behavior can be verified on-device.

#### Scenario: Inspect current isolation status

- GIVEN the app has loaded online or offline
- WHEN the user opens Advanced → Diagnostics
- THEN the section shows the current `crossOriginIsolated` value as true or false

## ADDED Requirements

### Requirement: Diagnostics-Only Engine Selector and Export

The system MUST move the engine variant selector and metrics/log export into Advanced → Diagnostics, alongside persisted metrics and logs. The selector MUST retain auto, single-thread, and multithread preferences subject to the existing probe gate. Export MUST include persisted metrics and error context as JSON. These controls MUST NOT appear in the main Import → Configure → Slice → Preview → Save flow.

#### Scenario: Select an engine variant deliberately

- GIVEN the user opens Advanced → Diagnostics
- WHEN the user selects an engine variant preference
- THEN the preference is applied subject to the shared-memory and isolation gate without adding a selector to the main flow

#### Scenario: Export after reload

- GIVEN successful and failed attempts were logged before reloading the app
- WHEN the user opens Diagnostics and exports the log
- THEN the JSON contains the persisted attempts, metrics, and captured error context
