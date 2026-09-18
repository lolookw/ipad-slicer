import { type JSX } from 'solid-js';
import { useApp } from '../AppProvider';

/**
 * Regular width: a top bar over the canvas, with the settings panel beside it (landscape) or below it (portrait).
 * Compact width: the same regions stacked, with the controls above the canvas.
 * Safe-area insets are applied here once, so panes never handle them.
 */
export function Layout(props: { sidebar: JSX.Element; canvas: JSX.Element }): JSX.Element {
  const app = useApp();
  return (
    <div class="layout" data-layout={app.isRegular() ? 'regular' : 'compact'}>
      <header class="layout-topbar">{props.sidebar}</header>
      <main class="layout-canvas">{props.canvas}</main>
    </div>
  );
}
