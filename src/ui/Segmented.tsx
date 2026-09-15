import { For } from 'solid-js';
import './tokens.css';

export interface SegmentedProps {
  label: string; options: readonly { value: string; label: string }[];
  value: string; onChange: (value: string) => void; disabled?: boolean;
}
export function Segmented(props: SegmentedProps) {
  return <div class="ui-segmented" role="radiogroup" aria-label={props.label} aria-disabled={props.disabled}>
    <For each={props.options}>{(option, index) => <button type="button" class="ui-target" role="radio"
      aria-checked={props.value === option.value} disabled={props.disabled}
      tabindex={props.value === option.value || (!props.options.some(o => o.value === props.value) && index() === 0) ? 0 : -1}
      onClick={() => props.onChange(option.value)} onKeyDown={e => {
        const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (delta === undefined && e.key !== 'Home' && e.key !== 'End') return;
        e.preventDefault();
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? props.options.length - 1 : (index() + (delta ?? 0) + props.options.length) % props.options.length;
        props.onChange(props.options[next]!.value);
        (e.currentTarget.parentElement?.children[next] as HTMLElement).focus();
      }}>{option.label}</button>}</For>
  </div>;
}
