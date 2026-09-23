import { For } from 'solid-js';
import { Button } from '../../ui/Button';
import type { ViewPreset } from '../camera';
import './viewer-components.css';

export type ViewCommand = 'fit' | ViewPreset;

export interface ViewPresetLabels { group: string; fit: string; top: string; front: string; iso: string }

/** Floating camera shortcuts: frame everything, or snap to a standard view. */
export function ViewPresets(props: { labels: ViewPresetLabels; onView: (command: ViewCommand) => void }) {
  const items = (): { command: ViewCommand; label: string }[] => [
    { command: 'fit', label: props.labels.fit }, { command: 'top', label: props.labels.top },
    { command: 'front', label: props.labels.front }, { command: 'iso', label: props.labels.iso },
  ];
  return <div class="viewer-view-presets" role="group" aria-label={props.labels.group}>
    <For each={items()}>{item =>
      <Button variant="secondary" data-view={item.command} onClick={() => props.onView(item.command)}>{item.label}</Button>}
    </For>
  </div>;
}
