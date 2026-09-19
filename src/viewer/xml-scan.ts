/**
 * Minimal DOM-free XML scanner, enough for 3MF model and config parts (usable inside a worker).
 * It reports element boundaries and attributes only; text nodes are ignored. Comments, CDATA,
 * processing instructions and DOCTYPE are skipped, and custom entities are never expanded.
 */
const TOKEN = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<![^>]*>|<(\/?)([A-Za-z_][\w.:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
const ATTRIBUTE = /([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const ENTITY = /&(?:#x([0-9a-fA-F]+)|#(\d+)|(amp|lt|gt|quot|apos));/g;
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Drops a namespace prefix: `p:path` -> `path`, `m:colorgroup` -> `colorgroup`. */
export function localName(name: string): string {
  const colon = name.lastIndexOf(':');
  return colon < 0 ? name : name.slice(colon + 1);
}

function decode(value: string): string {
  return value.includes('&') ? value.replace(ENTITY, (_, hex, dec, named) =>
    named ? NAMED[named]! : String.fromCodePoint(Number.parseInt(hex ?? dec, hex ? 16 : 10))) : value;
}

export function parseAttributes(text: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  ATTRIBUTE.lastIndex = 0;
  for (let match = ATTRIBUTE.exec(text); match; match = ATTRIBUTE.exec(text))
    attributes[localName(match[1]!)] = decode(match[2] ?? match[3] ?? '');
  return attributes;
}

export interface XmlHandlers {
  open(name: string, attributes: () => Record<string, string>, selfClosing: boolean): void;
  close(name: string): void;
}

export function scanXml(xml: string, handlers: XmlHandlers): void {
  TOKEN.lastIndex = 0;
  for (let match = TOKEN.exec(xml); match; match = TOKEN.exec(xml)) {
    const name = match[2];
    if (name === undefined) continue;
    const local = localName(name);
    if (match[1]) { handlers.close(local); continue; }
    const selfClosing = match[4] === '/';
    const raw = match[3]!;
    handlers.open(local, () => parseAttributes(raw), selfClosing);
    if (selfClosing) handlers.close(local);
  }
}
