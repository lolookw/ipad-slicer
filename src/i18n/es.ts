import type { Dictionary } from './en';

export const es = {
  app: {
    title: 'Slicer para iPad',
    stepsLabel: 'Pasos de laminado',
    engine: 'Motor',
    configurationError: 'Importa un modelo y elige un perfil compatible antes de laminar.',
  },
  steps: {
    import: 'Importar',
    configure: 'Configurar',
    preview: 'Vista previa',
    save: 'Guardar',
  },
  panes: {
    import: 'Importa un modelo para comenzar. Los ajustes siguen disponibles mientras eliges.',
    configure: 'La impresora, el material y la calidad se configuran aquí. El modo simple es el predeterminado.',
    preview: 'La placa y, después de laminar, la vista previa aparecen aquí.',
    save: 'Guarda el G-code en Archivos o compártelo.',
  },
  preferences: {
    heading: 'Preferencias',
    language: 'Idioma',
    theme: 'Apariencia',
    performance: 'Rendimiento',
    english: 'Inglés',
    spanish: 'Español',
    system: 'Sistema',
    light: 'Claro',
    dark: 'Oscuro',
    auto: 'Automático',
    standard: 'Estándar',
    full: 'Completo',
    activeTier: 'Nivel activo',
  },
} satisfies Dictionary;
