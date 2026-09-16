export type Theme = 'system' | 'light' | 'dark';
export const THEME_STORAGE_KEY = 'ipad-slicer:theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

export function resolveTheme(value: string | null): Theme {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

export function effectiveTheme(theme: Theme, systemDark: boolean): 'light' | 'dark' {
  return theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
}

export interface ThemeEnvironment {
  root: HTMLElement;
  storage: Pick<Storage, 'setItem'>;
  media: MediaQueryList;
}

export function createThemeController(env: ThemeEnvironment) {
  let preference: Theme = 'system';
  const render = () => {
    env.root.dataset.theme = preference;
    env.root.dataset.colorScheme = effectiveTheme(preference, env.media.matches);
  };
  const onSystemChange = () => render();
  env.media.addEventListener('change', onSystemChange);
  return {
    apply(theme: Theme): void {
      preference = theme;
      env.storage.setItem(THEME_STORAGE_KEY, theme);
      render();
    },
    dispose(): void {
      env.media.removeEventListener('change', onSystemChange);
    },
  };
}

export function browserThemeEnvironment(): ThemeEnvironment | undefined {
  if (typeof document === 'undefined' || typeof localStorage === 'undefined') return;
  const fallbackMedia = {
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  } as unknown as MediaQueryList;
  return {
    root: document.documentElement,
    storage: localStorage,
    media: globalThis.matchMedia?.(DARK_QUERY) ?? fallbackMedia,
  };
}
