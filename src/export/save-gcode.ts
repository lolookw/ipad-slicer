export type SaveMethod = 'share' | 'download';
export interface SaveDeps {
  navigator?: Pick<Navigator, 'share' | 'canShare'> | Partial<Pick<Navigator, 'share' | 'canShare'>>;
  document?: Pick<Document, 'createElement' | 'body'>;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  setTimeout?: (fn: () => void, ms: number) => unknown;
}

export interface SaveResult { method: SaveMethod; mimeType: string; bytes: number; shareError?: string }

export async function saveFile(data: ArrayBuffer | string, fileName: string, mimeTypes: string[], deps: SaveDeps = {}): Promise<SaveResult> {
  const firstMime = mimeTypes[0];
  if (!firstMime) throw new TypeError('At least one MIME type is required');
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data).byteLength : data.byteLength;
  const navigator = deps.navigator ?? globalThis.navigator;
  let shareError: string | undefined;
  if (navigator?.share && navigator.canShare) {
    for (const mimeType of mimeTypes) {
      try {
        const file = new File([data], fileName, { type: mimeType });
        if (!navigator.canShare({ files: [file] })) continue;
        // Invoke share before the first suspension to preserve the tap's activation.
        await navigator.share({ files: [file] });
        return { method: 'share', mimeType, bytes };
      } catch (error) {
        // Keep the reason so callers can log why sharing fell back to a download.
        const details = typeof error === 'object' && error !== null ? error as { name?: unknown; message?: unknown } : undefined;
        const name = details?.name ? String(details.name) : String(error);
        shareError = details?.message ? `${name}: ${String(details.message)}` : name;
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
  return shareError ? { method: 'download', mimeType: firstMime, bytes, shareError } : { method: 'download', mimeType: firstMime, bytes };
}

export function saveGcode(gcode: ArrayBuffer, fileName: string, deps?: SaveDeps): Promise<SaveResult> {
  return saveFile(gcode, fileName, ['text/x.gcode', 'application/octet-stream', 'text/plain'], deps);
}

export function gcodeFileName(stlName: string): string {
  const name = stlName.split(/[/\\]/).pop()!.replace(/[<>:"|?*\x00-\x1f]/g, '').replace(/\.stl$/i, '');
  return `${name || 'model'}.gcode`;
}

const IMAGE_EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

export function previewImageFileName(stlName: string, mimeType = 'image/png'): string {
  const name = stlName.split(/[/\\]/).pop()!.replace(/[<>:"|?*\x00-\x1f]/g, '').replace(/\.stl$/i, '');
  return `${name || 'model'}-preview.${IMAGE_EXTENSIONS[mimeType] ?? 'png'}`;
}

/** Same save/share path as the G-code (`saveFile`), for the preview's "Save image" capture. */
export async function savePreviewImage(image: Blob, fileName: string, deps?: SaveDeps): Promise<SaveResult> {
  const bytes = await image.arrayBuffer();
  return saveFile(bytes, fileName, [image.type || 'image/png'], deps);
}
