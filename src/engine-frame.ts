const parentOrigin = 'https://meet.google.com';
let state: 'loading' | 'ready' | 'error' = 'loading';
let failure = '';
let segmentation = false;

const send = (data: Record<string, unknown>, transfer: Transferable[] = []) => parent.postMessage({ source: 'prismwink-engine', ...data }, parentOrigin, transfer);
const worker = new Worker(new URL('vision-worker.js', location.href).href);

function fail(message: string) {
  if (state === 'error') return;
  state = 'error';
  failure = message;
  clearTimeout(timeout);
  worker.terminate();
  send({ type: 'error', message });
}

const timeout = setTimeout(() => fail('Local camera processing took too long to load.'), 45000);

worker.onmessage = (event) => {
  const message = event.data;
  if (message?.type === 'ready') {
    state = 'ready';
    segmentation = Boolean(message.segmentation);
    clearTimeout(timeout);
    send({ type: 'ready', segmentation });
  } else if (message?.type === 'error') fail(String(message.message));
  else if (message?.type === 'result') send({ type: 'result', id: message.id, mask: message.mask, snap: message.snap, hand: message.hand, ms: message.ms }, message.mask ? [message.mask.data.buffer] : []);
  else if (message?.type === 'result-error') send({ type: 'frame-error', id: message.id, message: message.message });
};
worker.onerror = () => fail('Local camera processing could not start.');
worker.postMessage({ type: 'init' });

window.addEventListener('message', (event) => {
  if (event.source !== parent || event.origin !== parentOrigin || event.data?.source !== 'prismwink-hook') return;
  const data = event.data;
  if (data.type === 'hello') {
    if (state === 'ready') send({ type: 'ready', segmentation });
    else if (state === 'error') send({ type: 'error', message: failure });
    return;
  }
  if (data.type !== 'frame' || !(data.bitmap instanceof ImageBitmap)) return;
  if (state !== 'ready') {
    data.bitmap.close();
    send({ type: 'frame-error', id: data.id, message: 'Camera processing is not ready.' });
    return;
  }
  worker.postMessage({ type: 'frame', id: data.id, bitmap: data.bitmap, timestamp: data.timestamp, hands: Boolean(data.hands) }, [data.bitmap]);
});
window.addEventListener('pagehide', () => worker.terminate(), { once: true });
