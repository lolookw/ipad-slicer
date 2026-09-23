import { describe, expect, test } from 'vitest';
import { bindConnectivityEvents, connectivity } from './connectivity';

function fakeTarget() {
  const listeners: Record<string, (() => void)[]> = {};
  return {
    target: {
      addEventListener: (type: string, listener: () => void) => { (listeners[type] ??= []).push(listener); },
      removeEventListener: (type: string, listener: () => void) => { listeners[type] = (listeners[type] ?? []).filter((l) => l !== listener); },
    } as unknown as typeof window,
    fire(type: string) { for (const listener of listeners[type] ?? []) listener(); },
    listenerCount(type: string) { return (listeners[type] ?? []).length; },
  };
}

describe('bindConnectivityEvents', () => {
  test('flips the online signal on offline/online events', () => {
    const { target, fire } = fakeTarget();
    const unbind = bindConnectivityEvents(target);
    connectivity.setOnline(true);
    fire('offline');
    expect(connectivity.online()).toBe(false);
    fire('online');
    expect(connectivity.online()).toBe(true);
    unbind();
  });

  test('unsubscribe removes both listeners', () => {
    const { target, listenerCount } = fakeTarget();
    const unbind = bindConnectivityEvents(target);
    expect(listenerCount('online')).toBe(1);
    expect(listenerCount('offline')).toBe(1);
    unbind();
    expect(listenerCount('online')).toBe(0);
    expect(listenerCount('offline')).toBe(0);
  });

  test('is a no-op with no target (SSR/non-browser)', () => {
    expect(() => bindConnectivityEvents(undefined)()).not.toThrow();
  });
});
