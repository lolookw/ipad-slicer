import { type JSX } from 'solid-js';
import { useApp } from '../AppProvider';

/**
 * Regular width: a persistent sidebar next to the canvas, the iPad pattern.
 * Compact width: the same regions stacked, with the controls above the canvas.
 * Safe-area insets are applied here once, so panes never handle them.
 */
export function Layout(props: { sidebar: JSX.Element; canvas: JSX.Element }): JSX.Element {
  const app = useApp();
  return (
    <div class="layout" data-layout={app.isRegular() ? 'regular' : 'compact'}>
      <aside class="layout-sidebar">{props.sidebar}</aside>
      <main class="layout-canvas">{props.canvas}</main>
    </div>
  );
}
