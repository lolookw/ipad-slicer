# app-shell Specification

## Purpose

Provide one adaptive, touch-first SolidJS PWA for the Import → Configure → Slice → Preview → Save workflow on iPadOS 17 and later.

## Requirements

### Requirement: Guided Slicing Flow

The system MUST provide the main workflow in a SolidJS app shell, default Configure to simple mode, and enable slicing only when a model and valid printer, filament, process, and settings are available. Preview and Save MUST refer to a successful slice, not an unfinished or canceled attempt.

#### Scenario: Complete the main flow

- GIVEN the app is open on a supported iPad
- WHEN the user imports an STL, configures a compatible profile, and slices successfully
- THEN the app presents Preview and Save for that result without requiring diagnostics

#### Scenario: Incomplete configuration

- GIVEN no valid printer and filament combination is selected
- WHEN the user reaches Configure
- THEN the app identifies the missing configuration and prevents slicing

### Requirement: Adaptive Standard and Full Tiers

The system MUST ship one PWA with a user-selectable Standard/Full toggle. It MUST use `hardwareConcurrency`, `navigator.gpu`, viewport and pointer detection, and the existing multithread probe to adapt to available features. A Full selection MUST NOT bypass missing platform capabilities or a failed multithread probe; Standard MUST retain the end-to-end slicing workflow.

#### Scenario: Full does not force unsupported features

- GIVEN a device lacks WebGPU and fails the multithread probe
- WHEN the user selects Full
- THEN the app retains usable rendering and single-thread slicing without attempting unsupported features

#### Scenario: Standard remains a complete slicer

- GIVEN the user selects Standard
- WHEN the user imports, configures, slices, previews, and saves
- THEN the same installed PWA supports every step

### Requirement: Rendering Capability Fallback

The system MUST provide WebGL2 as the rendering baseline and use WebGPU enhancement when available and supported by the rendering surface. Failure to initialize a WebGPU path MUST fall back to WebGL2 without requiring a separate app build.

#### Scenario: Baseline iPad rendering

- GIVEN iPadOS 17 with WebGL2 and no `navigator.gpu`
- WHEN the user opens the model workspace and toolpath preview
- THEN both surfaces remain usable through WebGL2

#### Scenario: WebGPU enhancement and fallback

- GIVEN WebGPU is detected on a rendering surface that supports it
- WHEN rendering initializes
- THEN it uses WebGPU on success and WebGL2 if WebGPU initialization fails

### Requirement: English and Spanish Localization

The system MUST provide English and Spanish from the MVP, a language selector, and an i18n layer for all app-authored user-facing strings, including labels, errors, accessibility text, and diagnostics UI. The chosen language MUST persist across reloads. Technical identifiers, user data, and raw engine output MUST remain distinguishable from translated UI text.

#### Scenario: Persist Spanish selection

- GIVEN the app is displayed in English
- WHEN the user selects Spanish and reloads
- THEN app-authored strings remain in Spanish throughout the main flow and Advanced section

#### Scenario: Switch back to English

- GIVEN Spanish is selected and a validation error is visible
- WHEN the user selects English
- THEN the error, controls, and accessibility labels use English through the i18n layer without altering profile values

### Requirement: Touch Layout and Appearance

Every interactive target MUST have a touch hit area of at least 44 × 44 pt. The app MUST respect safe-area insets, remain operable in portrait and landscape, adapt to viewport and pointer changes, and support dark mode without hiding controls or their state.

#### Scenario: Both orientations and languages

- GIVEN English or Spanish is selected on an iPad with safe-area insets
- WHEN the user rotates between portrait and landscape or narrows the viewport
- THEN every interactive target remains at least 44 × 44 pt and essential controls remain reachable outside obstructed safe areas

#### Scenario: Dark mode is usable

- GIVEN dark appearance is active
- WHEN the user navigates the main flow and Advanced settings
- THEN text, selected states, validation errors, and viewer controls remain legible and operable
