import { gcodeFileName, saveFile, saveGcode } from './export/save-gcode';
import type { Variant } from './engine/manifest';
import { createLog } from './instrumentation/log';
import { createPanel } from './instrumentation/panel';
import { isFromWorker, type FromWorker, type ToWorker } from './worker/protocol';

const log = createLog();

const isolationStatus = document.querySelector<HTMLParagraphElement>('#isolation-status');
const variantSelect = document.querySelector<HTMLSelectElement>('#variant-select');
const fileInput = document.querySelector<HTMLInputElement>('#stl-input');
const sliceButton = document.querySelector<HTMLButtonElement>('#slice-button');
const cancelButton = document.querySelector<HTMLButtonElement>('#cancel-button');
const saveButton = document.querySelector<HTMLButtonElement>('#save-button');
const engineStatus = document.querySelector<HTMLParagraphElement>('#engine-status');
const progress = document.querySelector<HTMLProgressElement>('#slice-progress');
const panelRoot = document.querySelector<HTMLElement>('#panel');

if (!isolationStatus || !variantSelect || !fileInput || !sliceButton || !cancelButton || !saveButton || !engineStatus || !progress || !panelRoot) {
  throw new Error('Spike harness markup is missing required elements');
}

const panel = createPanel(panelRoot, {
  log,
  onExportLog: () => {
    const stamp = new Date().toISOString().replaceAll(':', '-');
    void saveFile(log.exportJson(), `spike-log-${stamp}.json`, ['application/json', 'text/plain']);
  },
});

function record(type: string, data?: unknown): void {
  log.append(type, data);
  panel.render();
}

isolationStatus.textContent = self.crossOriginIsolated
  ? 'Cross-origin isolated: yes (SharedArrayBuffer available)'
  : 'Cross-origin isolated: no (single-thread only)';
record('page-load', { crossOriginIsolated: self.crossOriginIsolated, userAgent: navigator.userAgent });

let worker: Worker | undefined;
let engineReady = false;
let slicing = false;
let cancelRequested = false;
let loadedVariant: Variant | undefined;
let lastGcode: ArrayBuffer | undefined;
let lastStlName = 'model.stl';

// The variant choice lives in the URL (?variant=auto|st|mt) and a switch reloads the page. Starting a
// single-thread engine (growable memory up to 4 GiB) right after terminating another engine worker
// crashed WebKit in local testing, so engine workers are never swapped in place across variants.
const requestedChoice = new URLSearchParams(location.search).get('variant') ?? 'auto';
variantSelect.value = ['auto', 'st', 'mt'].includes(requestedChoice) ? requestedChoice : 'auto';

// "auto" asks for multithread only when the page is cross-origin isolated; the worker probe decides.
function preferredVariant(): Variant {
  const choice = variantSelect!.value;
  if (choice === 'st' || choice === 'mt') return choice;
  return self.crossOriginIsolated ? 'mt' : 'st';
}

function setStatus(text: string, isError = false): void {
  engineStatus!.textContent = text;
  engineStatus!.classList.toggle('error', isError);
}

function updateControls(): void {
  sliceButton!.disabled = !engineReady || slicing || !fileInput!.files?.length;
  cancelButton!.disabled = !slicing || cancelRequested;
  saveButton!.disabled = slicing || !lastGcode;
  variantSelect!.disabled = slicing;
}

function post(message: ToWorker, transfer: Transferable[] = []): void {
  worker?.postMessage(message, transfer);
}

