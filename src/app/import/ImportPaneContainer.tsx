import type { JSX } from 'solid-js';
import { flow } from '../stores';
import { plate } from '../stores/plate';
import { formatNumber } from '../../i18n/format';
import { importSession } from '../../viewer/import-session';
import { useApp } from '../AppProvider';
import { ImportPane, type ImportSource } from './ImportPane';

/** External catalogs only: plain links, no API calls, scraping or proxying. */
const SOURCES: readonly ImportSource[] = [
  { name: 'Printables', href: 'https://www.printables.com/' },
  { name: 'Thingiverse', href: 'https://www.thingiverse.com/' },
  { name: 'MakerWorld', href: 'https://makerworld.com/' },
];

export function ImportPaneContainer(): JSX.Element {
  const app = useApp();
  const fill = (template: string, values: Record<string, string | number>) =>
    Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), template);
  const labels = () => {
    const limits = app.tierDecision().limits;
    const added = importSession.lastImported();
    return {
      heading: app.t('import.heading'), upload: app.t('import.upload'), dropTitle: app.t('import.dropTitle'), dropActive: app.t('import.dropActive'),
      formats: app.t('import.formats'),
      limits: fill(app.t('import.limits'), { count: plate.state.objects.length, limit: limits.objects, triangles: formatNumber(limits.triangles, app.prefs.locale.get()) }),
      importing: app.t('import.importing'),
      success: added === 0 ? undefined : added === 1 ? app.t('import.addedOne') : fill(app.t('import.addedMany'), { count: added }),
      continue: app.t('import.continue'), sourcesHeading: app.t('import.sourcesHeading'), sourcesNote: app.t('import.sourcesNote'),
      licenseNote: app.t('import.licenseNote'), opensNewTab: app.t('import.opensNewTab'),
    };
  };
  const failure = importSession.error;
  return (
    <ImportPane
      labels={labels()}
      busy={importSession.busy()}
      error={failure() ? app.translateError(failure()!) : undefined}
      canContinue={flow.hasModel.get()}
      sources={SOURCES}
      onFiles={(files) => { void importSession.importFiles(files, { ...app.tierDecision().limits }); }}
      onContinue={() => { app.goTo('configure'); }}
    />
  );
}
