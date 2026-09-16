import type { NativeValue } from '../catalog/types';
import type { SettingDef, SettingValue } from './schema';

function scalar(value: NativeValue): string {
  const result = Array.isArray(value) ? value[0] : value;
  if (result === undefined) throw new Error('Missing setting value');
  return result;
}

export function decodeNative(definition: SettingDef, value: NativeValue): SettingValue {
  if (definition.type === 'string' || definition.type === 'gcode' || definition.type === 'enum')
    return definition.vector ? [...(Array.isArray(value) ? value : [value])] : scalar(value);
  const values = Array.isArray(value) ? value : [value];
  const decoded = values.map(item => {
    if (definition.type === 'bool') {
      if (item !== '0' && item !== '1') throw new Error(`Invalid boolean ${item}`);
      return item === '1';
    }
    const normalized = definition.type === 'percent' ? item.replace(/%$/, '') : item;
    const number = Number(normalized);
    if (!Number.isFinite(number)) throw new Error(`Invalid number ${item}`);
    return number;
  });
  return definition.vector ? decoded : decoded[0]!;
}

export function encodeNative(definition: SettingDef, value: SettingValue): NativeValue {
  const values = Array.isArray(value) ? value : [value];
  const encoded = values.map(item => {
    if (definition.type === 'bool') return item ? '1' : '0';
    if (definition.type === 'percent') return `${item}%`;
    return String(item);
  });
  return definition.vector ? encoded : encoded[0]!;
}
