import { describe, expect, it } from 'vitest';
import { sanitizeStack, summarizePlateObjects } from './context';

describe('sanitizeStack', () => {
  it('returns undefined for missing or empty input', () => {
    expect(sanitizeStack(undefined)).toBeUndefined();
    expect(sanitizeStack('')).toBeUndefined();
  });

  it('keeps a short, clean stack unchanged', () => {
    const stack = 'RangeError: Maximum call stack size exceeded\n    at slice (index.js:12:3)';
    expect(sanitizeStack(stack)).toBe(stack);
  });

  it('truncates to the first few lines', () => {
    const stack = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n');
    const result = sanitizeStack(stack, { maxLines: 5 });
    expect(result!.split('\n')).toHaveLength(5);
    expect(result).toContain('line 0');
    expect(result).not.toContain('line 5');
  });

  it('redacts a Windows user-profile path, keeping the file and position', () => {
    const stack = 'Error: boom\n    at slice (C:\\Users\\Lorenzo\\Desktop\\coding\\Ipad slicer\\src\\app\\AppProvider.tsx:139:14)';
    const result = sanitizeStack(stack)!;
    expect(result).not.toContain('Lorenzo');
    expect(result).not.toContain('C:\\Users');
    expect(result).toContain('AppProvider.tsx:139:14');
  });

  it('redacts a POSIX home-directory path, keeping the file and position', () => {
    const stack = 'Error: boom\n    at slice (/Users/lorenzo/code/ipad-slicer/src/app/AppProvider.tsx:139:14)';
    const result = sanitizeStack(stack)!;
    expect(result).not.toContain('lorenzo');
    expect(result).not.toContain('/Users/lorenzo');
    expect(result).toContain('AppProvider.tsx:139:14');
  });

  it('redacts a Linux home-directory path, keeping the file and position', () => {
    const stack = 'Error: boom\n    at slice (/home/lorenzo/code/ipad-slicer/src/app/AppProvider.tsx:139:14)';
    const result = sanitizeStack(stack)!;
    expect(result).not.toContain('lorenzo');
    expect(result).toContain('AppProvider.tsx:139:14');
  });

  it('bounds total length even for a single very long line', () => {
    const stack = `Error: boom\n    at slice (${'x'.repeat(2000)}.js:1:1)`;
    const result = sanitizeStack(stack, { maxLength: 200 })!;
    expect(result.length).toBeLessThanOrEqual(200);
  });
});

describe('summarizePlateObjects', () => {
  it('summarizes an empty plate', () => {
    expect(summarizePlateObjects([])).toEqual({ models: [], objectCount: 0, triangleCount: 0 });
  });

  it('summarizes names, count and total triangles', () => {
    const objects = [{ name: 'a.stl', triangleCount: 10 }, { name: 'b.stl', triangleCount: 25 }];
    expect(summarizePlateObjects(objects)).toEqual({ models: ['a.stl', 'b.stl'], objectCount: 2, triangleCount: 35 });
  });

  it('caps the reported model names but keeps the true count and triangle total', () => {
    const objects = Array.from({ length: 30 }, (_, i) => ({ name: `m${i}.stl`, triangleCount: 1 }));
    const result = summarizePlateObjects(objects, 20);
    expect(result.models).toHaveLength(20);
    expect(result.objectCount).toBe(30);
    expect(result.triangleCount).toBe(30);
  });
});
