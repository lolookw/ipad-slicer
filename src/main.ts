import { createLog } from './instrumentation/log';
import { isFromWorker, type FromWorker, type ToWorker } from './worker/protocol';

const log = createLog();

const isolationStatus = document.querySelector<HTMLParagraphElement>('#isolation-status');
const fileInput = document.querySelector<HTMLInputElement>('#stl-input');
const sliceButton = document.querySelector<HTMLButtonElement>('#slice-button');
const cancelButton = document.querySelector<HTMLButtonElement>('#cancel-button');
const engineStatus = document.querySelector<HTMLParagraphElement>('#engine-status');
const progress = document.querySelector<HTMLProgressElement>('#slice-progress');

if (!isolationStatus || !fileInput || !sliceButton || !cancelButton || !engineStatus || !progress) {
  throw new Error('Spike harness markup is missing required elements');
}

isolationStatus.textContent = self.crossOriginIsolated
  ? 'Cross-origin isolated: yes (SharedArrayBuffer available)'
  : 'Cross-origin isolated: no (single-thread only)';
log.append('page-load', { crossOriginIsolated: self.crossOriginIsolated, userAgent: navigator.userAgent });

let worker: Worker | undefined;
let engineReady = false;
let slicing = false;
let lastGcode: ArrayBuffer | undefined;

function setStatus(text: string): void {
  engineStatus!.textContent = text;
}

function updateControls(): void {
  sliceButton!.disabled = !engineReady || slicing || !fileInput!.files?.length;
  cancelButton!.disabled = !slicing;
}

function post(message: ToWorker, transfer: Transferable[] = []): void {
  worker?.postMessage(message, transfer);
}

function handleMessage(message: FromWorker): void {
  switch (message.t) {
    case 'ready':
      engineReady = true;
      log.append('engine-ready', message);
      setStatus(`Engine ready (${message.variant}, ${message.loadPath}, ${Math.round(message.loadMs)} ms)`);
      break;
    case 'progress':
      progress!.value = message.pct;
      log.append('slice-progress', message);
      setStatus(`Slicing… ${message.pct}%${message.stage ? ` (${message.stage})` : ''}`);
      break;
    case 'done':
      slicing = false;
      lastGcode = message.gcode;
      progress!.value = 100;
      log.append('slice-done', {
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
      if (message.stage === 'load' || message.stage === 'profile') engineReady = false;
      log.append('engine-error', message);
      setStatus(`Error during ${message.stage}: ${message.message}`);
      break;
  }
  updateControls();
}

function startWorker(): void {
  worker?.terminate();
  engineReady = false;
  slicing = false;
  setStatus('Loading engine…');
  worker = new Worker(new URL('./worker/engine.worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (isFromWorker(event.data)) handleMessage(event.data);
  });
  worker.addEventListener('error', (event) => {
    log.append('worker-crash', { message: event.message });
    handleMessage({ t: 'error', stage: 'load', message: event.message || 'Worker crashed' });
  });
  log.append('engine-init', { prefer: 'st' });
  post({ t: 'init', prefer: 'st' });
  updateControls();
}

fileInput.addEventListener('change', updateControls);

sliceButton.addEventListener('click', async () => {
  const file = fileInput.files?.[0];
  if (!file || !engineReady) return;
  slicing = true;
  lastGcode = undefined;
  progress.value = 0;
  updateControls();
  const stl = await file.arrayBuffer();
  log.append('slice-start', { name: file.name, bytes: stl.byteLength });
  setStatus(`Slicing ${file.name}…`);
  post({ t: 'slice', stl, name: file.name }, [stl]);
});

// A worker busy in a synchronous slice call cannot receive messages, so cancel restarts it.
cancelButton.addEventListener('click', () => {
  log.append('slice-cancel');
  startWorker();
});

startWorker();

// Exposed for PR4 (export) and manual inspection from the console.
Object.assign(globalThis, { spike: { log, getLastGcode: () => lastGcode } });
