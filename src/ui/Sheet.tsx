import { createEffect, createSignal, onCleanup, Show, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import { Button } from './Button';

export type Detent = 'peek' | 'half' | 'full';
export interface SheetProps {
  open: boolean; onClose: () => void; label: string; children: JSX.Element;
  detent?: Detent; onDetentChange?: (value: Detent) => void; handleLabel?: string;
}
export function Sheet(props: SheetProps) {
  let panel!: HTMLDivElement;
  let startY = 0;
  let dragged = false;
  const detents: Detent[] = ['peek', 'half', 'full'];
  const [local, setLocal] = createSignal<Detent>('half');
  const detent = () => props.detent ?? local();
  const change = (delta: number) => {
    const next = detents[Math.max(0, Math.min(2, detents.indexOf(detent()) + delta))]!;
    setLocal(next);
    props.onDetentChange?.(next);
  };
  createEffect(() => {
    if (!props.open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(panel.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]'))
      .filter(el => !el.matches(':disabled, [hidden], [aria-hidden="true"]') && el.tabIndex >= 0);
    const focus = () => (focusable()[0] ?? panel).focus();
    const contain = (event: FocusEvent) => { if (!panel.contains(event.target as Node)) focus(); };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); props.onClose(); }
      if (event.key !== 'Tab') return;
      const items = focusable();
      const index = items.indexOf(document.activeElement as HTMLElement);
      event.preventDefault();
      (items[(index + (event.shiftKey ? -1 : 1) + items.length) % items.length] ?? panel).focus();
    };
    focus();
    document.addEventListener('keydown', key);
    document.addEventListener('focusin', contain);
    onCleanup(() => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('focusin', contain);
      document.body.style.overflow = overflow;
      previous?.focus();
    });
  });
  return <Show when={props.open}><Portal><div class="ui-backdrop" onClick={e => { if (e.target === e.currentTarget) props.onClose(); }}>
    <div ref={panel} class="ui-sheet" role="dialog" aria-modal="true" aria-label={props.label} tabindex={-1}
      data-detent={detent()} style={{ height: { peek: '25dvh', half: '50dvh', full: '100dvh' }[detent()] }}>
      <Button class="ui-handle" variant="ghost" aria-label={props.handleLabel ?? 'Resize sheet'}
        onClick={() => { if (!dragged) change(detent() === 'full' ? -2 : 1); dragged = false; }}
        onPointerDown={e => { dragged = false; startY = e.clientY; e.currentTarget.setPointerCapture?.(e.pointerId); }}
        onPointerUp={e => { if (Math.abs(e.clientY - startY) > 20) { dragged = true; change(e.clientY < startY ? 1 : -1); } }}
        onKeyDown={e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); change(e.key === 'ArrowUp' ? 1 : -1); } }}>━</Button>
      {props.children}
    </div>
  </div></Portal></Show>;
}
