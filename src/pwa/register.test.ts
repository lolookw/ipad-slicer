import { describe, expect, test } from 'vitest';
import { createUpdateGate, shouldKillSwitch } from './register';

describe('shouldKillSwitch', () => {
  test('true only for an exact ?sw-kill=1', () => {
    expect(shouldKillSwitch('?sw-kill=1')).toBe(true);
    expect(shouldKillSwitch('?sw-kill=1&foo=bar')).toBe(true);
  });
  test('false otherwise', () => {
    expect(shouldKillSwitch('')).toBe(false);
    expect(shouldKillSwitch('?sw-kill=0')).toBe(false);
    expect(shouldKillSwitch('?sw-kill=true')).toBe(false);
    expect(shouldKillSwitch('?other=1')).toBe(false);
  });
});

describe('createUpdateGate', () => {
  test('applies immediately when idle', () => {
    const gate = createUpdateGate(() => false);
    expect(gate.requestApply()).toBe('apply');
    expect(gate.isPending()).toBe(false);
  });

  test('defers while busy, including a still-finishing soft-canceled single-thread slice', () => {
    let busy = true;
    const gate = createUpdateGate(() => busy);
    expect(gate.requestApply()).toBe('deferred');
    expect(gate.isPending()).toBe(true);
    // Still busy: checkIdle must not fire yet.
    expect(gate.checkIdle()).toBe(false);
    busy = false;
    expect(gate.checkIdle()).toBe(true);
    // Fires exactly once.
    expect(gate.checkIdle()).toBe(false);
    expect(gate.isPending()).toBe(false);
  });

  test('checkIdle is a no-op when nothing is pending', () => {
    const gate = createUpdateGate(() => false);
    expect(gate.checkIdle()).toBe(false);
  });

  test('a second accept while already deferred stays deferred and still applies exactly once when idle', () => {
    let busy = true;
    const gate = createUpdateGate(() => busy);
    expect(gate.requestApply()).toBe('deferred');
    expect(gate.requestApply()).toBe('deferred');
    busy = false;
    expect(gate.checkIdle()).toBe(true);
    expect(gate.checkIdle()).toBe(false);
  });
});
