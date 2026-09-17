import { For, createSignal, type JSX } from 'solid-js';
import { saveFile } from '../export/save-gcode';
import { probeThreading, type ProbeResult } from '../engine/probe';
import { ENGINE_VARIANT_STORAGE_KEY, engineClient, resolveVariantPreference } from '../engine/client';
import { diagnosticsLog, type LogEntry, type StorageLike } from '../instrumentation/log';
import type { VariantPreference } from '../slice/crash-marker';
import { formatBytes, summarizeLog } from './metrics';

export interface DiagnosticsLabels {
  heading: string; isolation: string; variant: string; auto: string; st: string; mt: string;
  unavailableMt: string; retryMt: string; retryMtSuccess: string; export: string; recent: string; load: string; slice: string; heap: string;
}

interface Props {
  labels: DiagnosticsLabels;
  storage?: StorageLike;
  entries?: () => LogEntry[];
  probe?: () => ProbeResult;
  reload?: () => void;
  exportJson?: (json: string, name: string) => Promise<unknown>;
  retryMultithread?: () => void;
}

export function DiagnosticsSheet(props: Props): JSX.Element {
  const storage = props.storage ?? globalThis.localStorage;
  const entries = props.entries ?? diagnosticsLog.entries;
  const [preference, setPreference] = createSignal(resolveVariantPreference(storage?.getItem(ENGINE_VARIANT_STORAGE_KEY) ?? null));
  const [notice, setNotice] = createSignal('');
  const metrics = () => summarizeLog(entries());
  const select = (target: HTMLSelectElement, next: VariantPreference) => {
    if (next === 'mt' && (props.probe ?? probeThreading)().variant !== 'mt') {
      setNotice(props.labels.unavailableMt);
      target.value = preference(); // the native <select> already flipped to the rejected option; revert the display
      return;
    }
    storage?.setItem(ENGINE_VARIANT_STORAGE_KEY, next); setPreference(next); (props.reload ?? (() => location.reload()))();
  };
  const exportLog = () => {
    const json = JSON.stringify({ format: 'ipad-slicer.diagnostics', version: 1, crossOriginIsolated: globalThis.crossOriginIsolated ?? false, entries: entries() }, null, 2);
    const name = `ipad-slicer-diagnostics-${new Date().toISOString().replaceAll(':', '-')}.json`;
    return (props.exportJson ?? ((data, file) => saveFile(data, file, ['application/json'])))(json, name);
  };
  const retryMultithread = () => {
    if ((props.probe ?? probeThreading)().variant !== 'mt') { setNotice(props.labels.unavailableMt); return; }
    (props.retryMultithread ?? (() => engineClient.retryMultithread()))();
    setNotice(props.labels.retryMtSuccess);
  };
  return <section class="diagnostics-sheet" aria-label={props.labels.heading}>
    <p>{props.labels.isolation}: <output>{String(globalThis.crossOriginIsolated ?? false)}</output></p>
    <label>{props.labels.variant}<select value={preference()} onChange={event => select(event.currentTarget, event.currentTarget.value as VariantPreference)}>
      <option value="auto">{props.labels.auto}</option><option value="st">{props.labels.st}</option><option value="mt">{props.labels.mt}</option>
    </select></label>
    {notice() && <p role="alert">{notice()}</p>}
    <button class="ui-target" type="button" onClick={retryMultithread}>{props.labels.retryMt}</button>
    <dl><div><dt>{props.labels.load}</dt><dd>{metrics().loadMs === undefined ? '-' : `${metrics().loadMs!.toFixed(0)} ms`}</dd></div>
      <div><dt>{props.labels.slice}</dt><dd>{metrics().sliceMs === undefined ? '-' : `${metrics().sliceMs!.toFixed(0)} ms`}</dd></div>
      <div><dt>{props.labels.heap}</dt><dd>{metrics().peakHeapBytes === undefined ? '-' : formatBytes(metrics().peakHeapBytes!)}</dd></div></dl>
    <button class="ui-target" type="button" onClick={() => void exportLog()}>{props.labels.export}</button>
    <h4>{props.labels.recent}</h4><ul><For each={entries().slice(-15).reverse()}>{entry => <li>{new Date(entry.ts).toLocaleTimeString()} {entry.type}</li>}</For></ul>
  </section>;
}
