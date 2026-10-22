import { EffectRenderer } from './effects';

type ForegroundMask = { data: Uint8Array; width: number; height: number };
type CameraSettings = { effect: 'dust' | 'pixel' | 'confetti' | 'smoke'; duration: number; density: number; palette: 'natural' | 'prism' | 'stardust'; direction: 'left' | 'right' | 'up'; reducedMotion: boolean; gestures: boolean };
interface CameraSession { video: HTMLVideoElement; canvas: HTMLCanvasElement; rawVideo: MediaStreamTrack[]; outputTracks: Set<MediaStreamTrack>; renderer: EffectRenderer; mask: ForegroundMask | null; maskAt?: number; handStatus: string; closed: boolean; forcedHidden: boolean; callback: number; lastRender: number; inferenceMs: number; timer: number }
interface MicrophoneEntry { previous: boolean; requested: boolean; owned: boolean; muteWrites: number }
const messageOf = (cause: unknown, fallback = 'Unknown camera error'): string => cause instanceof Error ? cause.message : fallback;

(() => {
  if ((window as Window & { __prismwinkCameraHook?: boolean }).__prismwinkCameraHook || !navigator.mediaDevices?.getUserMedia) return;
  Object.defineProperty(window, '__prismwinkCameraHook', { value: true });
  const media = navigator.mediaDevices;
  const nativeGetUserMedia = media.getUserMedia.bind(media);
  const enabledDescriptor = Object.getOwnPropertyDescriptor(MediaStreamTrack.prototype, 'enabled');
  const sessions = new Set<CameraSession>();
  const microphones = new Map<MediaStreamTrack, MicrophoneEntry>();
  let active: CameraSession | null = null;
  let gateHeld = false;
  let ownMutePending = false;
  let muteWindow = 0;
  let desiredHidden = false;
  let restoreRequest = 0;
  let ready = false;
  let engineOrigin = '';
  let engineUrl = '';
  let inferencePending = false;
  let inferenceSession: CameraSession | null = null;
  let inferenceDeadline = 0;
  let lastInference = 0;
  let error = '';
  let settings: CameraSettings = { effect: 'dust', duration: 2500, density: 4500, palette: 'natural', direction: 'right', reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, gestures: true };

  const send = (data: Record<string, unknown>): void => window.postMessage({ source: 'prismwink-hook', ...data }, location.origin);
  const engineFrame = () => document.getElementById('prismwink-engine') as HTMLIFrameElement | null;
  const readEnabled = (track: MediaStreamTrack): boolean => enabledDescriptor?.get ? enabledDescriptor.get.call(track) : track.enabled;
  const writeEnabled = (track: MediaStreamTrack, value: boolean): void => {
    if (enabledDescriptor?.set) enabledDescriptor.set.call(track, value);
    else track.enabled = value;
  };
  const status = () => send({ type: 'status', state: active?.forcedHidden ? 'recovery' : active?.renderer.state || 'visible', hasPlate: Boolean(active?.renderer.hasPlate), visionReady: ready, streamActive: Boolean(active && !active.closed), micGated: gateHeld, quality: active?.renderer.quality || 'full', cameraCaptureEnabled: Boolean(active?.rawVideo.some((track) => track.readyState !== 'ended' && readEnabled(track))), handStatus: active?.handStatus || 'no-hand', error, settings });

  function registerAudio(track: MediaStreamTrack) {
    if (microphones.has(track)) return;
    const entry = { previous: Boolean(readEnabled(track)), requested: Boolean(readEnabled(track)), owned: !gateHeld && !desiredHidden, muteWrites: 0 };
    microphones.set(track, entry);
    try {
      Object.defineProperty(track, 'enabled', {
        configurable: true,
        get: () => readEnabled(track),
        set: (value: boolean) => {
          entry.requested = Boolean(value);
          if (gateHeld && !value) {
            entry.muteWrites += 1;
            if (entry.owned && (!ownMutePending || entry.muteWrites > 1)) {
              entry.owned = false;
              send({ type: 'mic', action: 'invalidate' });
            }
          }
          writeEnabled(track, gateHeld ? false : Boolean(value));
        }
      });
    } catch { /* Audio gating also runs on every rendered frame. */ }
    if (gateHeld || desiredHidden) {
      entry.owned = false;
      entry.previous = false;
      writeEnabled(track, false);
    }
    const nativeClone = track.clone.bind(track);
    track.clone = () => { const clone = nativeClone(); registerAudio(clone); return clone; };
    track.addEventListener('ended', () => microphones.delete(track), { once: true });
  }

  function muteImmediately() {
    gateHeld = true;
    ownMutePending = true;
    const muteRequest = ++muteWindow;
    setTimeout(() => { if (muteWindow === muteRequest) ownMutePending = false; }, 2500);
    restoreRequest += 1;
    for (const [track, entry] of microphones) {
      if (track.readyState === 'ended') { microphones.delete(track); continue; }
      entry.previous = Boolean(readEnabled(track));
      entry.owned = entry.previous;
      entry.muteWrites = 0;
      entry.requested = false;
      writeEnabled(track, false);
    }
    send({ type: 'mic', action: 'mute' });
  }

  function keepMuted() {
    if (!gateHeld) return;
    for (const track of microphones.keys()) {
      if (track.readyState !== 'ended' && readEnabled(track)) writeEnabled(track, false);
    }
  }

  function releaseOwnedAudio(allowed: boolean) {
    if (!allowed) {
      for (const entry of microphones.values()) entry.owned = false;
      status();
      return;
    }
    gateHeld = false;
    for (const [track, entry] of microphones) {
      if (entry.owned && entry.previous && track.readyState !== 'ended') writeEnabled(track, true);
      entry.owned = false;
    }
    status();
  }

  function paintSafe(session: CameraSession) {
    const context = session.canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = '#090D19';
    context.fillRect(0, 0, session.canvas.width, session.canvas.height);
    context.fillStyle = '#F4F5FC';
    context.textAlign = 'center';
    context.font = '20px sans-serif';
    context.fillText('Camera hidden', session.canvas.width / 2, session.canvas.height / 2);
  }

  function setState(session: CameraSession, state: string) {
    if (session !== active) return;
    if (state === 'vanishing') {
      desiredHidden = true;
      muteImmediately();
      for (const sibling of sessions) {
        if (sibling !== session) sibling.forcedHidden = true;
      }
    } else if (state === 'recovery') {
      desiredHidden = true;
      session.forcedHidden = true;
      for (const sibling of sessions) sibling.forcedHidden = true;
      if (!gateHeld) muteImmediately();
      keepMuted();
    } else if (state === 'returning') {
      desiredHidden = false;
      ownMutePending = false;
      for (const sibling of sessions) {
        if (sibling !== session) {
          sibling.forcedHidden = false;
          sibling.renderer.recover();
        }
      }
      const request = ++restoreRequest;
      send({ type: 'mic', action: 'restore' });
      setTimeout(() => {
        if (request === restoreRequest && gateHeld && !desiredHidden) {
          error = 'Camera returned. Microphone remains muted; use the Meet microphone control.';
          status();
        }
      }, 1800);
    }
    status();
  }

  function closeSession(session: CameraSession) {
    if (session.closed) return;
    session.closed = true;
    clearInterval(session.timer);
    if (session.callback && session.video.cancelVideoFrameCallback) session.video.cancelVideoFrameCallback(session.callback);
    session.video.pause();
    session.video.srcObject = null;
    for (const track of [...session.outputTracks]) track.stop();
    session.rawVideo.forEach((track) => track.stop());
    session.renderer?.destroy();
    sessions.delete(session);
    if (active === session) active = [...sessions].at(-1) || null;
    if (!sessions.size) {
      inferencePending = false;
      inferenceSession = null;
      if (!desiredHidden) ready && (error = '');
    }
    status();
  }

  function updateCameraCapture(session: CameraSession) {
    if (session.closed) return;
    const enabled = [...session.outputTracks].some((track) => track.readyState !== 'ended' && readEnabled(track));
    for (const raw of session.rawVideo) if (raw.readyState !== 'ended') writeEnabled(raw, enabled);
    status();
  }

  function wrapTrack(track: MediaStreamTrack, session: CameraSession): MediaStreamTrack {
    session.outputTracks.add(track);
    try {
      Object.defineProperty(track, 'enabled', {
        configurable: true,
        get: () => readEnabled(track),
        set: (value: boolean) => { writeEnabled(track, Boolean(value)); updateCameraCapture(session); }
      });
    } catch { /* Camera output enable state remains native if an override is unavailable. */ }
    const nativeStop = track.stop.bind(track);
    const nativeClone = track.clone.bind(track);
    track.stop = () => {
      nativeStop();
      session.outputTracks.delete(track);
      if (!session.outputTracks.size) closeSession(session);
      else updateCameraCapture(session);
    };
    track.clone = () => wrapTrack(nativeClone(), session);
    const raw = session.rawVideo[0];
    const capturedSettings = track.getSettings.bind(track);
    track.getSettings = () => ({ ...raw.getSettings(), ...capturedSettings(), width: session.canvas.width, height: session.canvas.height });
    track.getConstraints = () => raw.getConstraints();
    if (raw.getCapabilities) track.getCapabilities = () => raw.getCapabilities();
    track.applyConstraints = async (constraints?: MediaTrackConstraints) => {
      await raw.applyConstraints(constraints);
      session.mask = null;
      if (session.renderer.hasPlate) {
        if (desiredHidden || ['vanishing', 'hidden', 'returning'].includes(session.renderer.state)) session.forcedHidden = true;
        session.renderer.clearPlate();
        error = 'Camera settings changed. Capture the empty room again before the next effect.';
        status();
      }
    };
    track.addEventListener('ended', () => {
      session.outputTracks.delete(track);
      if (!session.outputTracks.size) closeSession(session);
      else updateCameraCapture(session);
    }, { once: true });
    updateCameraCapture(session);
    return track;
  }

  async function makeSession(stream: MediaStream): Promise<MediaStream> {
    const video = document.createElement('video');
    let session: CameraSession | null = null;
    let output: MediaStream | null = null;
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    try {
      video.srcObject = new MediaStream(stream.getVideoTracks());
      await video.play();
      const canvas = document.createElement('canvas');
      const ratio = video.videoWidth / (video.videoHeight || 1);
      canvas.width = 640;
      canvas.height = Math.max(1, Math.round(640 / (Number.isFinite(ratio) && ratio > 0 ? ratio : 16 / 9)));
      const current: CameraSession = { video, canvas, rawVideo: stream.getVideoTracks(), outputTracks: new Set<MediaStreamTrack>(), renderer: null as unknown as EffectRenderer, mask: null, handStatus: 'no-hand', closed: false, forcedHidden: desiredHidden, callback: 0, lastRender: 0, inferenceMs: 0, timer: 0 };
      session = current;
      current.renderer = new EffectRenderer(canvas, { onState: (state: string) => setState(current, state) });
      current.renderer.setOptions(settings);
      if (current.forcedHidden) paintSafe(current);
      else current.renderer.render(video, null, performance.now());
      output = canvas.captureStream(30);
      const track = output.getVideoTracks()[0];
      if (!track) throw new Error('Processed camera track is unavailable.');
      wrapTrack(track, current);
      const outgoing = new MediaStream([...output.getVideoTracks(), ...stream.getAudioTracks()]);
      current.rawVideo.forEach((raw) => raw.addEventListener('ended', () => closeSession(current), { once: true }));
      const tick = (timestamp = performance.now()) => {
        if (current.closed || timestamp - current.lastRender < 26) return;
        current.lastRender = timestamp;
        keepMuted();
        try {
          if (current.forcedHidden) paintSafe(current);
          else current.renderer.render(video, current.mask, timestamp);
        } catch (cause) {
          error = messageOf(cause, 'Camera effect failed.');
          if (desiredHidden || current.renderer.state !== 'visible') {
            current.forcedHidden = true;
            desiredHidden = true;
            for (const sibling of sessions) sibling.forcedHidden = true;
            if (!gateHeld) muteImmediately();
            keepMuted();
            paintSafe(current);
          } else canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
          status();
        }
        if (current === active) requestInference(current, timestamp);
      };
      const frame = (timestamp: DOMHighResTimeStamp) => {
        tick(timestamp);
        if (!current.closed && video.requestVideoFrameCallback) current.callback = video.requestVideoFrameCallback(frame);
      };
      sessions.add(current);
      active = current;
      if (current.forcedHidden) error = 'Camera changed while hidden. Return to camera explicitly; the microphone stays muted.';
      if (video.requestVideoFrameCallback) current.callback = video.requestVideoFrameCallback(frame);
      current.timer = window.setInterval(() => tick(performance.now()), 33);
      status();
      return outgoing;
    } catch (cause) {
      if (session) closeSession(session);
      else {
        video.pause(); video.srcObject = null;
        stream.getVideoTracks().forEach((track) => track.stop());
      }
      output?.getTracks().forEach((track) => track.stop());
      throw cause;
    }
  }

  async function requestInference(session: CameraSession, timestamp: number) {
    if (!ready || !engineOrigin || session.video.readyState < 2 || timestamp - lastInference < 75) return;
    if (inferencePending) {
      if (timestamp > inferenceDeadline) {
        inferencePending = false;
        ready = false;
        error = 'Gesture processing stopped responding. Use manual controls; your hidden camera remains hidden.';
        status();
      }
      return;
    }
    const frame = engineFrame();
    if (!frame?.contentWindow) return;
    lastInference = timestamp;
    inferencePending = true;
    inferenceSession = session;
    inferenceDeadline = timestamp + 12000;
    try {
      const bitmap = await createImageBitmap(session.video, { resizeWidth: 384, resizeHeight: Math.round(384 * session.canvas.height / session.canvas.width) });
      if (session.closed || !ready) { bitmap.close(); inferencePending = false; return; }
      frame.contentWindow.postMessage({ source: 'prismwink-hook', type: 'frame', bitmap, timestamp }, engineOrigin, [bitmap]);
    } catch (cause) {
      inferencePending = false;
      error = messageOf(cause, 'Could not send a camera frame for gesture processing.');
      status();
    }
  }

  function toggle() {
    if (!active || active.closed) { error = 'Turn on your Meet camera first.'; status(); return; }
    if (active.forcedHidden) { error = 'Use Return safely to recover the changed camera. Microphone stays muted.'; status(); return; }
    if (!active.renderer.hasPlate) { error = 'Capture the empty room before using an effect.'; status(); return; }
    const maskFresh = active.mask && performance.now() - (active.maskAt || 0) < 2500;
    if (!ready || !maskFresh) { error = 'Wait for camera processing to be ready, then try again.'; status(); return; }
    try {
      if (['vanishing', 'returning'].includes(active.renderer.state)) return;
      if (active.renderer.toggle(active.video, active.mask, performance.now())) error = '';
      else error = 'Wait for a clear person cutout, then try again.';
      status();
    } catch (cause) { error = messageOf(cause, 'Could not start the effect.'); status(); }
  }

  Object.defineProperty(media, 'getUserMedia', { configurable: true, writable: true, value: async function (constraints: MediaStreamConstraints): Promise<MediaStream> {
    const stream = await nativeGetUserMedia(constraints);
    stream.getAudioTracks().forEach(registerAudio);
    if (!constraints?.video || !stream.getVideoTracks().length) return stream;
    try { return await makeSession(stream); }
    catch (cause) {
      error = `Camera effect unavailable: ${messageOf(cause, 'initialization failed')}`;
      status();
      stream.getTracks().forEach((track) => track.stop());
      throw new DOMException(`Prismwink could not prepare a safe camera: ${messageOf(cause, 'initialization failed')}. Turn the camera off and on to retry.`, 'NotReadableError');
    }
  } });

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.source === 'prismwink-engine') {
      if (!engineOrigin || event.origin !== engineOrigin || event.source !== engineFrame()?.contentWindow) return;
      if (data.type === 'ready') { ready = true; error = ''; status(); }
      else if (data.type === 'error') {
        ready = false;
        inferencePending = false;
        error = data.error || 'Local gesture processing is unavailable.';
        status();
      } else if (data.type === 'result') {
        const session = inferenceSession;
        inferencePending = false;
        inferenceSession = null;
        if (!session || session.closed) return;
        if (data.mask?.data instanceof Uint8Array && data.mask.width > 0 && data.mask.height > 0 && data.mask.data.length === data.mask.width * data.mask.height) {
          session.mask = data.mask;
          session.maskAt = performance.now();
        }
        session.handStatus = ['ready', 'pinched', 'no-hand'].includes(data.handStatus) ? data.handStatus : 'no-hand';
        if (data.gesture && settings.gestures && session === active) toggle();
        status();
      }
      return;
    }
    if (event.source !== window || event.origin !== location.origin || data.source !== 'prismwink-content') return;
    if (data.type === 'config') {
      try {
        const url = new URL(data.engineUrl);
        if (url.protocol !== 'chrome-extension:' || url.pathname !== '/engine.html') return;
        engineUrl = url.href;
        engineOrigin = `${url.protocol}//${url.host}`;
        engineFrame()?.contentWindow?.postMessage({ source: 'prismwink-hook', type: 'hello' }, engineOrigin);
        status();
      } catch { /* Ignore an invalid extension resource URL. */ }
      return;
    }
    if (data.type !== 'command') return;
    try {
      if (data.command === 'toggle') toggle();
      else if (data.command === 'capture') {
        if (!active || active.closed) throw new Error('Turn on your Meet camera first.');
        if (desiredHidden || active.renderer.state !== 'visible') throw new Error('Return to camera before capturing the empty room.');
        active.renderer.capturePlate(active.video);
        error = '';
      } else if (data.command === 'clear-plate') {
        if (desiredHidden) throw new Error('Return to camera before clearing the room capture.');
        sessions.forEach((session) => session.renderer.clearPlate());
      } else if (data.command === 'recover') {
        desiredHidden = false;
        sessions.forEach((session) => { session.forcedHidden = false; session.renderer.recover(); });
        error = gateHeld ? 'Camera returned safely. Microphone stays muted; use the Meet microphone control.' : '';
      } else if (data.command === 'configure') {
        const value = data.options || {};
        settings = { ...settings,
          effect: ['dust', 'pixel', 'confetti', 'smoke'].includes(value.effect) ? value.effect : settings.effect,
          duration: Number.isFinite(value.duration) ? Math.max(500, Math.min(5000, value.duration)) : settings.duration,
          density: Number.isFinite(value.density) ? Math.max(500, Math.min(9000, value.density)) : settings.density,
          palette: ['natural', 'prism', 'stardust'].includes(value.palette) ? value.palette : settings.palette,
          direction: ['left', 'right', 'up'].includes(value.direction) ? value.direction : settings.direction,
          reducedMotion: typeof value.reducedMotion === 'boolean' ? value.reducedMotion : settings.reducedMotion,
          gestures: typeof value.gestures === 'boolean' ? value.gestures : settings.gestures };
        sessions.forEach((session) => session.renderer.setOptions(settings));
      } else if (data.command === 'mic-result') {
        const result = data.options || {};
        if (result.action === 'manual') {
          microphones.forEach((entry) => { entry.owned = false; });
          if (!desiredHidden && !['vanishing', 'hidden'].includes(active?.renderer.state || '') && result.restoreAllowed && result.success) {
            gateHeld = false;
            microphones.forEach((entry, track) => { if (track.readyState !== 'ended') writeEnabled(track, entry.requested); });
          }
        } else if (result.action === 'restore' && !desiredHidden) {
          ++restoreRequest;
          releaseOwnedAudio(Boolean(result.success && result.restoreAllowed));
          if (!result.restoreAllowed) error = 'Camera returned. Microphone remains muted; use the Meet microphone control.';
        } else if (result.action === 'mute') {
          ownMutePending = false;
          if (!result.success) error = 'Outgoing audio is muted. Meet microphone button could not be synchronized.';
        }
      } else if (data.command === 'stop') {
        [...sessions].forEach((session) => [...session.outputTracks].forEach((track) => track.stop()));
        error = 'Processing stopped. Turn your Meet camera off and on to restart.';
      }
    } catch (cause) { error = messageOf(cause, 'Prismwink could not complete that action.'); }
    status();
  });
  window.addEventListener('pagehide', () => [...sessions].forEach(closeSession), { once: true });
  status();
})();
