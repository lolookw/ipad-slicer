# profile-catalog Specification

## Purpose

Offer a curated, compatible printer, filament, and process catalog without downloading every resolved profile at startup.

## Requirements

### Requirement: Curated Resolved Profiles

The system MUST ship curated profiles for BBL, Prusa, Creality, Elegoo, Anycubic, and Voron, resolved at build time from their inheritance chains. Catalog coverage MUST mean the shipped subset, not every upstream model or nozzle variant. Generic PLA, PETG, and ABS MUST be available where compatible and smoke-tested.

#### Scenario: Resolved compatible generic material

- GIVEN a shipped printer supports a smoke-tested Generic PLA combination
- WHEN the user selects that printer, material, and process
- THEN its complete resolved profile is available without runtime upstream profile resolution

#### Scenario: Curated vendor coverage

- GIVEN the release catalog has been built
- WHEN its selectable entries are inspected
- THEN each of the six named vendors is represented and unsupported combinations are not advertised as available

### Requirement: Searchable Index and Lazy Printer Packs

The system MUST provide a small searchable printer index separate from resolved profile payloads and MUST load per-printer packs lazily when needed rather than downloading the whole catalog for initial selection.

#### Scenario: Search without full catalog transfer

- GIVEN no printer pack has been requested
- WHEN the user searches the index for a printer
- THEN matching printers are listed without fetching unrelated printer packs

#### Scenario: Selected pack becomes available

- GIVEN a printer appears in the index
- WHEN the user selects it and its pack loads successfully
- THEN its compatible material and process choices become available

### Requirement: Ordered Compatible Selection

The system MUST guide selection in printer → filament → process order and MUST filter filament and process choices using preserved `compatible_printers` metadata and applicable compatibility conditions. A changed upstream selection MUST invalidate incompatible downstream selections and block slicing until the combination is valid.

#### Scenario: Filter by selected printer

- GIVEN two printers have different compatibility metadata
- WHEN the user selects one printer and then a filament
- THEN only compatible filaments and processes are selectable for the resulting combination

#### Scenario: Printer change invalidates selections

- GIVEN the selected filament or process is incompatible with a newly selected printer
- WHEN the printer changes
- THEN the incompatible choice is cleared or marked invalid and cannot be sent for slicing

### Requirement: Engine Smoke-Test Release Gate

Every shipped printer, filament, and process combination MUST pass an engine smoke test with the pinned engine before release. Index or compatibility metadata alone MUST NOT count as a passing test, and failing or untested combinations MUST NOT be shipped as selectable combinations.

#### Scenario: Exclude a failed combination

- GIVEN one resolved combination fails the engine smoke test
- WHEN the release catalog is assembled
- THEN that combination is absent from selectable packs and index availability

#### Scenario: Trace shipped combinations to passing tests

- GIVEN the release catalog is ready
- WHEN each selectable combination is checked against smoke-test results
- THEN every combination has a passing result for its resolved profile and the pinned engine

### Requirement: Custom Printer on Generic Bases

The system MUST offer a custom-printer form for bed size, nozzle diameter, and G-code flavor using resolved generic common bases. Inputs MUST pass the pinned schema and application-safe numeric validation before use. A user-created printer MUST NOT be represented as a smoke-tested catalog combination merely because its base was tested.

#### Scenario: Create a valid custom printer

- GIVEN a user supplies valid bed dimensions, nozzle diameter, and a supported G-code flavor
- WHEN the custom printer is accepted
- THEN its settings overlay a resolved generic common base and can participate in validated configuration

#### Scenario: Reject invalid custom dimensions or flavor

- GIVEN the form contains a nonpositive bed dimension or a flavor absent from the pinned enum
- WHEN the user attempts to use that printer
- THEN the app identifies the invalid field and prevents slicing with it
