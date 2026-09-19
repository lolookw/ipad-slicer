import { render } from 'solid-js/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportPane, type ImportPaneLabels, type ImportPaneProps } from './ImportPane';

const labels: ImportPaneLabels = {
  heading: 'Import a model', upload: 'Upload from device', dropTitle: 'Drop STL or 3MF files here', dropActive: 'Release to add the files',
  formats: 'Accepted formats: STL and 3MF.', limits: '1/4 objects on the plate. Up to 100 triangles in total.', importing: 'Reading the file…',
  continue: 'Continue to Configure', sourcesHeading: 'Get models', sourcesNote: 'Download an STL or 3MF there, then upload it here.',
  licenseNote: 'Models keep their own licenses.', opensNewTab: 'opens in a new tab',
};
const sources = [{ name: 'Printables', href: 'https://www.printables.com/' }, { name: 'Thingiverse', href: 'https://www.thingiverse.com/' }, { name: 'MakerWorld', href: 'https://makerworld.com/' }];

let host: HTMLDivElement;
let dispose: (() => void) | undefined;
function mount(props: Partial<ImportPaneProps> = {}) {
  const onFiles = vi.fn();
  const onContinue = vi.fn();
  dispose = render(() => <ImportPane labels={labels} busy={false} canContinue={false} sources={sources} onFiles={onFiles} onContinue={onContinue} {...props} />, host);
  return { onFiles, onContinue };
}
beforeEach(() => { host = document.createElement('div'); document.body.append(host); });
afterEach(() => { dispose?.(); host.remove(); });

const dragEvent = (type: string, dataTransfer: object) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
  return event;
};

describe('ImportPane', () => {
  it('shows the primary upload button, accepted formats and limits without restricting the file picker', () => {
    mount();
    const upload = [...host.querySelectorAll('button')].find(button => button.textContent === 'Upload from device')!;
    expect(upload).toBeDefined();
    expect(upload.dataset.variant).toBe('primary');
    expect(host.textContent).toContain('Accepted formats: STL and 3MF.');
    expect(host.textContent).toContain('1/4 objects on the plate');
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input.accept).toBe('');
    expect(input.multiple).toBe(true);
  });

  it('opens the file picker from the upload button and forwards selected files', () => {
    const { onFiles } = mount();
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    const click = vi.spyOn(input, 'click');
    host.querySelector<HTMLButtonElement>('.import-upload')!.click();
    expect(click).toHaveBeenCalled();
    const file = new File(['x'], 'a.stl');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onFiles).toHaveBeenCalledWith([file]);
  });

  it('accepts dropped files and highlights the zone while dragging', () => {
    const { onFiles } = mount();
    const zone = host.querySelector<HTMLElement>('[data-testid="import-drop-zone"]')!;
    const over = dragEvent('dragover', { types: ['Files'] });
    zone.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    expect(zone.dataset.dragging).toBe('true');
    const file = new File(['x'], 'b.3mf');
    zone.dispatchEvent(dragEvent('drop', { files: [file], types: ['Files'] }));
    expect(onFiles).toHaveBeenCalledWith([file]);
    expect(zone.dataset.dragging).toBeUndefined();
  });

  it('disables upload and ignores drops while an import runs', () => {
    const { onFiles } = mount({ busy: true });
    expect(host.querySelector<HTMLButtonElement>('.import-upload')!.disabled).toBe(true);
    host.querySelector('[data-testid="import-drop-zone"]')!.dispatchEvent(dragEvent('drop', { files: [new File(['x'], 'c.stl')], types: ['Files'] }));
    expect(onFiles).not.toHaveBeenCalled();
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Reading the file…');
  });

  it('offers Continue to Configure only after a model exists', () => {
    mount();
    expect(host.querySelector('.import-continue')).toBeNull();
  });

  it('continues and shows result and error messages', () => {
    const { onContinue } = mount({ canContinue: true, error: 'The STL file could not be parsed.', labels: { ...labels, success: 'Model added to the plate.' } });
    host.querySelector<HTMLButtonElement>('.import-continue')!.click();
    expect(onContinue).toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('The STL file could not be parsed.');
    expect(host.querySelector('.import-success')?.textContent).toBe('Model added to the plate.');
  });

  it('links to the three catalogs safely, with the license note', () => {
    mount();
    const links = [...host.querySelectorAll<HTMLAnchorElement>('.import-sources a')];
    expect(links.map(link => link.href)).toEqual(['https://www.printables.com/', 'https://www.thingiverse.com/', 'https://makerworld.com/']);
    for (const link of links) { expect(link.target).toBe('_blank'); expect(link.rel).toBe('noopener noreferrer'); }
    expect(host.textContent).toContain('Download an STL or 3MF there, then upload it here.');
    expect(host.textContent).toContain('Models keep their own licenses.');
  });
});
