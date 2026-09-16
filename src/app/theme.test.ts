import { expect, it, vi } from 'vitest';
import { createThemeController, effectiveTheme, resolveTheme, THEME_STORAGE_KEY } from './theme';

it('resolves persisted themes and falls back to system', () => {
  expect(resolveTheme('dark')).toBe('dark');
  expect(resolveTheme('unknown')).toBe('system');
  expect(effectiveTheme('system', true)).toBe('dark');
});

it('persists changes and follows system appearance while system is selected', () => {
  let listener: (() => void) | undefined;
  const media = {
    matches: false,
    addEventListener: vi.fn((_name, value) => { listener = value; }),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList;
  const root = document.createElement('html');
  const storage = { setItem: vi.fn() };
  const controller = createThemeController({ root, storage, media });
  controller.apply('system');
  expect(root.dataset.colorScheme).toBe('light');
  Object.defineProperty(media, 'matches', { value: true });
  listener?.();
  expect(root.dataset.colorScheme).toBe('dark');
  expect(storage.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'system');
  controller.dispose();
});

