import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { importModelFile, detectModelFormat } from './mesh.worker';
import { scanXml } from './xml-scan';
import { parse3mfBuffer } from './threemf-parse';

const RELS = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>';

function toBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function archive(files: Record<string, string>): ArrayBuffer {
  return toBuffer(zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)]))));
}

/** A right triangle with legs of `size` in the XY plane; one triangle keeps expected values easy to read. */
const triangleMesh = (size = 10) =>
  `<mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="${size}" y="0" z="0"/><vertex x="0" y="${size}" z="0"/></vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh>`;

function model(body: string, attrs = 'unit="millimeter"'): string {
  return `<?xml version="1.0" encoding="UTF-8"?><model ${attrs} xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">${body}</model>`;
}

const single = (body: string, extra: Record<string, string> = {}, attrs?: string) =>
  archive({ '_rels/.rels': RELS, '3D/3dmodel.model': model(body, attrs), ...extra });

function parse(buffer: ArrayBuffer, options?: { maxTriangles?: number }) {
  const result = parse3mfBuffer(buffer, options);
  if (!result.ok) throw new Error(`unexpected failure ${result.error.code}`);
  return result.objects;
}
const failure = (buffer: ArrayBuffer, options?: { maxTriangles?: number }) => {
  const result = parse3mfBuffer(buffer, options);
  return result.ok ? undefined : result.error;
};

