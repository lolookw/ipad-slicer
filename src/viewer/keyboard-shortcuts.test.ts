import { describe, expect, it } from 'vitest';
import { classifyShortcut, isEditableTarget, type ShortcutEvent } from './keyboard-shortcuts';

const event = (partial: Partial<ShortcutEvent> & { key: string }): ShortcutEvent =>
  ({ metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...partial });

describe('classifyShortcut', () => {
  it('recognizes Cmd/Ctrl+Z as undo, on either modifier and either key case', () => {
    expect(classifyShortcut(event({ key: 'z', metaKey: true }))).toBe('undo');
    expect(classifyShortcut(event({ key: 'Z', ctrlKey: true }))).toBe('undo');
  });

  it('recognizes Cmd/Ctrl+Shift+Z and Cmd/Ctrl+Y as redo', () => {
    expect(classifyShortcut(event({ key: 'z', metaKey: true, shiftKey: true }))).toBe('redo');
    expect(classifyShortcut(event({ key: 'y', ctrlKey: true }))).toBe('redo');
  });

  it('recognizes Cmd/Ctrl+A as select-all and Cmd/Ctrl+D as duplicate', () => {
    expect(classifyShortcut(event({ key: 'a', metaKey: true }))).toBe('selectAll');
    expect(classifyShortcut(event({ key: 'd', ctrlKey: true }))).toBe('duplicate');
  });

  it('recognizes a bare Delete or Backspace (no modifier) as delete', () => {
    expect(classifyShortcut(event({ key: 'Delete' }))).toBe('delete');
    expect(classifyShortcut(event({ key: 'Backspace' }))).toBe('delete');
  });

  it('does not treat Shift+Delete as the delete shortcut (reserved, e.g. some OS "delete forward")', () => {
    expect(classifyShortcut(event({ key: 'Delete', shiftKey: true }))).toBeNull();
  });

  it('ignores unrelated keys and bare modifierless letters', () => {
    expect(classifyShortcut(event({ key: 'z' }))).toBeNull();
    expect(classifyShortcut(event({ key: 'Enter' }))).toBeNull();
    expect(classifyShortcut(event({ key: 'ArrowLeft' }))).toBeNull();
  });

  it('never fires with Alt held (reserved for OS/IME)', () => {
    expect(classifyShortcut(event({ key: 'z', metaKey: true, altKey: true }))).toBeNull();
    expect(classifyShortcut(event({ key: 'Delete', altKey: true }))).toBeNull();
  });

  it('never fires with both Meta and Ctrl held at once (not a real chord on any platform)', () => {
    expect(classifyShortcut(event({ key: 'z', metaKey: true, ctrlKey: true }))).toBeNull();
  });
});

describe('isEditableTarget', () => {
  it('is true for input, textarea and select elements', () => {
    expect(isEditableTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isEditableTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isEditableTarget({ tagName: 'SELECT' })).toBe(true);
  });

  it('is true for a contenteditable element regardless of tag', () => {
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it('is false for a plain element, and for a missing target', () => {
    expect(isEditableTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isEditableTarget({ tagName: 'svg' })).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget(undefined)).toBe(false);
  });
});
