import { expect, it } from 'vitest';
import { rendererLimits } from './renderer';

it('caps Standard tier to a lower DPR with antialiasing off and no WebGPU opt-in', () => {
  expect(rendererLimits('standard')).toEqual({ dprCap: 1.5, antialias: false, webgpuOptIn: false });
});

it('gives Full tier a higher DPR, antialiasing, and the WebGPU opt-in', () => {
  expect(rendererLimits('full')).toEqual({ dprCap: 2, antialias: true, webgpuOptIn: true });
});
