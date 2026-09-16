// Shared ABI marshaling: plain ESM also runs in the offline Node slice check.
export function checkStatus(module, session, status) {
  if (status !== 0) throw new Error(`OrcaWasm (${status}): ${module.UTF8ToString(module._onewasm_last_error(session))}`);
}

function allocate(module, bytes) {
  const ptr = module._malloc(bytes);
  if (!ptr) throw new Error(`Out of memory allocating ${bytes} bytes`);
  return ptr;
}

function outputSlot(module) {
  const ptr = allocate(module, 8);
  module.setValue(ptr, 0, 'i32');
  module.setValue(ptr + 4, 0, 'i32');
  return ptr;
}

function readOutput(module, ptr, label) {
  const data = module.getValue(ptr, 'i32') >>> 0;
  const length = module.getValue(ptr + 4, 'i32') >>> 0;
  if (!data || !length || data + length > module.HEAPU8.length) throw new Error(`Invalid ${label} output range`);
  return { data, bytes: module.HEAPU8.slice(data, data + length) };
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


function packPlate(module, meshes, transforms) {
  if (!meshes.length || transforms.length !== meshes.length * 11) throw new Error('Plate requires one stride-11 transform per mesh');
  const total = meshes.reduce((sum, bytes) => sum + bytes.length, 0);
  const blob = new Uint8Array(total);
  const offsets = new Uint32Array(meshes.length * 2);
  let cursor = 0;
  meshes.forEach((bytes, index) => {
    blob.set(bytes, cursor);
    offsets.set([cursor, cursor + bytes.length], index * 2);
    cursor += bytes.length;
  });
  let blobPtr = 0, offsetsPtr = 0, transformsPtr = 0;
  try {
    blobPtr = allocate(module, Math.max(1, blob.length));
    module.HEAPU8.set(blob, blobPtr);
    offsetsPtr = allocate(module, offsets.byteLength);
    module.HEAPU8.set(new Uint8Array(offsets.buffer), offsetsPtr);
    transformsPtr = allocate(module, transforms.byteLength);
    module.HEAPU8.set(new Uint8Array(transforms.buffer, transforms.byteOffset, transforms.byteLength), transformsPtr);
    return { blobPtr, offsetsPtr, transformsPtr, blobLength: blob.length };
  } catch (error) {
    if (transformsPtr) module._free(transformsPtr);
    if (offsetsPtr) module._free(offsetsPtr);
    if (blobPtr) module._free(blobPtr);
    throw error;
  }
}

function freePlate(module, plate) {
  if (!plate) return;
  module._free(plate.transformsPtr);
  module._free(plate.offsetsPtr);
  module._free(plate.blobPtr);
}

export function sliceStlMulti(module, session, meshes, transforms, extruderIds = null) {
  let plate, extruders = 0, output = 0, result = 0;
  try {
    plate = packPlate(module, meshes, transforms);
    if (extruderIds) {
      if (extruderIds.length !== meshes.length) throw new Error('Extruder id count must match mesh count');
      extruders = allocate(module, extruderIds.byteLength);
      module.HEAPU8.set(new Uint8Array(extruderIds.buffer, extruderIds.byteOffset, extruderIds.byteLength), extruders);
    }
    output = outputSlot(module);
    const status = module._onewasm_slice_stl_multi(session, plate.blobPtr, plate.blobLength,
      plate.offsetsPtr, meshes.length, extruders, plate.transformsPtr, output, output + 4);
    result = module.getValue(output, 'i32') >>> 0;
    checkStatus(module, session, status);
    return readOutput(module, output, 'G-code').bytes.buffer;
  } finally {
    if (result) module._onewasm_free(result);
    if (output) module._free(output);
    if (extruders) module._free(extruders);
    freePlate(module, plate);
  }
}

export function preparePlate(module, session, meshes, transforms, operation) {
  let plate, output = 0, result = 0;
  try {
    plate = packPlate(module, meshes, transforms);
    output = outputSlot(module);
    const status = module._onewasm_prepare_plate(session, plate.blobPtr, plate.blobLength,
      plate.offsetsPtr, meshes.length, plate.transformsPtr, operation, output, output + 4);
    result = module.getValue(output, 'i32') >>> 0;
    checkStatus(module, session, status);
    return JSON.parse(new TextDecoder().decode(readOutput(module, output, 'plate transforms').bytes));
  } finally {
    if (result) module._onewasm_free(result);
    if (output) module._free(output);
    freePlate(module, plate);
  }
}

export function getLastStatistics(module, session) {
  let output = 0, result = 0;
  try {
    output = outputSlot(module);
    const status = module._onewasm_get_last_statistics(session, output, output + 4);
    result = module.getValue(output, 'i32') >>> 0;
    checkStatus(module, session, status);
    return JSON.parse(new TextDecoder().decode(readOutput(module, output, 'statistics').bytes));
  } finally {
    if (result) module._onewasm_free(result);
    if (output) module._free(output);
  }
}

export function cancel(module, session) {
  checkStatus(module, session, module._onewasm_cancel(session));
}
