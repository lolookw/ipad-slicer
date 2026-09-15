// Shared ABI marshaling: plain ESM also runs in the offline Node slice check.
export function checkStatus(module, session, status) {
  if (status !== 0) throw new Error(`OrcaWasm (${status}): ${module.UTF8ToString(module._onewasm_last_error(session))}`);
}

function allocate(module, bytes) {
  const ptr = module._malloc(bytes);
  if (!ptr) throw new Error(`Out of memory allocating ${bytes} bytes`);
  return ptr;
}

export function initSession(module, json) {
  const session = module._onewasm_session_create();
  if (!session) throw new Error('Could not create OrcaWasm session');
  let ptr = 0;
  try {
    const bytes = new TextEncoder().encode(json);
    ptr = allocate(module, bytes.length);
    module.HEAPU8.set(bytes, ptr);
    checkStatus(module, session, module._onewasm_init(session, ptr, bytes.length));
    return session;
  } catch (error) {
    module._onewasm_session_destroy(session);
    throw error;
  } finally { if (ptr) module._free(ptr); }
}

export function sliceStl(module, session, bytes) {
  let input = 0, output = 0, gcode = 0;
  try {
    input = allocate(module, Math.max(1, bytes.length));
    output = allocate(module, 8);
    module.setValue(output, 0, 'i32');
    module.setValue(output + 4, 0, 'i32');
    module.HEAPU8.set(bytes, input);
    const status = module._onewasm_slice_stl(session, input, bytes.length, output, output + 4);
    gcode = module.getValue(output, 'i32') >>> 0;
    checkStatus(module, session, status);
    const length = module.getValue(output + 4, 'i32') >>> 0;
    if (!gcode || !length || gcode + length > module.HEAPU8.length) throw new Error('Invalid G-code output range');
    return module.HEAPU8.slice(gcode, gcode + length).buffer;
  } finally {
    if (gcode) module._onewasm_free(gcode);
    if (output) module._free(output);
    if (input) module._free(input);
  }
}
