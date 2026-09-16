/**
 * Real pinned engine build (v2.4.2-patch19, API v0.2.0). The empirical contract check pins
 * stride 11 as scale3, radians/intrinsic-ZYX rotation3, +/-1 mirror3, and centered-delta offsetXY2.
 */
export interface OrcaModule {
  HEAPU8: Uint8Array<ArrayBuffer>;
  _malloc(size: number): number;
  _free(ptr: number): void;
  getValue(ptr: number, type: 'i8' | 'i16' | 'i32' | 'float' | 'double'): number;
  setValue(ptr: number, value: number, type: 'i8' | 'i16' | 'i32' | 'float' | 'double'): void;
  UTF8ToString(ptr: number): string;
  _onewasm_session_create(): number;
  _onewasm_session_destroy(session: number): void;
  _onewasm_init(session: number, ptr: number, length: number): number;
  /** Native OrcaSlicer preset JSON (task 4.x's `orca.native-json`), as an alternative to _onewasm_init's own config format. */
  _onewasm_init_profile(session: number, formatPtr: number, formatLength: number, profilePtr: number, profileLength: number): number;
  _onewasm_set_progress_callback(session: number, callback: number, userData: number): number;
  _onewasm_cancel(session: number): number;
  _onewasm_slice_stl(session: number, ptr: number, length: number, output: number, outputLength: number): number;
  /**
   * objectOffsetsPtr: uint32[objectCount * 2] flat [start0,end0,start1,end1,...] byte ranges into stlBlob.
   * extruderIdsPtr: int32[objectCount]. transformsPtr: float32[objectCount * 11], stride per onewasm_slicer_api.h.
   */
  _onewasm_slice_stl_multi(
    session: number, stlBlobPtr: number, stlBlobLength: number,
    objectOffsetsPtr: number, objectCount: number,
    extruderIdsPtr: number, transformsPtr: number,
    output: number, outputLength: number,
  ): number;
  /** operation: bitmask of ONEWASM_PLATE_AUTO_ORIENT (1) | ONEWASM_PLATE_ARRANGE (2). Returns transforms as JSON, stride/shape TBD by 7.1. */
  _onewasm_prepare_plate(
    session: number, stlBlobPtr: number, stlBlobLength: number,
    objectOffsetsPtr: number, objectCount: number,
    transformsPtr: number, operation: number,
    output: number, outputLength: number,
  ): number;
  _onewasm_get_last_statistics(session: number, output: number, outputLength: number): number;
  _onewasm_last_error(session: number): number;
  _onewasm_free(ptr: number): void;
  addFunction?(callback: (percent: number, stage: number, userData: number) => void, signature: 'viii'): number;
  removeFunction?(ptr: number): void;
}
export function checkStatus(module: OrcaModule, session: number, status: number): void;
export function initSession(module: OrcaModule, json: string): number;
export function sliceStl(module: OrcaModule, session: number, bytes: Uint8Array): ArrayBuffer;
export function sliceStlMulti(module: OrcaModule, session: number, meshes: Uint8Array[], transforms: Float32Array, extruderIds?: Int32Array | null): ArrayBuffer;
export function preparePlate(module: OrcaModule, session: number, meshes: Uint8Array[], transforms: Float32Array, operation: number): unknown;
export function getLastStatistics(module: OrcaModule, session: number): unknown;
export function cancel(module: OrcaModule, session: number): void;
