# model-workspace Specification

## Purpose

Import and prepare one or more STL objects on a touch-controlled build plate before slicing.

## Requirements

### Requirement: STL Import from Files

The system MUST import STL files through the iPad Files picker and add valid models to the current plate. An unreadable or invalid STL MUST produce a visible error without discarding already imported objects.

#### Scenario: Add another STL

- GIVEN one object is already on the plate
- WHEN the user selects another valid STL from Files
- THEN both objects are present and independently selectable

#### Scenario: Invalid file preserves the plate

- GIVEN the plate contains a valid object
- WHEN the user imports an unreadable STL
- THEN an import error is shown and the existing object remains unchanged

### Requirement: Touch 3D Viewer

The system MUST show the plate and objects in a three.js 3D viewer with touch orbit, pan, and pinch zoom. Camera gestures MUST change the view without changing object transforms.

#### Scenario: Navigate without moving models

- GIVEN multiple objects are visible
- WHEN the user orbits, pans, and pinches the view
- THEN the camera view changes while the objects' plate transforms remain unchanged

### Requirement: Touch Transform Gizmo and Unit-Aware Scaling

The system MUST provide a touch gizmo to move, rotate, and scale the selected object independently. Scaling MUST make the input units explicit and convert physical dimensions consistently to the engine's millimeter coordinate system. Changing display units alone MUST NOT change physical size.

#### Scenario: Edit only the selected object

- GIVEN two objects are on the plate and one is selected
- WHEN the user moves, rotates, or scales it with the touch gizmo
- THEN only that object's transform and displayed dimensions change

#### Scenario: Preserve physical size across unit conversion

- GIVEN an object dimension is expressed in a supported non-millimeter unit
- WHEN the user enters a target dimension and then displays it in millimeters
- THEN the dimension reflects the physical unit conversion and slicing receives the equivalent millimeter transform

### Requirement: Engine Auto-Orient and Arrange

The system MUST offer auto-orient and arrange through `onewasm_prepare_plate` and MUST apply the returned transforms to the workspace and subsequent slice request. Preparation failure MUST be visible and MUST NOT partially replace the current plate transforms.

#### Scenario: Apply preparation output

- GIVEN several objects are on a configured plate
- WHEN the user invokes auto-orient or arrange and preparation succeeds
- THEN the viewer and slice input use the transforms returned by `onewasm_prepare_plate`

#### Scenario: Preserve transforms on failure

- GIVEN the plate has existing transforms
- WHEN preparation fails
- THEN an error is shown and the existing transforms remain available for correction or retry

### Requirement: Conditional Per-Object Brim and Supports

If the pinned `onewasm_slice_stl_multi` API accepts per-object settings, the system MUST provide per-object brim and support toggles and apply them only to their target objects. These toggles MAY be deferred if that API does not accept per-object settings. In the deferred case, the app MUST expose only honest plate-wide settings and MUST NOT display controls that falsely imply independent per-object behavior.

#### Scenario: Supported object overrides remain independent

- GIVEN the pinned API accepts per-object settings and two objects are present
- WHEN the user changes brim or supports on one object
- THEN the slice input carries that override only for the selected object

#### Scenario: Unsupported overrides are deferred visibly

- GIVEN the pinned API does not accept per-object settings and the feature is deferred
- WHEN the user configures brim or supports
- THEN the available controls are plate-wide and no per-object toggle claims to affect one object independently
