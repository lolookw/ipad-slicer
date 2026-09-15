export interface OrcaModule {
  HEAPU8: Uint8Array<ArrayBuffer>;
  _malloc(size: number): number;
  _free(ptr: number): void;
  getValue(ptr: number, type: 'i32'): number;
  setValue(ptr: number, value: number, type: 'i32'): void;
  UTF8ToString(ptr: number): string;
  _onewasm_session_create(): number;
  _onewasm_session_destroy(session: number): void;
  _onewasm_init(session: number, ptr: number, length: number): number;
  _onewasm_last_error(session: number): number;
  _onewasm_slice_stl(session: number, ptr: number, length: number, output: number, outputLength: number): number;
  _onewasm_free(ptr: number): void;
  _onewasm_set_progress_callback(session: number, callback: number, userData: number): number;
  addFunction?(callback: (percent: number, stage: number, userData: number) => void, signature: 'viii'): number;
  removeFunction?(ptr: number): void;
}
export function checkStatus(module: OrcaModule, session: number, status: number): void;
export function initSession(module: OrcaModule, json: string): number;
export function sliceStl(module: OrcaModule, session: number, bytes: Uint8Array): ArrayBuffer;