describe('parse3mfBuffer', () => {
  it('imports a single named object into non-indexed buffers with bounds', () => {
    const [object, ...rest] = parse(single(`<resources><object id="1" type="model" name="Bracket">${triangleMesh()}</object></resources><build><item objectid="1"/></build>`));
    expect(rest).toHaveLength(0);
    expect(object!.name).toBe('Bracket');
    expect(object!.meshBuffers.triangleCount).toBe(1);
    expect(object!.meshBuffers.positions).toHaveLength(9);
    expect(Array.from(object!.meshBuffers.normals.slice(0, 3))).toEqual([0, 0, 1]);
    expect(object!.meshBuffers.bounds).toEqual({ min: [0, 0, 0], max: [10, 10, 0] });
  });

  it('turns every build item into its own object and applies each item transform (row-vector layout)', () => {
    const objects = parse(single(`<resources><object id="1" name="A">${triangleMesh()}</object><object id="2" name="B">${triangleMesh(4)}</object></resources>
      <build><item objectid="1" transform="1 0 0 0 1 0 0 0 1 100 50 5"/><item objectid="2" transform="0 1 0 -1 0 0 0 0 1 0 0 0"/><item objectid="1"/></build>`));
    expect(objects.map(object => object.name)).toEqual(['A', 'B', 'A']);
    expect(objects[0]!.meshBuffers.bounds).toEqual({ min: [100, 50, 5], max: [110, 60, 5] });
    // 90 degrees about Z maps (x, y) to (-y, x)
    expect(objects[1]!.meshBuffers.bounds).toEqual({ min: [-4, 0, 0], max: [0, 4, 0] });
    expect(objects[2]!.meshBuffers.bounds).toEqual({ min: [0, 0, 0], max: [10, 10, 0] });
  });

  it('flattens components, composing nested transforms', () => {
    const objects = parse(single(`<resources>
      <object id="1">${triangleMesh()}</object>
      <object id="2"><components><component objectid="1"/><component objectid="1" transform="1 0 0 0 1 0 0 0 1 20 0 0"/></components></object>
      <object id="3" name="Assembly"><components><component objectid="2" transform="1 0 0 0 1 0 0 0 1 0 0 7"/></components></object>
      </resources><build><item objectid="3" transform="1 0 0 0 1 0 0 0 1 0 100 0"/></build>`));
    expect(objects).toHaveLength(1);
    expect(objects[0]!.name).toBe('Assembly');
    expect(objects[0]!.meshBuffers.triangleCount).toBe(2);
    expect(objects[0]!.meshBuffers.bounds).toEqual({ min: [0, 100, 7], max: [30, 110, 7] });
  });

  it.each([['inch', 25.4], ['centimeter', 10], ['micron', 0.001], ['meter', 1000], ['millimeter', 1]])('converts %s units to millimeters', (unit, factor) => {
    const [object] = parse(single(`<resources><object id="1">${triangleMesh()}</object></resources><build><item objectid="1"/></build>`, {}, `unit="${unit}"`));
    expect(object!.meshBuffers.bounds.max[0]).toBeCloseTo(10 * factor, 4);
  });

  it('defaults to millimeters when no unit is declared', () => {
    const [object] = parse(single(`<resources><object id="1">${triangleMesh()}</object></resources><build><item objectid="1"/></build>`, {}, ''));
    expect(object!.meshBuffers.bounds.max[0]).toBe(10);
  });

  it('keeps triangle winding outward under mirrored transforms and drops degenerate triangles', () => {
    const mesh = `<mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/></vertices><triangles><triangle v1="0" v2="1" v3="2"/><triangle v1="0" v2="0" v3="1"/></triangles></mesh>`;
    const [object] = parse(single(`<resources><object id="1">${mesh}</object></resources><build><item objectid="1" transform="-1 0 0 0 1 0 0 0 1 0 0 0"/></build>`));
    expect(object!.meshBuffers.triangleCount).toBe(1);
    expect(object!.meshBuffers.normals[2]).toBeCloseTo(1, 6);
  });

  it('imports every printable object when there is no build section and skips non-printable items and support types', () => {
    const objects = parse(single(`<resources><object id="1" name="Solo">${triangleMesh()}</object><object id="2" type="support">${triangleMesh()}</object></resources><build><item objectid="1"/><item objectid="1" printable="0"/><item objectid="2"/></build>`));
    expect(objects.map(object => object.name)).toEqual(['Solo']);
    const noBuild = parse(single(`<resources><object id="1" name="Loose">${triangleMesh()}</object></resources>`));
    expect(noBuild.map(object => object.name)).toEqual(['Loose']);
  });

  it('resolves production-extension components stored in separate model parts', () => {
    const part = model(`<resources><object id="1">${triangleMesh(6)}</object></resources>`);
    const objects = parse(archive({
      '_rels/.rels': RELS,
      '3D/3dmodel.model': model('<resources><object id="2" p:UUID="x"><components><component p:path="/3D/Objects/object_1.model" objectid="1" transform="1 0 0 0 1 0 0 0 1 3 0 0"/></components></object></resources><build><item objectid="2"/></build>'),
      '3D/Objects/object_1.model': part,
    }));
    expect(objects[0]!.meshBuffers.bounds).toEqual({ min: [3, 0, 0], max: [9, 6, 0] });
  });

  it('keeps material, color and extruder metadata instead of discarding it', () => {
    const body = `<resources>
      <basematerials id="10"><base name="Red PLA" displaycolor="#FF0000FF"/><base name="Blue PLA" displaycolor="#0000FF"/></basematerials>
      <m:colorgroup id="11"><m:color color="#00FF00FF"/></m:colorgroup>
      <object id="1" name="Two tone" pid="10" pindex="0"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/><vertex x="1" y="1" z="0"/></vertices>
        <triangles><triangle v1="0" v2="1" v3="2" pid="10" p1="1"/><triangle v1="1" v2="3" v3="2" pid="11" p1="0"/></triangles></mesh></object>
      </resources><build><item objectid="1"/></build>`;
    const config = '<config><object id="1"><metadata key="name" value="Config name"/><metadata key="extruder" value="2"/><part id="1"><metadata key="extruder" value="4"/></part></object></config>';
    const [object] = parse(single(body, { 'Metadata/model_settings.config': config }));
    expect(object!.extruder).toBe(2);
    expect(object!.name).toBe('Two tone');
    expect(object!.materials).toHaveLength(3);
    expect(object!.materials).toEqual(expect.arrayContaining([
      { name: 'Blue PLA', color: '#0000FF' }, { name: undefined, color: '#00FF00' }, { name: 'Red PLA', color: '#FF0000' },
    ]));
  });

  it('falls back to configured names when the model part has none', () => {
    const config = '<config><object id="1"><metadata type="object" key="name" value="From slicer"/></object></config>';
    const [object] = parse(single(`<resources><object id="1">${triangleMesh()}</object></resources><build><item objectid="1"/></build>`, { 'Metadata/Slic3r_PE_model.config': config }));
    expect(object!.name).toBe('From slicer');
  });

  it('rejects bytes that are not a zip archive', () => {
    expect(failure(toBuffer(strToU8('PK this is definitely not a zip file at all')))?.code).toBe('threemf-not-zip');
    expect(failure(new ArrayBuffer(3))?.code).toBe('threemf-not-zip');
  });

  it('rejects an archive without a model part', () => {
    expect(failure(archive({ 'readme.txt': 'hello' }))?.code).toBe('threemf-no-model');
  });

  it('rejects models without triangles', () => {
    expect(failure(single('<resources><object id="1"><mesh><vertices/><triangles/></mesh></object></resources><build><item objectid="1"/></build>'))?.code).toBe('threemf-no-triangles');
    expect(failure(single('<resources/><build/>'))?.code).toBe('threemf-no-triangles');
  });

  it('rejects encrypted archives and secure-content packages', () => {
    const bytes = new Uint8Array(zipSync({ '3D/3dmodel.model': strToU8(model('<resources/>')) }));
    const view = new DataView(bytes.buffer);
    for (let offset = 0; offset < bytes.length - 4; offset++)
      if (view.getUint32(offset, true) === 0x02014b50) view.setUint16(offset + 8, view.getUint16(offset + 8, true) | 1, true);
    expect(failure(toBuffer(bytes))?.code).toBe('threemf-unsupported');
    expect(failure(archive({ '_rels/.rels': RELS, '3D/3dmodel.model': model('<resources/>'), 'Secure/keystore.xml': '<k/>' }))?.code).toBe('threemf-unsupported');
  });

  it('rejects production-extension models whose referenced parts are missing', () => {
    expect(failure(single('<resources><object id="2"><components><component p:path="/3D/Objects/missing.model" objectid="1"/></components></object></resources><build><item objectid="2"/></build>'))?.code).toBe('threemf-unsupported');
  });

  it('rejects malformed geometry: bad indices, cycles, unknown units and bad transforms', () => {
    const badIndex = '<resources><object id="1"><mesh><vertices><vertex x="0" y="0" z="0"/></vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh></object></resources><build><item objectid="1"/></build>';
    expect(failure(single(badIndex))?.code).toBe('threemf-invalid-format');
    const cycle = '<resources><object id="1"><components><component objectid="2"/></components></object><object id="2"><components><component objectid="1"/></components></object></resources><build><item objectid="1"/></build>';
    expect(failure(single(cycle))?.code).toBe('threemf-invalid-format');
    expect(failure(single(`<resources><object id="1">${triangleMesh()}</object></resources><build><item objectid="1"/></build>`, {}, 'unit="parsec"'))?.code).toBe('threemf-invalid-format');
    expect(failure(single(`<resources><object id="1">${triangleMesh()}</object></resources><build><item objectid="1" transform="1 2 3"/></build>`))?.code).toBe('threemf-invalid-format');
    expect(failure(single('<resources><object id="1"><mesh><vertices><vertex x="a" y="0" z="0"/></vertices></mesh></object></resources>'))?.code).toBe('threemf-invalid-format');
  });

  it('refuses files over the triangle limit before building buffers', () => {
    const two = '<mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/></vertices><triangles><triangle v1="0" v2="1" v3="2"/><triangle v1="0" v2="2" v3="1"/></triangles></mesh>';
    const buffer = single(`<resources><object id="1">${two}</object></resources><build><item objectid="1"/><item objectid="1"/></build>`);
    expect(failure(buffer, { maxTriangles: 3 })).toEqual({ code: 'tier-limit-triangles', values: { limit: 3 } });
    expect(parse(buffer, { maxTriangles: 4 })).toHaveLength(2);
  });
});

