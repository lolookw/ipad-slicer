import { For, Show, createSignal, type JSX } from 'solid-js';
import { Button } from '../../ui';

export interface ImportSource { name: string; href: string }
export interface ImportPaneLabels {
  heading: string; upload: string; dropTitle: string; dropActive: string; formats: string; limits: string;
  importing: string; success?: string; continue: string; sourcesHeading: string; sourcesNote: string; licenseNote: string; opensNewTab: string;
}
export interface ImportPaneProps {
  labels: ImportPaneLabels;
  busy: boolean;
  error?: string;
  canContinue: boolean;
  sources: readonly ImportSource[];
  onFiles(files: File[]): void;
  onContinue(): void;
}

/** Presentational Import step: upload button, drop zone, limits, next action and external model sources. */
export function ImportPane(props: ImportPaneProps): JSX.Element {
  let input!: HTMLInputElement;
  const [dragging, setDragging] = createSignal(false);
  const hasFiles = (event: DragEvent) => [...(event.dataTransfer?.types ?? [])].includes('Files');
  return (
    <div class="import-pane">
      <h2 class="import-heading">{props.labels.heading}</h2>
      <div class="import-drop" data-dragging={dragging() ? 'true' : undefined} data-testid="import-drop-zone"
        onDragEnter={(event) => { if (hasFiles(event)) { event.preventDefault(); setDragging(true); } }}
        onDragOver={(event) => { if (hasFiles(event)) { event.preventDefault(); setDragging(true); } }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
        onDrop={(event) => {
          event.preventDefault(); setDragging(false);
          const files = Array.from(event.dataTransfer?.files ?? []);
          if (files.length && !props.busy) props.onFiles(files);
        }}>
        <p class="import-drop-title">{dragging() ? props.labels.dropActive : props.labels.dropTitle}</p>
        <p class="import-formats">{props.labels.formats}</p>
        {/* No `accept`: iPadOS greys out .stl files when it is set. The parser validates by extension and content. */}
        <input ref={input} type="file" multiple hidden tabindex="-1" aria-hidden="true" data-testid="import-file-input"
          onChange={(event) => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ''; if (files.length) props.onFiles(files); }} />
        <Button class="import-upload" variant={props.canContinue ? 'secondary' : 'primary'} size="large" disabled={props.busy} onClick={() => input.click()}>
          {props.labels.upload}
        </Button>
      </div>
      <p class="import-limits">{props.labels.limits}</p>
      <Show when={props.busy}><p class="import-status" role="status">{props.labels.importing}</p></Show>
      <Show when={props.error}>{message => <p class="import-error" role="alert">{message()}</p>}</Show>
      <Show when={!props.busy && props.labels.success}>{message => <p class="import-success" role="status">{message()}</p>}</Show>
      <Show when={props.canContinue}>
        <Button class="import-continue" size="large" onClick={() => props.onContinue()}>{props.labels.continue}</Button>
      </Show>
      <section class="import-sources" aria-label={props.labels.sourcesHeading}>
        <h3>{props.labels.sourcesHeading}</h3>
        <p>{props.labels.sourcesNote}</p>
        <ul>
          <For each={props.sources}>{(source) =>
            <li><a class="ui-target" href={source.href} target="_blank" rel="noopener noreferrer" aria-label={`${source.name} (${props.labels.opensNewTab})`}>{source.name}<span aria-hidden="true"> ↗</span></a></li>}
          </For>
        </ul>
        <p class="import-license">{props.labels.licenseNote}</p>
      </section>
    </div>
  );
}
