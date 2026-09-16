export const en = {
  app: {
    title: 'iPad Slicer',
    stepsLabel: 'Slicing steps',
    engine: 'Engine',
    configurationError: 'Import a model and choose a compatible profile before slicing.',
  },
  steps: {
    import: 'Import',
    configure: 'Configure',
    preview: 'Preview',
    save: 'Save',
  },
  panes: {
    import: 'Import a model to start. Slice settings stay available while you choose.',
    configure: 'Printer, material and quality live here. Simple mode is the default.',
    preview: 'The plate and, after slicing, the toolpath preview appear here.',
    save: 'Save the G-code to Files or share it.',
  },
  preferences: {
    heading: 'Preferences',
    language: 'Language',
    theme: 'Appearance',
    performance: 'Performance',
    english: 'English',
    spanish: 'Spanish',
    system: 'System',
    light: 'Light',
    dark: 'Dark',
    auto: 'Auto',
    standard: 'Standard',
    full: 'Full',
    activeTier: 'Active tier',
  },
} as const;

type WidenStrings<T> = T extends string ? string : { readonly [K in keyof T]: WidenStrings<T[K]> };
export type Dictionary = WidenStrings<typeof en>;

