import { DustTransition, maskSurface } from './effects';
import { RoomModel, validMask, type PersonMask } from './room';

type Phase = 'visible' | 'vanishing' | 'hidden' | 'returning';
type Context = OffscreenCanvasRenderingContext2D;
interface TrackProcessor { readable: ReadableStream<VideoFrame> }
interface TrackGenerator extends MediaStreamTrack { writable: WritableStream<VideoFrame> }
type ProcessorConstructor = new (init: { track: MediaStreamTrack }) => TrackProcessor;
type GeneratorConstructor = new (init: { kind: 'video' }) => TrackGenerator;
interface Pipeline {
  raw: MediaStreamTrack;
  outputs: Set<MediaStreamTrack>;
  reader: ReadableStreamDefaultReader<VideoFrame>;
  writer: WritableStreamDefaultWriter<VideoFrame>;
  closed: boolean;
  width: number;
  height: number;
  canvas: OffscreenCanvas;
  context: Context;
  pending: OffscreenCanvas;
  analysed: OffscreenCanvas;
  mask: PersonMask | null;
  maskAt: number;
  liveMask: OffscreenCanvas | null;
  room: RoomModel | null;
  roomImage: OffscreenCanvas | null;
  transition: DustTransition | null;
  inFlight: boolean;
  sentAt: number;
}

const VANISH_MS = 2400;
const RETURN_MS = 1800;
const HIDDEN_FILL = '#101218';

