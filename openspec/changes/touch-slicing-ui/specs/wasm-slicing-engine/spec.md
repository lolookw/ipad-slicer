# wasm-slicing-engine Specification

## Purpose

Extend the existing worker-based slicer with per-slice resolved profiles and multi-object transforms while retaining honest progress, cancellation, and probe-gated thread selection.

## MODIFIED Requirements

### Requirement: Bundled Profile Application

The system MUST supply a resolved selected printer, filament, and process preset plus validated overrides for every slice, replacing the single build-bundled Ender-3 profile. The worker MUST apply that configuration as flat `orca.native-json` through `onewasm_init` before the slice call. Configuration from a previous attempt MUST NOT leak into the next attempt; invalid settings MUST be rejected before submission.

#### Scenario: Apply selected profile before each slice

- GIVEN the engine is loaded and the client has validated a selected resolved preset plus overrides
- WHEN the user starts a slice
- THEN that attempt's configuration is initialized before its slice call executes

#### Scenario: Do not reuse a previous override

- GIVEN a previous slice used a brim override and the next validated profile does not include it
- WHEN the next slice starts
- THEN its settings derive only from its own resolved preset and current overrides

### Requirement: STL Slicing With Progress and Cancel

The system MUST slice an imported STL and MUST support user-initiated cancellation. While the pinned build lacks `addFunction`, the UI MUST show indeterminate slicing activity and MUST NOT display a progress percentage. Cancel on multithread MUST terminate and restart the worker before another slice; cancel on single-thread MUST soft-discard the result without claiming the synchronous computation was interrupted. Canceled results MUST NOT become current output, and another attempt MUST NOT overlap an unfinished single-thread call. Cooperative `onewasm_cancel` MAY replace these mechanisms later only after in-flight behavior is verified.

#### Scenario: Reference STL slices without crash

- GIVEN a 20–50 MB reference STL is imported
- WHEN the user starts slicing
- THEN slicing completes without tab crash or OOM

#### Scenario: No fabricated percentage

- GIVEN the build lacks `addFunction`
- WHEN a slice is running
- THEN the UI displays indeterminate activity with cancellation available and no progress percentage

#### Scenario: Multithread cancellation restarts the worker

- GIVEN a multithread slice is running
- WHEN the user cancels
- THEN the worker is terminated and restarted, the canceled output is discarded, and slicing becomes available after engine readiness is restored

#### Scenario: Single-thread cancellation discards late output

- GIVEN a single-thread slice is running synchronously
- WHEN the user cancels and the computation subsequently returns
- THEN its result is ignored, no overlapping slice was started in that worker, and a new slice can begin once the worker is available

### Requirement: Thread-Variant Selection via Probe

The system MUST run the existing on-device shared-memory probe (`new WebAssembly.Memory({shared:true})` at the fixed target size) before enabling multithread and MUST fall back to single-thread when the probe fails or `crossOriginIsolated` is false. Adaptive tier selection and the Advanced → Diagnostics engine selector MUST respect this gate; Full MUST NOT force multithread when unavailable.

#### Scenario: Probe succeeds and isolation is active

- GIVEN `crossOriginIsolated` is true
- WHEN the probe allocates the target shared memory successfully
- THEN multithread is available to adaptive selection and the Diagnostics selector

#### Scenario: Probe failure overrides Full or multithread preference

- GIVEN the probe fails or isolation is absent
- WHEN Full or a multithread preference is selected
- THEN single-thread is used without blocking the main flow and the fallback reason is logged

## ADDED Requirements

### Requirement: Multi-Object Slicing With Transforms

The system MUST support slicing multiple plate objects through `onewasm_slice_stl_multi` using each object's current translation, rotation, and scale. The worker protocol MUST carry the per-slice validated plate profile and object transforms; the returned G-code MUST represent the prepared plate rather than untransformed source STLs.

#### Scenario: Slice transformed objects on one plate

- GIVEN two STL objects have distinct positions, rotations, and scales in the workspace
- WHEN the user slices the plate
- THEN the multi-object call receives both objects with their respective transforms and returns one plate result

#### Scenario: Preparation transforms reach the slicer

- GIVEN `onewasm_prepare_plate` returned updated transforms that are shown in the viewer
- WHEN the next slice starts
- THEN those same transforms are supplied to the multi-object slice call
