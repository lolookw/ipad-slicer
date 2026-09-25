/**
 * Pure keyboard-shortcut classification for the viewer, kept free of the DOM/SolidJS so it is fully
 * unit-testable. The caller (ViewerWorkspace.tsx) owns wiring this to window keydown and to the
 * actual undo/redo/select-all/delete/duplicate actions.
 */

export type ShortcutAction = 'undo' | 'redo' | 'selectAll' | 'delete' | 'duplicate';

/** The minimal event shape this module needs — matches KeyboardEvent, but never imports `lib.dom`
 * types directly so the classifier stays trivially testable with a plain object. */
export interface ShortcutEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** Either Cmd (macOS/iPadOS) or Ctrl (everything else) — never both at once (that is not a shortcut). */
function primaryModifier(event: ShortcutEvent): boolean {
  return (event.metaKey || event.ctrlKey) && !(event.metaKey && event.ctrlKey);
}

/**
 * Classifies a keydown into one of this app's shortcuts, or null if it is not one. Case-insensitive
 * on the letter (Shift is itself meaningful for Redo, so it is read separately, not via letter case).
 * Never fires on Alt-held combinations — those are reserved for the OS/IME on most keyboards.
 */
export function classifyShortcut(event: ShortcutEvent): ShortcutAction | null {
  if (event.altKey) return null;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (primaryModifier(event)) {
    if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
    if (key === 'y' && !event.shiftKey) return 'redo'; // the common Windows/Linux redo chord
    if (key === 'a' && !event.shiftKey) return 'selectAll';
    if (key === 'd' && !event.shiftKey) return 'duplicate';
    return null;
  }
  if (!event.shiftKey && (key === 'Delete' || key === 'Backspace')) return 'delete';
  return null;
}

/** The minimal shape this module needs from an event target — matches Element, kept structural so
 * tests can pass a plain object instead of a real DOM node. */
export interface TargetLike { tagName?: string; isContentEditable?: boolean }

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * True when the keydown's target is something the user is actively typing/choosing into — a number
 * field (Position/Rotation/Scale…), a text input, a select, or any contenteditable region. Shortcuts
 * MUST be suppressed here: pressing Backspace to edit a Position value, or Cmd+A to select a field's
 * text, must never be reinterpreted as "delete the model" / "select every object on the plate".
 */
export function isEditableTarget(target: TargetLike | null | undefined): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  return Boolean(target.tagName && EDITABLE_TAGS.has(target.tagName));
}