function handleMessage(message: FromWorker): void {
  switch (message.t) {
    case 'ready':
      engineReady = true;
      loadedVariant = message.variant;
      record('engine-ready', message);
      setStatus(
        `Engine ready (${message.variant}, ${message.loadPath}, ${Math.round(message.loadMs)} ms)` +
          (message.probe ? ` — ${message.probe}` : ''),
      );
      break;
    case 'progress':
      progress!.value = message.pct;
      record('slice-progress', message);
      if (!cancelRequested) setStatus(`Slicing… ${message.pct}%${message.stage ? ` (${message.stage})` : ''}`);
      break;
    case 'done':
      slicing = false;
      if (cancelRequested) {
        cancelRequested = false;
        progress!.value = 0;
        record('slice-discarded', { sliceMs: message.sliceMs });
        setStatus('Slice cancelled (result discarded); engine ready');
        break;
      }
      lastGcode = message.gcode;
      progress!.value = 100;
      record('slice-done', {
        gcodeBytes: message.gcode.byteLength,
        sliceMs: message.sliceMs,
        peakHeapBytes: message.peakHeapBytes,
      });
      setStatus(
        `Done: ${(message.gcode.byteLength / 1024).toFixed(0)} KB G-code in ${Math.round(message.sliceMs)} ms, ` +
          `peak heap ${(message.peakHeapBytes / 1024 / 1024).toFixed(0)} MB`,
      );
      break;
    case 'error':
      slicing = false;
      cancelRequested = false;
      if (message.stage === 'load' || message.stage === 'probe' || message.stage === 'profile') engineReady = false;
      record('engine-error', message);
      setStatus(`Error during ${message.stage}: ${message.message}`, true);
      break;
  }
  updateControls();
}

function startWorker(): void {
  worker?.terminate();
  engineReady = false;
  slicing = false;
  cancelRequested = false;
  const prefer = preferredVariant();
  setStatus(`Loading engine (${prefer})…`);
  worker = new Worker(new URL('./worker/engine.worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (isFromWorker(event.data)) handleMessage(event.data);
  });
  worker.addEventListener('error', (event) => {
    record('worker-crash', { message: event.message });
    handleMessage({ t: 'error', stage: 'load', message: event.message || 'Worker crashed' });
  });
  record('engine-init', { prefer, requested: variantSelect!.value });
  post({ t: 'init', prefer });
  updateControls();
}

fileInput.addEventListener('change', updateControls);
variantSelect.addEventListener('change', () => {
  record('variant-change', { requested: variantSelect.value });
  const url = new URL(location.href);
  url.searchParams.set('variant', variantSelect.value);
  location.replace(url);
});

sliceButton.addEventListener('click', async () => {
  const file = fileInput.files?.[0];
  if (!file || !engineReady) return;
  slicing = true;
  cancelRequested = false;
  lastGcode = undefined;
  lastStlName = file.name;
  progress.value = 0;
  updateControls();
  const stl = await file.arrayBuffer();
  record('slice-start', { name: file.name, bytes: stl.byteLength });
  setStatus(`Slicing ${file.name}…`);
  post({ t: 'slice', stl, name: file.name }, [stl]);
});

// A worker busy in a synchronous slice call cannot receive messages. Multithread (fixed memory)
// restarts cleanly in place; single-thread cancels softly and discards the result when it arrives.
cancelButton.addEventListener('click', () => {
  record('slice-cancel', { variant: loadedVariant, mode: loadedVariant === 'mt' ? 'restart' : 'discard' });
  if (loadedVariant === 'mt') {
    startWorker();
    return;
  }
  cancelRequested = true;
  setStatus('Cancelling… the engine finishes this slice in the background and discards it');
  updateControls();
});

// saveGcode must run synchronously inside the tap handler: Safari only shares with user activation.
saveButton.addEventListener('click', () => {
  if (!lastGcode) return;
  const fileName = gcodeFileName(lastStlName);
  saveGcode(lastGcode, fileName).then(
    (result) => {
      record('gcode-save', result);
      setStatus(result.method === 'cancelled' ? 'Save cancelled' : `Saved ${fileName} via ${result.method}`);
    },
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      record('engine-error', { stage: 'export', message });
      setStatus(`Error during export: ${message}`, true);
    },
  );
});

startWorker();

// Exposed for manual inspection from the console and for the browser smoke test.
Object.assign(globalThis, { spike: { log, getLastGcode: () => lastGcode } });
