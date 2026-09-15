import { createEffect, createSignal, onCleanup, Show, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import './tokens.css';

export type Placement = 'top' | 'bottom' | 'left' | 'right';
export interface PopoverProps {
  open: boolean; anchor: HTMLElement; onClose: () => void; label: string;
  placement?: Placement; children: JSX.Element;
}
export function Popover(props: PopoverProps) {
  let panel!: HTMLDivElement;
  const [position, setPosition] = createSignal({ left: '0px', top: '0px' });
  const [side, setSide] = createSignal<Placement>('bottom');
  createEffect(() => {
    if (!props.open) return;
    const preferred = props.placement ?? 'bottom';
    const anchor = props.anchor;
    const update = () => {
      const a = anchor.getBoundingClientRect(), p = panel.getBoundingClientRect();
      const space = { top: a.top, bottom: innerHeight - a.bottom, left: a.left, right: innerWidth - a.right };
      const opposite: Record<Placement, Placement> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
      const needed = (preferred === 'top' || preferred === 'bottom' ? p.height : p.width) + 8;
      const next = space[preferred] < needed && space[opposite[preferred]] > space[preferred] ? opposite[preferred] : preferred;
      const x = next === 'left' ? a.left - p.width - 8 : next === 'right' ? a.right + 8 : a.left;
      const y = next === 'top' ? a.top - p.height - 8 : next === 'bottom' ? a.bottom + 8 : a.top;
      setSide(next);
      setPosition({ left: `${Math.max(8, Math.min(x, innerWidth - p.width - 8))}px`, top: `${Math.max(8, Math.min(y, innerHeight - p.height - 8))}px` });
    };
    const outside = (e: PointerEvent) => { if (!panel.contains(e.target as Node) && !anchor.contains(e.target as Node)) props.onClose(); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') props.onClose(); };
    update();
    panel.focus();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update);
    observer?.observe(panel);
    observer?.observe(anchor);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    onCleanup(() => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      if (panel.contains(document.activeElement)) anchor.focus();
    });
  });
  return <Show when={props.open}><Portal><div ref={panel} class="ui-popover" role="dialog" tabindex={-1}
    aria-label={props.label} data-placement={side()} style={position()}>{props.children}</div></Portal></Show>;
}
