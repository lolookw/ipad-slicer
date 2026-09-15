# Slicing profiles

`ender3v2-020-pla.json` is a flat `orca.native-json` config that the engine worker passes to `onewasm_init`.

It is generated, not hand-edited:

```sh
node scripts/resolve-profile.mjs
```

## Provenance

- Source: [OrcaSlicer](https://github.com/OrcaSlicer/OrcaSlicer) `resources/profiles` at tag `v2.4.2` (AGPL-3.0).
- Presets and their `inherits` chains (parents first, child keys override parent keys):
  - Machine: `fdm_machine_common` → `fdm_creality_common` → `Creality Ender-3 V2 0.4 nozzle`
  - Process: `fdm_process_common` → `fdm_process_creality_common` → `0.20mm Standard @Creality Ender3V2`
  - Filament: `fdm_filament_common` → `fdm_filament_pla` → `Creality Generic PLA`
- Base presets are resolved inside the vendor folder first (`Creality/machine/fdm_machine_common.json`, not `Custom/`), matching how OrcaSlicer loads a vendor bundle.
- Override: `use_relative_e_distances = 1`. The Creality start G-code switches the extruder to relative mode (`M83`) and the inherited before-layer-change G-code resets E with `G92 E0`; the engine rejects that combination with absolute E distances (status -6).
- Preset bookkeeping keys (`name`, `inherits`, `setting_id`, `compatible_printers`, …) are dropped; `printer_settings_id`, `print_settings_id`, and `filament_settings_id` record the selected presets.
- Raw preset files are cached in `.engine-cache/orca-profiles-v2.4.2/` (gitignored).

To change printer, process, or filament, update `PRESETS` and `SELECTION` in the script and regenerate.