describe('xml scanner', () => {
  it('skips comments, CDATA and declarations and decodes attribute entities', () => {
    const seen: Array<[string, Record<string, string>]> = [];
    scanXml(`<?xml version="1.0"?><!-- <fake a="1"/> --><a:root x="1 &amp; 2"><![CDATA[<nope/>]]><child name='q&quot;t&#65;' /></a:root>`, {
      open: (name, attributes) => { seen.push([name, attributes()]); }, close: () => {},
    });
    expect(seen).toEqual([['root', { x: '1 & 2' }], ['child', { name: 'q"tA' }]]);
  });
});

describe('importModelFile', () => {
  const asFile = (name: string, buffer: ArrayBuffer) => ({ name, arrayBuffer: async () => buffer }) as File;

  it('detects the format from the extension, then from the zip signature', () => {
    expect(detectModelFormat('a.3MF', new ArrayBuffer(0))).toBe('3mf');
    expect(detectModelFormat('a.stl', new Uint8Array([0x50, 0x4b, 3, 4]).buffer)).toBe('stl');
    expect(detectModelFormat('download', new Uint8Array([0x50, 0x4b, 3, 4]).buffer)).toBe('3mf');
    expect(detectModelFormat('download', new Uint8Array([1, 2, 3, 4]).buffer)).toBe('stl');
  });

  it('parses a 3MF through the main-thread fallback and reports failures with codes', async () => {
    const good = await importModelFile(asFile('thing.3mf', single(`<resources><object id="1" name="X">${triangleMesh()}</object></resources><build><item objectid="1"/></build>`)));
    expect(good.ok && good.format).toBe('3mf');
    expect(good.ok && good.objects[0]!.name).toBe('X');
    const bad = await importModelFile(asFile('bad.3mf', toBuffer(strToU8('not a zip'))));
    expect(bad).toEqual({ ok: false, error: { code: 'threemf-not-zip' } });
  });
});
