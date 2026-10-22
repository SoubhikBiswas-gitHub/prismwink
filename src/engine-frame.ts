import { VisionClient } from './vision-client';

const parentOrigin = 'https://meet.google.com';
const vision = new VisionClient({ workerUrl: new URL('vision-worker.js', location.href).href });
let initialized = false;
let busy = false;
let stopped = false;
let initializationError = '';
const send = (data: Record<string, unknown>, transfer: Transferable[] = []) => parent.postMessage({ source: 'prismwink-engine', ...data }, parentOrigin, transfer);

window.addEventListener('message', async (event) => {
  if (event.source !== parent || event.origin !== parentOrigin || event.data?.source !== 'prismwink-hook') return;
  const data = event.data;
  if (data.type === 'hello') {
    if (initialized) send({ type: 'ready' });
    else if (initializationError) send({ type: 'error', error: initializationError });
    return;
  }
  if (data.type !== 'frame' || !(data.bitmap instanceof ImageBitmap)) return;
  if (!initialized || busy || stopped) { data.bitmap.close(); return; }
  busy = true;
  try {
    const result = await vision.process(data.bitmap, Number(data.timestamp) || performance.now());
    if (!stopped && result) {
      const transfer = result.mask?.data?.buffer ? [result.mask.data.buffer] : [];
      send({ type: 'result', ...result }, transfer);
    }
  } catch (error) {
    initialized = false;
    initializationError = error instanceof Error ? error.message : 'Local camera processing failed.';
    send({ type: 'error', error: initializationError });
  } finally { busy = false; data.bitmap.close(); }
});

vision.init().then(() => {
  if (!stopped) { initialized = true; send({ type: 'ready' }); }
}).catch((error: unknown) => {
  initializationError = error instanceof Error ? error.message : 'Local camera processing could not start.';
  if (!stopped) send({ type: 'error', error: initializationError });
});
window.addEventListener('pagehide', () => { stopped = true; vision.close(); }, { once: true });
