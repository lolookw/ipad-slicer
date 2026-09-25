// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { PreviewOptionsPanel, type PreviewOptionsLabels, type PreviewOptionsPanelProps } from './PreviewOptionsPanel';
import type { FeatureRoleValue, PreviewState } from './adapter';

afterEach(() => cleanup());

const labels: PreviewOptionsLabels = {
  toggle: 'Preview options', colorMode: 'Color by',
  colorModeNames: { single: 'Single color', feature: 'Feature type', feedrate: 'Speed', layerHeight: 'Height', object: 'By object',
    tool: 'By tool', filament: 'By filament', colorChange: 'By color change', moveKind: 'Move type', power: 'Tool power' },
  featureLegend: 'Feature legend',
  featureRoleNames: { perimeter: 'Perimeter', externalPerimeter: 'Outer perimeter', infill: 'Infill', solidInfill: 'Solid infill',
    support: 'Support', skirt: 'Skirt', brim: 'Brim', bridge: 'Bridge', travel: 'Travel', primeTower: 'Prime tower',
    wipeTower: 'Wipe tower', raft: 'Raft', purge: 'Purge' },
  declutter: 'Hide from view', travel: 'Travel moves', wipe: 'Wipe moves', retractions: 'Retraction markers',
  viewPresets: 'Camera views', fit: 'Fit', top: 'Top', front: 'Front', iso: 'Iso',
  saveImage: 'Save preview image', saveImageBusy: 'Saving image…',
  estimatedTime: 'Estimated print time', kinematicNote: "approximate, not the slicer's own estimate",
};

function baseState(overrides: Partial<PreviewState> = {}): PreviewState {
  return {
    parsing: false, parseProgress: null,
    summary: { segments: 10, layers: 5, complete: true, stopReason: undefined, capabilities: {}, warnings: 0 },
    metadata: undefined, activeQuality: null, presentation: 'lines' as never, layerCount: 5, segmentCount: 10, disclosure: '',
    totalTimeMs: null, timeEstimateSource: null, availableColorModes: ['single', 'tool', 'moveKind'],
    hasRetractions: false, hasColorChanges: false, error: null,
    ...overrides,
  };
}

