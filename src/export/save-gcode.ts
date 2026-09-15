export type SaveMethod = 'share' | 'download' | 'cancelled';
export interface SaveDeps {
  navigator?: Pick<Navigator, 'share' | 'canShare'> | Partial<Pick<Navigator, 'share' | 'canShare'>>;
  document?: Pick<Document, 'createElement' | 'body'>;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  setTimeout?: (fn: () => void, ms: number) => unknown;
}

export async function saveFile(data: ArrayBuffer | string, fileName: string, mimeTypes: string[], deps: SaveDeps = {}): Promise<{ method: SaveMethod; mimeType: string; bytes: number }> {
  const firstMime = mimeTypes[0];
  if (!firstMime) throw new TypeError('At least one MIME type is required');
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data).byteLength : data.byteLength;
  const navigator = deps.navigator ?? globalThis.navigator;
  if (navigator?.share && navigator.canShare) {
    for (const mimeType of mimeTypes) {
      try {
        const file = new File([data], fileName, { type: mimeType });
        if (!navigator.canShare({ files: [file] })) continue;
        // Invoke share before the first suspension to preserve the tap's activation.
        await navigator.share({ files: [file] });
        return { method: 'share', mimeType, bytes };
      } catch (error) {
        if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError') {
          return { method: 'cancelled', mimeType, bytes };
        }
        break;
      }
    }
  }
  const document = deps.document ?? globalThis.document;
  const blob = new Blob([data], { type: firstMime });
  const url = (deps.createObjectURL ?? URL.createObjectURL)(blob);
  const revoke = deps.revokeObjectURL ?? URL.revokeObjectURL;
  const anchor = document.createElement('a');
  anchor.download = fileName;
  anchor.href = url;
  anchor.rel = 'noopener';
  try {
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    (deps.setTimeout ?? globalThis.setTimeout)(() => revoke(url), 60_000);
  }
  return { method: 'download', mimeType: firstMime, bytes };
}

export function saveGcode(gcode: ArrayBuffer, fileName: string, deps?: SaveDeps): Promise<{ method: SaveMethod; mimeType: string; bytes: number }> {
  return saveFile(gcode, fileName, ['text/x.gcode', 'application/octet-stream', 'text/plain'], deps);
}

export function gcodeFileName(stlName: string): string {
  const name = stlName.split(/[/\\]/).pop()!.replace(/[<>:"|?*\x00-\x1f]/g, '').replace(/\.stl$/i, '');
  return `${name || 'model'}.gcode`;
}