(() => {
  const marker = window as Window & { __prismwinkHook?: boolean };
  if (marker.__prismwinkHook || !window.MediaDevices?.prototype.getUserMedia) return;
  Object.defineProperty(window, '__prismwinkHook', { value: true });
  const Processor = (window as unknown as { MediaStreamTrackProcessor?: ProcessorConstructor }).MediaStreamTrackProcessor;
  const Generator = (window as unknown as { MediaStreamTrackGenerator?: GeneratorConstructor }).MediaStreamTrackGenerator;
  const nativeGetUserMedia = MediaDevices.prototype.getUserMedia;
  const enabledDescriptor = Object.getOwnPropertyDescriptor(MediaStreamTrack.prototype, 'enabled');
  const pipelines = new Set<Pipeline>();
  const rooms = new Map<string, RoomModel>();
  const microphones = new Set<MediaStreamTrack>();
  const inFlight = new Map<number, { pipe: Pipeline; width: number; height: number }>();
  let phase: Phase = 'visible';
  let phaseTimer = 0;
  let vision: 'loading' | 'ready' | 'error' = 'loading';
  let visionError = Processor && Generator ? '' : 'This browser cannot process camera frames.';
  let engineOrigin = '';
  let gestures = true;
  let reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let hand = 'none';
  let handSeenAt = 0;
  let frameId = 0;
  let notice = '';
  let noticeSerial = 0;
  let lastStatus = '';
  let processMs = 0;
  let results = 0;
  let visionMs = 0;

  const engineFrame = () => document.getElementById('prismwink-engine') as HTMLIFrameElement | null;
  const active = (): Pipeline | null => [...pipelines].filter((pipe) => !pipe.closed).at(-1) ?? null;
  const setEnabled = (track: MediaStreamTrack, value: boolean) => enabledDescriptor?.set ? enabledDescriptor.set.call(track, value) : (track.enabled = value);

  function publish() {
    const pipe = active();
    const status = { camera: Boolean(pipe), phase, vision, error: visionError, hand, room: pipe?.room ? Math.round(pipe.room.coverage * 100) / 100 : 0, gestures, notice, processMs: Math.round(processMs), visionMs: Math.round(visionMs), results };
    const text = JSON.stringify(status);
    if (text === lastStatus) return;
    lastStatus = text;
    window.postMessage({ source: 'prismwink-hook', type: 'status', ...status }, location.origin);
  }

  function say(text: string) {
    notice = text;
    const serial = ++noticeSerial;
    publish();
    setTimeout(() => { if (serial === noticeSerial) { notice = ''; publish(); } }, 6000);
  }

  function micButton(): HTMLElement | null {
    const label = (node: Element) => `${node.getAttribute('aria-label') ?? ''} ${node.getAttribute('data-tooltip') ?? ''}`.toLowerCase();
    const camera = (text: string) => /camera|cam[eé]ra|c[aá]mara|kamera|video|カメラ|카메라|摄像头|攝影機|\+\s*e\b/.test(text);
    const microphone = (text: string) => /micro|mikro|mic\b|マイク|마이크|麦克风|麥克風|\+\s*d\b/.test(text);
    const nodes = [...document.querySelectorAll<HTMLElement>('[data-is-muted]')].filter((node) => node.getClientRects().length > 0);
    const found = nodes.find((node) => microphone(label(node)) && !camera(label(node))) ?? nodes.find((node) => !camera(label(node)) && !label(node).trim());
    if (!found) return null;
    return found.matches('button,[role="button"]') ? found : found.querySelector<HTMLElement>('button,[role="button"]') ?? found;
  }

  function micOn(button: HTMLElement | null): boolean | null {
    const muted = button?.getAttribute('data-is-muted') ?? button?.closest('[data-is-muted]')?.getAttribute('data-is-muted');
    return muted === 'true' ? false : muted === 'false' ? true : null;
  }

  const mic = {
    clicked: false,
    touched: false,
    gated: [] as MediaStreamTrack[],
    mute() {
      this.clicked = false;
      this.touched = false;
      this.gated = [];
      const button = micButton();
      const on = micOn(button);
      if (on === false) return;
      if (button && on) {
        button.click();
        this.clicked = true;
      }
      for (const track of microphones) {
        if (track.readyState === 'live' && track.enabled) {
          setEnabled(track, false);
          this.gated.push(track);
        }
      }
      setTimeout(() => { if (this.clicked && micOn(micButton()) === true) this.clicked = false; }, 800);
    },
    restore() {
      const gated = this.gated;
      this.gated = [];
      if (this.touched) return;
      const button = micButton();
      if (this.clicked && button && micOn(button) === false) button.click();
      this.clicked = false;
      setTimeout(() => {
        // Re-enable only when Meet agrees the mic is on, so Meet's own mute is never bypassed.
        if (micOn(micButton()) === false) { say('Your microphone is still muted in Meet.'); return; }
        for (const track of gated) if (track.readyState === 'live' && !track.enabled) setEnabled(track, true);
      }, 250);
    },
    userChanged() {
      if (phase === 'visible' || this.touched) return;
      this.touched = true;
      this.clicked = false;
      const gated = this.gated;
      this.gated = [];
      setTimeout(() => {
        if (micOn(micButton()) === false) return;
        for (const track of gated) if (track.readyState === 'live' && !track.enabled) setEnabled(track, true);
      }, 300);
    }
  };

  document.addEventListener('click', (event) => {
    if (!event.isTrusted) return;
    const button = micButton();
    if (button && event.composedPath().includes(button)) mic.userChanged();
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.isTrusted && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') mic.userChanged();
  }, true);

  function registerMicrophone(track: MediaStreamTrack) {
    if (microphones.has(track)) return;
    microphones.add(track);
    track.addEventListener('ended', () => microphones.delete(track), { once: true });
    const nativeClone = track.clone.bind(track);
    track.clone = () => { const copy = nativeClone(); registerMicrophone(copy); return copy; };
    if (phase !== 'visible' && track.enabled && micOn(micButton()) !== true) {
      setEnabled(track, false);
      mic.gated.push(track);
    }
  }

  function setPhase(next: Phase) {
    clearTimeout(phaseTimer);
    phase = next;
    publish();
  }

  function snapshotSource(): { frame: OffscreenCanvas; mask: PersonMask } | null {
    const pipe = active();
    if (!pipe?.mask || performance.now() - pipe.maskAt > 1500) return null;
    return { frame: pipe.analysed, mask: pipe.mask };
  }

  function begin(kind: 'vanish' | 'return') {
    const now = performance.now();
    const source = snapshotSource();
    for (const pipe of pipelines) {
      if (pipe.closed || !pipe.width) continue;
      if (kind === 'vanish') pipe.roomImage = pipe.room && pipe.room.coverage > 0.01 ? pipe.room.complete() : null;
      const mask = source?.mask ?? { width: 1, height: 1, data: new Uint8Array([255]) };
      pipe.transition = new DustTransition({ kind, width: pipe.width, height: pipe.height, snapshot: source?.frame ?? pipe.analysed, mask, start: now, duration: kind === 'vanish' ? VANISH_MS : RETURN_MS, reducedMotion: reducedMotion || !source });
    }
    const duration = kind === 'vanish' ? VANISH_MS : RETURN_MS;
    setPhase(kind === 'vanish' ? 'vanishing' : 'returning');
    phaseTimer = window.setTimeout(() => {
      for (const pipe of pipelines) if (pipe.transition?.kind === kind) pipe.transition = null;
      setPhase(kind === 'vanish' ? 'hidden' : 'visible');
    }, duration + 1500);
  }

  function toggle() {
    if (phase === 'vanishing' || phase === 'returning') return;
    if (phase === 'hidden') {
      mic.restore();
      begin('return');
      return;
    }
    const pipe = active();
    if (!pipe) { say('Turn on your camera first.'); return; }
    mic.mute();
    begin('vanish');
    if ((pipe.room?.coverage ?? 0) < 0.5) say('Tip: step out of view for a moment so Prismwink can learn your whole room.');
  }

  function resize(pipe: Pipeline, frame: VideoFrame) {
    const width = frame.displayWidth, height = frame.displayHeight;
    pipe.width = width;
    pipe.height = height;
    for (const canvas of [pipe.canvas, pipe.pending, pipe.analysed]) { canvas.width = width; canvas.height = height; }
    pipe.mask = null;
    pipe.liveMask = null;
    pipe.transition = null;
    const key = `${pipe.raw.getSettings().deviceId ?? ''}|${width}x${height}`;
    let room = rooms.get(key);
    if (!room) { room = new RoomModel(width, height); rooms.set(key, room); }
    pipe.room = room;
    if (phase !== 'visible' && !pipe.roomImage && room.coverage > 0.01) pipe.roomImage = room.complete();
  }

  function analyse(pipe: Pipeline, frame: VideoFrame, now: number) {
    if (pipe !== active() || vision !== 'ready' || !engineOrigin) return;
    if (pipe.inFlight) {
      if (now - pipe.sentAt < 4000) return;
      pipe.inFlight = false;
    }
    const transitioning = phase === 'vanishing' || phase === 'returning';
    const interval = transitioning ? 30 : now - handSeenAt < 2000 ? 40 : 90;
    if (now - pipe.sentAt < interval) return;
    const target = engineFrame()?.contentWindow;
    if (!target) return;
    pipe.pending.getContext('2d')!.drawImage(frame, 0, 0);
    pipe.inFlight = true;
    pipe.sentAt = now;
    const id = ++frameId;
    inFlight.set(id, { pipe, width: pipe.width, height: pipe.height });
    const width = Math.min(384, pipe.width);
    createImageBitmap(pipe.pending, { resizeWidth: width, resizeHeight: Math.max(1, Math.round(width * pipe.height / pipe.width)), resizeQuality: 'low' })
      .then((bitmap) => {
        if (pipe.closed) { bitmap.close(); inFlight.delete(id); pipe.inFlight = false; return; }
        target.postMessage({ source: 'prismwink-hook', type: 'frame', id, bitmap, timestamp: now, hands: gestures }, engineOrigin, [bitmap]);
      })
      .catch(() => { inFlight.delete(id); pipe.inFlight = false; });
  }

  function drawHidden(pipe: Pipeline) {
    const context = pipe.context;
    context.globalCompositeOperation = 'copy';
    context.globalAlpha = 1;
    if (pipe.roomImage) context.drawImage(pipe.roomImage, 0, 0, pipe.width, pipe.height);
    else {
      context.fillStyle = HIDDEN_FILL;
      context.fillRect(0, 0, pipe.width, pipe.height);
    }
    context.globalCompositeOperation = 'source-over';
  }

  function render(pipe: Pipeline, frame: VideoFrame): VideoFrame {
    if (frame.displayWidth !== pipe.width || frame.displayHeight !== pipe.height) resize(pipe, frame);
    const now = performance.now();
    analyse(pipe, frame, now);
    if (pipe.transition) {
      const started = performance.now();
      const done = pipe.transition.draw(pipe.context, frame, pipe.liveMask, pipe.roomImage ?? darkRoom(pipe), now);
      processMs = processMs * 0.9 + (performance.now() - started) * 0.1;
      if (done) {
        const kind = pipe.transition.kind;
        pipe.transition = null;
        if (pipe === active() && kind === 'vanish' && phase === 'vanishing') setPhase('hidden');
        if (pipe === active() && kind === 'return' && phase === 'returning') setPhase('visible');
        if (kind === 'return') return frame;
      }
    } else if (phase === 'visible' || phase === 'returning') return frame;
    else drawHidden(pipe);
    return new VideoFrame(pipe.canvas, { timestamp: frame.timestamp, duration: frame.duration ?? undefined });
  }

  const darkRooms = new WeakMap<Pipeline, OffscreenCanvas>();
  function darkRoom(pipe: Pipeline): OffscreenCanvas {
    let canvas = darkRooms.get(pipe);
    if (!canvas || canvas.width !== pipe.width || canvas.height !== pipe.height) {
      canvas = new OffscreenCanvas(pipe.width, pipe.height);
      const context = canvas.getContext('2d')!;
      context.fillStyle = HIDDEN_FILL;
      context.fillRect(0, 0, pipe.width, pipe.height);
      darkRooms.set(pipe, canvas);
    }
    return canvas;
  }

  async function pump(pipe: Pipeline) {
    try {
      for (;;) {
        const { value: frame, done } = await pipe.reader.read();
        if (done || !frame) break;
        if (pipe.closed) { frame.close(); break; }
        let output: VideoFrame | null = frame;
        try {
          output = render(pipe, frame);
        } catch (error) {
          visionError = error instanceof Error ? `Camera effect failed: ${error.message}` : 'Camera effect failed.';
          pipe.transition = null;
          if (phase === 'returning') setPhase('visible');
          if (phase === 'vanishing') setPhase('hidden');
          output = null;
          if (phase === 'visible') output = frame;
          else {
            // Never fall back to the raw camera while hidden.
            try { drawHidden(pipe); output = new VideoFrame(pipe.canvas, { timestamp: frame.timestamp }); } catch { output = null; }
          }
          publish();
        }
        if (output !== frame) frame.close();
        if (output) await pipe.writer.write(output);
      }
    } catch {
      // The camera or the receiving track ended.
    } finally {
      closePipeline(pipe);
    }
  }

  function closePipeline(pipe: Pipeline) {
    if (pipe.closed) return;
    pipe.closed = true;
    pipe.raw.stop();
    pipe.reader.cancel().catch(() => {});
    pipe.writer.close().catch(() => {});
    pipelines.delete(pipe);
    for (const [id, entry] of inFlight) if (entry.pipe === pipe) inFlight.delete(id);
    publish();
  }

  function dress(track: MediaStreamTrack, pipe: Pipeline): MediaStreamTrack {
    pipe.outputs.add(track);
    const raw = pipe.raw;
    const nativeStop = track.stop.bind(track);
    const nativeClone = track.clone.bind(track);
    Object.defineProperty(track, 'label', { configurable: true, get: () => raw.label });
    Object.defineProperty(track, 'enabled', {
      configurable: true,
      get: () => enabledDescriptor?.get?.call(track) ?? true,
      set: (value: boolean) => {
        enabledDescriptor?.set?.call(track, value);
        const any = [...pipe.outputs].some((output) => output.readyState === 'live' && enabledDescriptor?.get?.call(output));
        if (raw.readyState === 'live') setEnabled(raw, any);
      }
    });
    track.getSettings = () => raw.getSettings();
    track.getConstraints = () => raw.getConstraints();
    track.getCapabilities = () => raw.getCapabilities();
    track.applyConstraints = (constraints?: MediaTrackConstraints) => raw.applyConstraints(constraints);
    track.clone = () => dress(nativeClone(), pipe);
    track.stop = () => {
      nativeStop();
      pipe.outputs.delete(track);
      if (![...pipe.outputs].some((output) => output.readyState === 'live')) closePipeline(pipe);
    };
    return track;
  }

  function createPipeline(raw: MediaStreamTrack): MediaStreamTrack {
    if (!Processor || !Generator) throw new Error('This browser cannot process camera frames.');
    const processor = new Processor({ track: raw });
    const generator = new Generator({ kind: 'video' });
    const canvas = new OffscreenCanvas(1, 1);
    const context = canvas.getContext('2d', { alpha: false }) as Context | null;
    if (!context) throw new Error('This browser cannot draw camera frames.');
    const pipe: Pipeline = {
      raw, outputs: new Set(), reader: processor.readable.getReader(), writer: generator.writable.getWriter(), closed: false,
      width: 0, height: 0, canvas, context, pending: new OffscreenCanvas(1, 1), analysed: new OffscreenCanvas(1, 1),
      mask: null, maskAt: 0, liveMask: null, room: null, roomImage: null, transition: null, inFlight: false, sentAt: 0
    };
    dress(generator, pipe);
    raw.addEventListener('ended', () => closePipeline(pipe), { once: true });
    pipelines.add(pipe);
    void pump(pipe);
    publish();
    return generator;
  }

  function onResult(data: { id: number; mask?: PersonMask; snap?: boolean; hand?: string; ms?: number }) {
    const entry = inFlight.get(data.id);
    inFlight.delete(data.id);
    if (!entry) return;
    const { pipe } = entry;
    pipe.inFlight = false;
    results++;
    if (Number.isFinite(data.ms)) visionMs = visionMs ? visionMs * 0.9 + data.ms! * 0.1 : data.ms!;
    if (pipe.closed) return;
    const now = performance.now();
    if (validMask(data.mask) && entry.width === pipe.width && entry.height === pipe.height) {
      [pipe.pending, pipe.analysed] = [pipe.analysed, pipe.pending];
      pipe.mask = data.mask;
      pipe.maskAt = now;
      pipe.liveMask = maskSurface(data.mask);
      if (phase === 'visible' && !pipe.transition) pipe.room?.learn(pipe.analysed, data.mask);
    }
    hand = gestures && ['hand', 'armed'].includes(data.hand ?? '') ? data.hand! : 'none';
    if (hand !== 'none') handSeenAt = now;
    if (data.snap && gestures) toggle();
    publish();
  }

  Object.defineProperty(MediaDevices.prototype, 'getUserMedia', {
    configurable: true,
    writable: true,
    value: async function getUserMedia(this: MediaDevices, constraints?: MediaStreamConstraints): Promise<MediaStream> {
      const stream = await nativeGetUserMedia.call(this, constraints);
      stream.getAudioTracks().forEach(registerMicrophone);
      const videos = stream.getVideoTracks();
      if (!videos.length) return stream;
      try {
        return new MediaStream([...videos.map(createPipeline), ...stream.getAudioTracks()]);
      } catch (error) {
        visionError = error instanceof Error ? error.message : 'Camera effects are unavailable.';
        publish();
        if (phase === 'visible') return stream;
        stream.getTracks().forEach((track) => track.stop());
        throw new DOMException('Prismwink is keeping your camera hidden. Use Return to show it again.', 'NotReadableError');
      }
    }
  });

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.source === 'prismwink-engine') {
      if (!engineOrigin || event.origin !== engineOrigin || event.source !== engineFrame()?.contentWindow) return;
      if (data.type === 'ready') { vision = 'ready'; if (Processor && Generator) visionError = ''; publish(); }
      else if (data.type === 'error') { vision = 'error'; visionError = String(data.message || 'Local camera processing is unavailable.'); publish(); }
      else if (data.type === 'result') onResult(data);
      else if (data.type === 'frame-error') {
        const entry = inFlight.get(data.id);
        inFlight.delete(data.id);
        if (entry) entry.pipe.inFlight = false;
      }
      return;
    }
    if (event.source !== window || event.origin !== location.origin || data.source !== 'prismwink-content') return;
    if (data.type === 'config') {
      try {
        const url = new URL(String(data.engineUrl));
        if (url.protocol !== 'chrome-extension:' || url.pathname !== '/engine.html') return;
        engineOrigin = url.origin;
        engineFrame()?.contentWindow?.postMessage({ source: 'prismwink-hook', type: 'hello' }, engineOrigin);
      } catch { /* An invalid engine address is ignored. */ }
    } else if (data.type === 'settings') {
      if (typeof data.gestures === 'boolean') gestures = data.gestures;
      if (typeof data.reducedMotion === 'boolean') reducedMotion = data.reducedMotion;
      if (!gestures) hand = 'none';
      publish();
    } else if (data.type === 'toggle') toggle();
  });

  window.addEventListener('pagehide', () => [...pipelines].forEach(closePipeline));
  publish();
})();