function setup(overrides: Partial<PreviewOptionsPanelProps> = {}) {
  const onColorModeChange = vi.fn(); const onToggleRole = vi.fn(); const onShowTravelChange = vi.fn();
  const onShowWipeChange = vi.fn(); const onShowRetractionsChange = vi.fn(); const onView = vi.fn(); const onCapture = vi.fn();
  const props: PreviewOptionsPanelProps = {
    state: baseState(), stage: 'all-visible', colorMode: 'single', onColorModeChange,
    hiddenRoles: new Set<FeatureRoleValue>(), onToggleRole,
    showTravel: true, onShowTravelChange, showWipe: true, onShowWipeChange, showRetractions: false, onShowRetractionsChange,
    onView, onCapture, captureBusy: false, labels, ...overrides,
  };
  const view = render(() => <PreviewOptionsPanel {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Preview options' }));
  return { view, onColorModeChange, onToggleRole, onShowTravelChange, onShowWipeChange, onShowRetractionsChange, onView, onCapture };
}

it('offers only the capability-gated color modes, never a raw technical name', () => {
  setup({ state: baseState({ availableColorModes: ['single', 'feature'] }) });
  expect(screen.getByRole('radio', { name: 'Single color' })).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Feature type' })).toBeTruthy();
  expect(screen.queryByRole('radio', { name: 'Speed' })).toBeNull();
});

it('shows the feature legend only in feature color mode, with a swatch per role', () => {
  setup({ colorMode: 'single' });
  expect(screen.queryByText('Feature legend')).toBeNull();
  cleanup();
  setup({ colorMode: 'feature', state: baseState({ availableColorModes: ['single', 'feature'] }) });
  expect(screen.getByText('Feature legend')).toBeTruthy();
  expect(screen.getByText('Skirt')).toBeTruthy();
  expect(screen.getByText('Perimeter')).toBeTruthy();
});

it('changing the color mode calls back with the raw capability name', () => {
  const { onColorModeChange } = setup({ state: baseState({ availableColorModes: ['single', 'feature'] }) });
  fireEvent.click(screen.getByRole('radio', { name: 'Feature type' }));
  expect(onColorModeChange).toHaveBeenCalledWith('feature');
});

it('gates the declutter row on capabilities.featureRoles === known, and hides it otherwise', () => {
  setup({ state: baseState({ summary: { ...baseState().summary!, capabilities: {} } }) });
  expect(screen.queryByText('Hide from view')).toBeNull();
  cleanup();
  const { onToggleRole } = setup({ state: baseState({ summary: { ...baseState().summary!, capabilities: { featureRoles: 'known' } } }) });
  expect(screen.getByText('Hide from view')).toBeTruthy();
  const skirt = screen.getByRole('checkbox', { name: 'Skirt' }) as HTMLInputElement;
  expect(skirt.checked).toBe(true); // visible (not hidden) by default
  fireEvent.click(skirt);
  expect(onToggleRole).toHaveBeenCalledWith(6, false);
});

it('does not error hiding Skirt/Brim via the declutter toggle, and reflects an already-hidden role', () => {
  setup({
    state: baseState({ summary: { ...baseState().summary!, capabilities: { featureRoles: 'known' } } }),
    hiddenRoles: new Set<FeatureRoleValue>([6]),
  });
  const skirt = screen.getByRole('checkbox', { name: 'Skirt' }) as HTMLInputElement;
  expect(skirt.checked).toBe(false);
});

it('shows the retractions toggle only when the file carries retraction events', () => {
  setup({ state: baseState({ hasRetractions: false }) });
  expect(screen.queryByText('Retraction markers')).toBeNull();
  cleanup();
  setup({ state: baseState({ hasRetractions: true }) });
  expect(screen.getByText('Retraction markers')).toBeTruthy();
});

it('toggles travel and wipe unconditionally', () => {
  const { onShowTravelChange, onShowWipeChange } = setup();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Travel moves' }));
  expect(onShowTravelChange).toHaveBeenCalledWith(false);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Wipe moves' }));
  expect(onShowWipeChange).toHaveBeenCalledWith(false);
});

it('calls onView with fit/top/front/iso from the view preset row', () => {
  const { onView } = setup();
  for (const [label, command] of [['Fit', 'fit'], ['Top', 'top'], ['Front', 'front'], ['Iso', 'iso']] as const) {
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(onView).toHaveBeenLastCalledWith(command);
  }
});

it('produces a downloadable file via onCapture, and reflects captureBusy without erroring', () => {
  const { onCapture, view } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Save preview image' }));
  expect(onCapture).toHaveBeenCalledOnce();
  view.unmount();
  setup({ captureBusy: true });
  expect((screen.getByRole('button', { name: 'Saving image…' }) as HTMLButtonElement).disabled).toBe(true);
});

it('only shows the (kinematic, whole-file) time estimate at the all-visible stage', () => {
  setup({ stage: 'window', state: baseState({ timeEstimateSource: 'kinematic', totalTimeMs: 90_000 }) });
  expect(screen.queryByText(/Estimated print time/)).toBeNull();
  cleanup();
  setup({ stage: 'all-visible', state: baseState({ timeEstimateSource: 'slicer', totalTimeMs: 90_000 }) });
  expect(screen.queryByText(/Estimated print time/)).toBeNull(); // the slicer's own number is shown elsewhere already
  cleanup();
  setup({ stage: 'all-visible', state: baseState({ timeEstimateSource: 'kinematic', totalTimeMs: 90_000 }) });
  expect(screen.getByText(/Estimated print time: 2m/)).toBeTruthy();
  expect(screen.getByText(/approximate/)).toBeTruthy();
});
