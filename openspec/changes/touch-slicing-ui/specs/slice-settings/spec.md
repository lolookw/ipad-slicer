# slice-settings Specification

## Purpose

Expose a bounded beginner surface and categorized advanced settings over resolved presets, with validation and portable local user presets.

## Requirements

### Requirement: Resolved Preset as Settings Base

The settings model MUST start from the selected resolved printer, filament, and process preset, then apply validated overrides. It MUST NOT substitute engine compiled defaults for resolved preset values. Resetting an override MUST restore the selected preset value rather than a compiled default.

#### Scenario: Preserve preset brim width

- GIVEN the resolved preset specifies `brim_width = 5` while the compiled default is 0
- WHEN the user opens settings or resets a brim-width override
- THEN the displayed and submitted value is 5 mm

### Requirement: Bounded Simple Mode

Simple mode MUST expose at most ten primary configuration controls or action entry points: quality, infill, support enablement, support type, brim type, brim width, printer, filament, and an orient/arrange action entry point. It MUST also show a non-editable time, filament, and cost readout. The quality control MUST represent compatible process selection rather than adding a separate raw process selector. Support and adhesion sub-controls MUST count separately toward the limit; global workflow navigation is not a configuration control.

#### Scenario: Count the fully expanded simple surface

- GIVEN supports and adhesion options are expanded in simple mode
- WHEN the primary configuration controls and action entry points are counted
- THEN there are no more than ten, including each support and adhesion sub-control, with the estimate readout shown separately

### Requirement: Quality Ladder and Infill

The system MUST offer Draft, Standard, and Fine quality choices that select compatible process values for `layer_height` and related quality settings from resolved presets. It MUST expose `sparse_infill_density` from 0% through 100%, subject to validation of the resulting settings combination.

#### Scenario: Select Fine after selecting material

- GIVEN a printer and filament with a compatible Fine process are selected
- WHEN the user chooses Fine and 40% infill
- THEN settings contain the Fine preset's layer height and related quality values with `sparse_infill_density = 40%`

#### Scenario: Do not invent an incompatible quality preset

- GIVEN a quality choice has no shipped compatible process for the selected printer and filament
- WHEN the quality ladder is displayed
- THEN that choice is unavailable rather than synthesized from compiled defaults

### Requirement: Support Settings

The system MUST expose `enable_support` and validate `support_type` against exactly `normal(auto)`, `tree(auto)`, `normal(manual)`, and `tree(manual)`. UI labels MUST preserve these serialized enum values when building the slice configuration.

#### Scenario: Serialize a support choice

- GIVEN the user enables supports and selects automatic tree supports
- WHEN settings are validated for slicing
- THEN `enable_support` is enabled and `support_type` is serialized as `tree(auto)`

#### Scenario: Reject an invalid support enum

- GIVEN an imported override contains `support_type = tree`
- WHEN it is validated
- THEN validation fails before any engine slice request

### Requirement: Adhesion Settings

The system MUST expose `brim_type` choices `auto_brim`, `brim_ears`, `painted`, `outer_only`, `inner_only`, `outer_and_inner`, and `no_brim`, and `brim_width` from 0 through 100 mm inclusive. Enum availability MUST NOT imply that the app provides painting tools.

#### Scenario: Boundary brim widths

- GIVEN a selected resolved preset
- WHEN the user enters 0 mm or 100 mm for brim width
- THEN that field passes range validation, while values below 0 or above 100 fail before slicing

#### Scenario: Serialize adhesion mode

- GIVEN the user chooses no brim
- WHEN the slice settings are assembled
- THEN `brim_type` is `no_brim`, not an invented label or enum value

### Requirement: Categorized Advanced Mode

Advanced mode MUST organize editable settings into Quality, Strength, Speed, Support, and Others. Switching between simple and advanced modes MUST preserve the same resolved preset and overrides and MUST NOT silently reset advanced values.

#### Scenario: Preserve advanced edits

- GIVEN a valid advanced speed override is set
- WHEN the user switches to simple mode and back
- THEN the override remains unchanged and appears under Speed

### Requirement: Pinned Client Validation

Before slicing, the client MUST validate the resolved preset plus overrides against a schema pinned to the engine version, including types, closed enums, and application-defined safe numeric bounds for the selected printer and material. Validation MUST apply to simple edits, advanced edits, custom-printer input, and imported presets. Values beyond safe bounds MUST be rejected even if accepted by broad engine schema bounds; invalid enums MUST NOT be delegated to the engine's silent fallback behavior.

#### Scenario: Invalid infill enum never reaches the engine

- GIVEN `sparse_infill_pattern = banana` appears in an override
- WHEN the user attempts slicing
- THEN the client identifies the invalid enum and sends no slice request

#### Scenario: Application limits are stronger than engine bounds

- GIVEN a temperature lies within the engine schema but above the selected printer or material's application-safe bound
- WHEN settings are validated
- THEN the client rejects it and identifies the field requiring correction

### Requirement: Exclude Obsolete Adaptive Layer Height

The system MUST NOT send `adaptive_layer_height` to the engine and MUST reject it as an obsolete override on preset import rather than implying it controls variable layer height.

#### Scenario: Reject obsolete imported override

- GIVEN preset JSON contains `adaptive_layer_height`
- WHEN the user imports it
- THEN the app reports the obsolete key and does not activate or submit that preset unchanged

### Requirement: Persist and Transfer User Presets

The system MUST persist user presets in IndexedDB and MUST support JSON export and import with sufficient profile identity and override data to restore the settings. Imported data MUST pass schema, compatibility, and safe-bound validation before activation; invalid or unavailable dependencies MUST produce an actionable error without replacing a valid active preset.

#### Scenario: Preset survives reload and JSON round trip

- GIVEN a user preset has valid profile references and overrides
- WHEN it is saved, the app reloads, and the user exports and reimports its JSON
- THEN the same resolved profile selection and overrides can be restored from both IndexedDB and JSON

#### Scenario: Invalid import preserves active settings

- GIVEN a valid preset is active
- WHEN the user imports malformed JSON or a preset referring to an unavailable profile
- THEN the app reports the problem and leaves the active preset unchanged
