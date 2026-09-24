import { For } from 'solid-js';
import type { PlateObject } from '../../app/stores/plate';
import './viewer-components.css';

export interface ModelsListLabels {
  hide: (name: string) => string;
  show: (name: string) => string;
  menu: (name: string) => string;
  duplicate: (name: string) => string;
  delete: (name: string) => string;
  rename: (name: string) => string;
  renamePrompt: string;
}

export interface ModelsListProps {
  objects: readonly PlateObject[];
  selectedId: string | undefined;
  label: string;
  labels: ModelsListLabels;
  /** Wide layout only: whether the Models drawer is open (viewer-components.css ignores this under 1000px, where the list is always shown inline). */
  open?: boolean;
  onSelect: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

const Svg = (props: { d: string }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={props.d} /></svg>;
const CUBE_ICON = 'M12 2l8.5 4.9v10.2L12 22l-8.5-4.9V6.9zM3.5 6.9L12 12l8.5-5.1M12 12v10';
const EYE_ICON = 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z';
const EYE_OFF_ICON = 'M3 3l18 18 M10.6 5.2A11 11 0 0 1 12 5c7 0 11 7 11 7a17.9 17.9 0 0 1-4.2 4.9 M6.5 6.7A18 18 0 0 0 1 12s4 7 11 7a10.6 10.6 0 0 0 4.2-.8 M9.5 9.6a3 3 0 0 0 4.2 4.2';

/**
 * Each object is one name button (click to select) plus a visibility eye-toggle and a "..." menu
 * (rename/duplicate/delete). The name button keeps exactly the same role, accessible name,
 * `aria-pressed` and `data-transform` contract the old plain chip row used, so it is still the same
 * element every existing "select this object" / "read its transform" test targets — only the row
 * around it grew richer. Layout (inline strip vs. a toggleable drawer) is entirely CSS, driven by
 * the `.models-list` class in viewer-components.css.
 */
export function ModelsList(props: ModelsListProps): import('solid-js').JSX.Element {
  const rename = (object: PlateObject) => {
    const next = globalThis.prompt(props.labels.renamePrompt, object.name);
    if (next && next.trim() && next.trim() !== object.name) props.onRename(object.id, next.trim());
  };
  return <nav class="models-list" aria-label={props.label} data-open={props.open ?? true}>
    <ul>
      <For each={props.objects}>{object => {
        const visible = () => object.visible !== false;
        const selected = () => props.selectedId === object.id;
        return <li class="models-item" data-selected={selected()}>
          <span class="models-item-icon" aria-hidden="true"><Svg d={CUBE_ICON} /></span>
          <button type="button" class="models-item-name" aria-pressed={selected()}
            data-transform={JSON.stringify(object.transform)} onClick={() => props.onSelect(object.id)}>{object.name}</button>
          <button type="button" class="models-item-eye" aria-pressed={visible()}
            aria-label={visible() ? props.labels.hide(object.name) : props.labels.show(object.name)}
            onClick={() => props.onToggleVisible(object.id)}><Svg d={visible() ? EYE_ICON : EYE_OFF_ICON} /></button>
          <details class="models-item-menu">
            <summary aria-label={props.labels.menu(object.name)}>⋯</summary>
            <div class="models-item-menu-actions">
              <button type="button" onClick={() => rename(object)}>{props.labels.rename(object.name)}</button>
              <button type="button" onClick={() => props.onDuplicate(object.id)}>{props.labels.duplicate(object.name)}</button>
              <button type="button" class="models-item-danger" onClick={() => props.onDelete(object.id)}>{props.labels.delete(object.name)}</button>
            </div>
          </details>
        </li>;
      }}</For>
    </ul>
  </nav>;
}
