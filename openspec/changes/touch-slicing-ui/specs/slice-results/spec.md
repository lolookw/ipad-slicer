# slice-results Specification

## Purpose

Present trustworthy slice estimates and effective settings, a bounded-memory toolpath preview, and the existing G-code save flow.

## Requirements

### Requirement: Print-Time and Filament Estimates

The system MUST obtain estimated print time and filament mass in grams from statistics for the successful slice or its G-code comments. It MUST support the comment forms `; estimated printing time (normal mode) = ...` and `; filament used [g] = ...`. Missing or invalid data MUST be shown as unavailable, not zero or a stale estimate from another attempt.

#### Scenario: Parse the G-code fallback

- GIVEN usable statistics are unavailable and the result contains `; estimated printing time (normal mode) = 27m 25s` and `; filament used [g] = 4.09`
- WHEN estimates are displayed
- THEN the readout shows 27 minutes 25 seconds and 4.09 g

#### Scenario: Failed attempt does not inherit estimates

- GIVEN a previous successful slice supplied estimates
- WHEN a new attempt fails or is canceled
- THEN those estimates are not presented as estimates for the new attempt

### Requirement: User-Priced Filament Cost

The system MUST let the user provide a filament price with an explicit mass basis and MUST calculate the slice cost from that price and the result's filament mass. A missing price or mass MUST produce an unavailable cost rather than an invented price or currency conversion.

#### Scenario: Calculate from price per kilogram

- GIVEN filament usage is 4.09 g and the user price is 20 currency units per kilogram
- WHEN the cost is calculated
- THEN the underlying cost is 0.0818 in the user's price units before display rounding

#### Scenario: Missing price

- GIVEN a successful slice has filament mass but no user filament price
- WHEN the readout is displayed
- THEN time and mass remain available and cost is identified as unavailable

### Requirement: Effective Settings from Output

The system MUST show effective settings parsed from the successful G-code header comments and distinguish them from requested settings. Missing header values MUST NOT be represented as engine-confirmed values.

#### Scenario: Header value differs from requested value

- GIVEN the G-code header contains `; brim_width = 5`
- WHEN the user inspects effective settings
- THEN brim width is shown as 5 mm from the output regardless of any different requested value

### Requirement: Layered Web Component Preview

The system MUST display the successful result through the `<gcode-preview>` Web Component with a layer slider. Lines MUST be the default and only MVP toolpath rendering mode. Changing the selected layer range MUST update the visible paths without altering the saved G-code.

#### Scenario: Inspect a layer range

- GIVEN a successful result contains multiple layers
- WHEN the user moves the layer slider
- THEN the preview shows the selected layer range as lines and the source G-code remains unchanged

### Requirement: Bounded GPU Preview Memory

The preview MUST retain GPU toolpath buffers only for visible layers and MUST operate with a WebGL memory budget in the approximate 100–150 MB range. It MUST release no-longer-visible layer buffers and degrade gracefully before exceeding its configured budget, for example by reducing detail or the visible range. If no usable preview fits, it MUST report that limitation while preserving estimates and G-code saving.

#### Scenario: Release hidden geometry

- GIVEN one layer range has GPU buffers allocated
- WHEN the user selects a disjoint range
- THEN toolpath buffers for the previously visible range are released rather than retaining all layers on the GPU

#### Scenario: Large preview stays recoverable

- GIVEN requested visible geometry would exceed the configured WebGL budget
- WHEN the preview prepares that geometry
- THEN it reduces its preview workload or reports the limitation without exhausting the budget, and the user can still save the G-code

### Requirement: Existing Share and Download Save Flow

The system MUST preserve the `gcode-export` save behavior: on an explicit user gesture, share the produced `.gcode` File when `navigator.canShare` allows it, otherwise use the existing Blob download fallback. A failed or rejected share MUST invoke that fallback. Saving MUST work from both Safari and the installed PWA and MUST export the slice result rather than preview-derived geometry.

#### Scenario: Save through Web Share

- GIVEN the produced G-code File is shareable
- WHEN the user taps Save
- THEN the Web Share sheet receives that exact file and the saved output remains retrievable

#### Scenario: Download fallback in the PWA

- GIVEN the app is installed and Web Share is unavailable or rejects
- WHEN the user saves a successful slice
- THEN the existing download fallback provides the same G-code file without losing the running app's context
