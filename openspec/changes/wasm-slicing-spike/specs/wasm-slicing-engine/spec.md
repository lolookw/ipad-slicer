# wasm-slicing-engine Specification

## Purpose

Load the OrcaWasm engine in a Web Worker, apply a bundled flattened profile, and slice an imported STL with progress/cancel, selecting single-thread or fixed-memory multithread via an on-device probe.

## Requirements

### Requirement: Engine Loading in Worker

The system MUST load the OrcaWasm single-thread build same-origin inside a Web Worker and record download+instantiate duration.

#### Scenario: Successful load

- GIVEN the harness is opened in Safari
- WHEN the worker fetches and instantiates `slicer.wasm`
- THEN load completes and instrumentation records the duration

#### Scenario: Load failure surfaces error

- GIVEN the wasm fetch or instantiation fails
- WHEN the worker reports the failure
- THEN the UI shows an error state instead of hanging silently

### Requirement: Bundled Profile Application

The system MUST apply the bundled flattened Ender-3 V2 0.4 / 0.20mm Standard / Generic PLA profile via `onewasm_init_profile` before any slice starts.

#### Scenario: Profile applied before slicing

- GIVEN the engine has loaded
- WHEN the user starts a slice
- THEN the bundled profile is initialized before the first slice call executes

### Requirement: STL Slicing With Progress and Cancel

The system MUST slice an imported STL reporting progress and MUST support user-initiated cancel that stops the worker and returns the UI to ready state.

#### Scenario: Reference STL slices without crash

- GIVEN a 20–50MB reference STL is imported
- WHEN the user starts slicing
- THEN slicing completes without tab crash or OOM

#### Scenario: User cancels mid-slice

- GIVEN a slice is in progress
- WHEN the user cancels
- THEN the worker stops slicing and the UI returns to ready without residual state

### Requirement: Thread-Variant Selection via Probe

The system MUST run an on-device shared-memory probe (`new WebAssembly.Memory({shared:true})` at fixed target size) before offering the multithread build, and MUST fall back to single-thread when the probe fails or `crossOriginIsolated` is false.

#### Scenario: Probe succeeds and isolation is active

- GIVEN `crossOriginIsolated` is true
- WHEN the probe allocates the target shared memory successfully
- THEN the multithread build is offered as a stretch-goal option

#### Scenario: Probe fails or isolation absent

- GIVEN the probe throws or `crossOriginIsolated` is false
- WHEN thread-variant selection runs
- THEN the system uses single-thread only and does not block the user with a blocking error

### Requirement: Single-Thread Memory Ceiling

The system MUST keep single-thread peak heap under ~1GB for the reference STL ladder up to 50MB, and MUST record a measured failure (not a silent crash) if the ceiling is exceeded.

#### Scenario: Peak memory within ceiling

- GIVEN a 50MB reference STL slices on single-thread
- WHEN slicing completes
- THEN recorded peak heap is under ~1GB
