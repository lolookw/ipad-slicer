import { render } from 'solid-js/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdateToast, type UpdateToastLabels } from './UpdateToast';

const labels: UpdateToastLabels = { message: 'A new version is ready.', update: 'Update', dismiss: 'Not now' };

let host: HTMLDivElement;
let dispose: (() => void) | undefined;
beforeEach(() => { host = document.createElement('div'); document.body.append(host); });
afterEach(() => { dispose?.(); host.remove(); });

describe('UpdateToast', () => {
  it('renders nothing when closed', () => {
    dispose = render(() => <UpdateToast open={false} labels={labels} onAccept={vi.fn()} onDismiss={vi.fn()} />, host);
    expect(host.querySelector('.update-toast')).toBeNull();
  });

  it('shows the message and both actions when open', () => {
    dispose = render(() => <UpdateToast open={true} labels={labels} onAccept={vi.fn()} onDismiss={vi.fn()} />, host);
    expect(host.textContent).toContain('A new version is ready.');
    expect([...host.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['Update', 'Not now']);
  });

  it('calls onAccept and onDismiss from the matching button', () => {
    const onAccept = vi.fn(); const onDismiss = vi.fn();
    dispose = render(() => <UpdateToast open={true} labels={labels} onAccept={onAccept} onDismiss={onDismiss} />, host);
    const buttons = [...host.querySelectorAll('button')];
    buttons[0]!.click();
    expect(onAccept).toHaveBeenCalledOnce();
    buttons[1]!.click();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('meets the 44px touch target via the shared Button primitive', () => {
    dispose = render(() => <UpdateToast open={true} labels={labels} onAccept={vi.fn()} onDismiss={vi.fn()} />, host);
    for (const button of host.querySelectorAll('button')) expect(button.classList.contains('ui-target')).toBe(true);
  });
});
