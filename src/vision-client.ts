import type { PersonMask } from './effects';
import type { HandStatus } from './gesture';

export interface VisionResult { mask: PersonMask; gesture: boolean; handStatus: HandStatus }
type WorkerResponse = { type: 'ready' } | { type: 'error'; id?: number; message?: string } | { type: 'result'; id: number; mask?: PersonMask; gesture?: boolean; handStatus?: HandStatus; skipped?: boolean };
type FrameRequest = { resolve: (value: VisionResult | null) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> };

export class VisionClient {
  workerUrl: string | URL;
  worker: Worker | null = null;
  ready = false;
  closed = false;
  inflight = false;
  pending = new Map<number, FrameRequest>();
  sequence = 0;
  initPromise: Promise<void> | null = null;
  initState: { resolve: () => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;

  constructor({ workerUrl }: { workerUrl?: string | URL } = {}) {
    this.workerUrl = workerUrl || new URL('vision-worker.js', globalThis.document?.baseURI || globalThis.location?.href).href;
    this.worker = null;
    this.ready = false;
    this.closed = false;
    this.inflight = false;
    this.pending = new Map<number, FrameRequest>();
    this.sequence = 0;
    this.initPromise = null;
  }

  init(): Promise<void> {
    if (this.closed) return Promise.reject(new Error('Camera processing has stopped.'));
    if (this.initPromise) return this.initPromise;
    this.initPromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error('Camera processing took too long to load. Reload the extension and try again.')), 30000);
      this.initState = { resolve, reject, timer };
      try {
        this.worker = new Worker(this.workerUrl);
        this.worker.onmessage = event => this.handleMessage(event.data);
        this.worker.onerror = () => this.fail(new Error('Camera processing could not start. Check that all extension files are installed.'));
        this.worker.onmessageerror = () => this.fail(new Error('Camera processing returned an unreadable frame.'));
        this.worker.postMessage({ type: 'init' });
      } catch (error) {
        this.fail(error);
      }
    });
    return this.initPromise;
  }

  handleMessage(message: WorkerResponse) {
    if (this.closed || !message) return;
    if (message.type === 'ready') {
      clearTimeout(this.initState?.timer);
      this.ready = true;
      this.initState?.resolve();
      this.initState = null;
      return;
    }
    if (message.type === 'error' && !this.ready) {
      this.fail(new Error(message.message || 'Camera processing could not load.'));
      return;
    }
    if (!('id' in message) || typeof message.id !== 'number') return;
    const request = this.pending.get(message.id);
    if (!request) return;
    this.pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.type === 'error') request.reject(new Error(message.message || 'Camera frame processing failed.'));
    else if (message.type === 'result' && message.mask) request.resolve(message.skipped ? null : { mask: message.mask, gesture: Boolean(message.gesture), handStatus: message.handStatus || 'no-hand' });
    else request.reject(new Error('Unexpected camera processing response.'));
  }

  async process(source: ImageBitmapSource, timestamp = performance.now()): Promise<VisionResult | null> {
    if (this.closed) throw new Error('Camera processing has stopped.');
    if (this.inflight) return null;
    this.inflight = true;
    let bitmap: ImageBitmap | undefined;
    try {
      await this.init();
      if (this.closed) throw new Error('Camera processing has stopped.');
      bitmap = await createImageBitmap(source);
      if (this.closed) throw new Error('Camera processing has stopped.');
      const id = ++this.sequence;
      const outgoing = bitmap;
      return await new Promise<VisionResult | null>((resolve, reject) => {
        const timer = setTimeout(() => this.fail(new Error('Camera frame processing stalled. Restart the camera to try again.')), 10000);
        this.pending.set(id, { resolve, reject, timer });
        try {
          this.worker!.postMessage({ type: 'frame', id, bitmap: outgoing, timestamp }, [outgoing]);
          bitmap = undefined;
        } catch (error) {
          this.pending.delete(id);
          clearTimeout(timer);
          reject(error);
        }
      });
    } finally {
      bitmap?.close();
      this.inflight = false;
    }
  }

  fail(reason: unknown) {
    const error = reason instanceof Error ? reason : new Error('Camera processing failed.');
    if (this.closed) return;
    this.closed = true;
    this.ready = false;
    if (this.initState) {
      clearTimeout(this.initState.timer);
      this.initState.reject(error);
      this.initState = null;
    }
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
  }

  close() {
    this.fail(new Error('Camera processing has stopped.'));
  }
}
