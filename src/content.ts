export {};

type CameraSettings = { effect: string; duration: number; density: number; palette: string; direction: string; gestures: boolean; reducedMotion: boolean };
interface DockState { quality: 'full' | 'balanced' | 'light'; state: string; hasPlate: boolean; visionReady: boolean; streamActive: boolean; handStatus: string; micGated: boolean; settings: CameraSettings; error: string }
interface DockControls {
  status: HTMLElement; mic: HTMLElement; toggle: HTMLButtonElement; capture: HTMLButtonElement; clear: HTMLButtonElement; recover: HTMLButtonElement; notice: HTMLElement; effect: HTMLSelectElement; palette: HTMLSelectElement; direction: HTMLSelectElement; duration: HTMLInputElement; density: HTMLInputElement; gestures: HTMLInputElement; processing: HTMLElement; hand: HTMLElement; sync: HTMLElement; studio: HTMLButtonElement; body: HTMLElement; compact: HTMLButtonElement; compactActions: HTMLElement; compactToggle: HTMLButtonElement; compactRecover: HTMLButtonElement; reducedMotion: HTMLInputElement; durationValue: HTMLElement; densityValue: HTMLElement;
}

(() => {
  if (document.getElementById('prismwink-dock')) return;
  const origin = location.origin;
  const defaults: CameraSettings = { effect: 'dust', duration: 2500, density: 4500, palette: 'natural', direction: 'right', gestures: true, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };
  let state: DockState = { quality: 'full', state: 'visible', hasPlate: false, visionReady: false, streamActive: false, handStatus: 'no-hand', micGated: false, settings: defaults, error: '' };
  let settings = { ...defaults };
  let host: HTMLDivElement;
  let shadow: ShadowRoot;
  let captureTimer: number | undefined;
  let captureRemaining = 0;
  let notice = '';
  let captureQueued = false;
  let micOwnership = { owned: false, changed: false };
  let micSerial = 0;
  let internalMicAction = false;
  let lastSync = '';
  let expectedMicState: boolean | null = null;
  let expectedMicUntil = 0;
  let collapsed = false;
  let controls: DockControls;
  const command = (name: string, options?: unknown) => window.postMessage({ source: 'prismwink-content', type: 'command', command: name, options }, origin);
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  function microphone(): { button: HTMLElement | null; on: boolean | null } {
    const possible = [...document.querySelectorAll<HTMLElement>('button,[role="button"]')];
    for (const button of possible) {
      const label = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('data-tooltip') || ''}`.toLowerCase();
      if (!/microphone|micrófono|microfono|microfone|mikrofon|micro|マイク|마이크|麦克风|麥克風/.test(label)) continue;
      if (/camera|caméra|cámara/.test(label)) continue;
      if (button.getAttribute('aria-hidden') === 'true' || button.getAttribute('aria-disabled') === 'true' || (button instanceof HTMLButtonElement && button.disabled) || !button.getClientRects().length) continue;
      const muted = button.getAttribute('data-is-muted') ?? button.closest('[data-is-muted]')?.getAttribute('data-is-muted');
      if (muted === 'true' || muted === 'false') return { button, on: muted === 'false' };
      if (/unmute|turn on|activate microphone|activar mic|ativar micro|mikrofon einschalten|activer le micro|マイクをオン|마이크 켜기/.test(label) && !/désactiver|desactivar|desativar/.test(label)) return { button, on: false };
      if (/turn off|mute microphone|disable microphone|desactivar|desativar|désactiver|mikrofon ausschalten|マイクをオフ|마이크 끄기/.test(label)) return { button, on: true };
      return { button, on: null };
    }
    return { button: null, on: null };
  }

  async function synchronizeMic(action: 'mute' | 'restore') {
    const serial = ++micSerial;
    const before = microphone();
    if (action === 'mute') {
      micOwnership = { owned: false, changed: false };
      if (before.on === false) {
        lastSync = 'Already muted before the effect.';
        command('mic-result', { action, success: true, restoreAllowed: false });
        render();
        return;
      }
      if (!before.button || before.on !== true) {
        lastSync = 'Audio gated; Meet button status unavailable.';
        command('mic-result', { action, success: false, restoreAllowed: false });
        render();
        return;
      }
      try {
        internalMicAction = true;
        expectedMicState = false; expectedMicUntil = performance.now() + 600;
        before.button?.click();
        internalMicAction = false;
        await delay(220);
        if (serial !== micSerial) return;
        const success = microphone().on === false;
        micOwnership.owned = success && !micOwnership.changed;
        lastSync = success ? 'Meet microphone muted.' : 'Audio gated; Meet button did not confirm mute.';
        command('mic-result', { action, success, restoreAllowed: false });
      } finally { internalMicAction = false; render(); }
      return;
    }
    if (action !== 'restore') return;
    const allowed = micOwnership.owned && !micOwnership.changed && before.on === false && Boolean(before.button);
    micOwnership.owned = false;
    if (!allowed) {
      lastSync = 'Microphone stays muted. Use the Meet microphone control when ready.';
      command('mic-result', { action, success: false, restoreAllowed: false });
      render();
      return;
    }
    try {
      internalMicAction = true;
      expectedMicState = true; expectedMicUntil = performance.now() + 600;
      before.button?.click();
      internalMicAction = false;
      await delay(220);
      if (serial !== micSerial) return;
      const success = !micOwnership.changed && microphone().on === true;
      lastSync = success ? 'Previous microphone state restored.' : 'Microphone remains muted; restore it in Meet.';
      command('mic-result', { action, success, restoreAllowed: success });
    } finally { internalMicAction = false; render(); }
  }

  function manualMicAction() {
    if (internalMicAction) return;
    micOwnership.changed = true;
    micOwnership.owned = false;
    ++micSerial;
    command('mic-result', { action: 'manual', success: true, restoreAllowed: false });
    setTimeout(() => {
      const current = microphone();
      command('mic-result', { action: 'manual', success: current.on !== null, restoreAllowed: current.on === true });
      lastSync = current.on === false ? 'You muted the microphone; it will stay muted.' : current.on === true ? 'Microphone changed in Meet.' : 'Microphone status unavailable.';
      render();
    }, 250);
  }

  document.addEventListener('click', (event) => {
    if (!event.isTrusted || internalMicAction) return;
    const current = microphone();
    if (current.button && event.composedPath().includes(current.button)) manualMicAction();
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.isTrusted && (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'd') manualMicAction();
  }, true);

  function saveSettings() {
    command('configure', settings);
    chrome.storage.local.set({ prismwinkSettings: settings }).catch(() => {});
  }

  function cancelCapture() {
    clearInterval(captureTimer);
    captureRemaining = 0;
    captureTimer = undefined;
  }

  function beginCapture() {
    if (captureTimer) { cancelCapture(); notice = 'Room capture canceled.'; render(); return; }
    if (!state.streamActive || state.state !== 'visible') return;
    captureRemaining = 5;
    notice = 'Step out of view now. Keep the camera still.';
    render();
    captureTimer = window.setInterval(() => {
      captureRemaining -= 1;
      if (captureRemaining <= 0) {
        cancelCapture();
        notice = '';
        captureQueued = true;
        command('capture');
      }
      render();
    }, 1000);
  }

  function render() {
    if (!shadow) return;
    const hidden = ['vanishing', 'hidden', 'recovery'].includes(state.state);
    controls.status.textContent = state.streamActive ? hidden ? state.state === 'recovery' ? 'Recovery needed' : 'Camera hidden' : state.state === 'returning' ? 'Returning to camera' : 'Camera visible' : 'Turn on your Meet camera';
    controls.mic.textContent = state.micGated ? 'Outgoing audio muted' : microphone().on === false ? 'Meet microphone muted' : microphone().on === true ? 'Meet microphone on' : 'Microphone status unavailable';
    for (const toggle of [controls.toggle, controls.compactToggle]) {
      toggle.textContent = hidden ? 'Return to camera' : 'Vanish & mute';
      toggle.disabled = !state.streamActive || !state.visionReady || !state.hasPlate || ['vanishing', 'returning', 'recovery'].includes(state.state);
    }
    controls.capture.disabled = !state.streamActive || state.state !== 'visible';
    controls.capture.textContent = captureRemaining ? `Cancel capture · ${captureRemaining}` : state.hasPlate ? 'Retake empty room' : 'Capture empty room';
    for (const recover of [controls.recover, controls.compactRecover]) {
      recover.hidden = !hidden && !state.micGated && !state.error;
      recover.disabled = !state.streamActive;
    }
    controls.processing.textContent = state.visionReady ? state.quality === 'full' ? 'Local processing ready' : `Local processing ready · auto detail ${state.quality}` : 'Loading local processing…';
    controls.hand.textContent = state.handStatus === 'pinched' ? 'Pinch held · release to snap' : state.handStatus === 'ready' ? 'Hand detected' : 'Show a hand to the camera';
    controls.notice.textContent = state.error || notice || (!state.hasPlate ? 'Capture the empty room first: step away during the 5-second countdown, then return.' : 'Hold your thumb and middle finger together briefly, then release. Use the button if the gesture is missed.');
    controls.notice.dataset.error = String(Boolean(state.error));
    controls.sync.textContent = lastSync;
    controls.compact.textContent = collapsed ? 'Show controls' : 'Collapse';
    controls.compact.setAttribute('aria-expanded', String(!collapsed));
    controls.body.hidden = collapsed;
    controls.compactActions.hidden = !collapsed;
    controls.effect.disabled = ['vanishing', 'returning'].includes(state.state);
    controls.clear.disabled = !state.hasPlate || hidden;
    controls.durationValue.textContent = `${(settings.duration / 1000).toFixed(1)} s`;
    controls.densityValue.textContent = Number(settings.density).toLocaleString();
  }

  async function mount() {
    if (!document.body || document.getElementById('prismwink-dock')) return;
    try {
      const stored = (await chrome.storage.local.get('prismwinkSettings')).prismwinkSettings as Partial<CameraSettings> | undefined;
      if (stored && typeof stored === 'object') settings = {
        ...defaults,
        effect: typeof stored.effect === 'string' && ['dust', 'pixel', 'confetti', 'smoke'].includes(stored.effect) ? stored.effect : defaults.effect,
        duration: typeof stored.duration === 'number' && Number.isFinite(stored.duration) ? Math.max(500, Math.min(5000, stored.duration)) : defaults.duration,
        density: typeof stored.density === 'number' && Number.isFinite(stored.density) ? Math.max(500, Math.min(9000, stored.density)) : defaults.density,
        palette: typeof stored.palette === 'string' && ['natural', 'prism', 'stardust'].includes(stored.palette) ? stored.palette : defaults.palette,
        direction: typeof stored.direction === 'string' && ['left', 'right', 'up'].includes(stored.direction) ? stored.direction : defaults.direction,
        gestures: typeof stored.gestures === 'boolean' ? stored.gestures : true,
        reducedMotion: typeof stored.reducedMotion === 'boolean' ? stored.reducedMotion : defaults.reducedMotion
      };
    } catch { /* Defaults remain usable when storage is unavailable. */ }
    if (document.getElementById('prismwink-dock')) return;
    host = document.createElement('div');
    host.id = 'prismwink-dock';
    host.style.cssText = 'position:fixed;right:20px;bottom:92px;z-index:2147483646;color-scheme:dark;';
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        @font-face{font-family:Manrope;src:url('${chrome.runtime.getURL('assets/fonts/manrope.ttf')}')}*{box-sizing:border-box}section{width:320px;max-width:calc(100vw - 32px);max-height:calc(100vh - 116px);overflow:auto;background:#151c2e;color:#f4f5fc;border:1px solid #384157;border-radius:14px;box-shadow:0 14px 40px #0005;font:14px/1.5 Manrope,sans-serif}header{display:flex;align-items:center;gap:9px;padding:12px 14px;border-bottom:1px solid #30394d;cursor:grab;user-select:none}header img{width:24px;height:24px}strong{font-size:15px}button,input,select{font:inherit}button{cursor:pointer;min-height:40px;border:1px solid #4b566f;border-radius:8px;background:#202a40;color:#f4f5fc;padding:8px 11px}button:hover{background:#2d3850}button:disabled{cursor:not-allowed;opacity:.5}button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible{outline:3px solid #b6a0ff;outline-offset:2px}.collapse{margin-left:auto;min-height:32px;font-size:12px;padding:5px 8px}.body{padding:14px}.status{margin:0;font-weight:650}.mic{color:#a6b1ca;font-size:13px;margin:3px 0 13px}.primary{width:100%;background:#b6a0ff;color:#090d19;border-color:#b6a0ff;font-weight:750;min-height:44px}.primary:hover{background:#c4b4ff}.row{display:flex;gap:8px;margin:10px 0}.row button{flex:1}.compact-actions{padding:12px 14px;margin:0}.compact-actions button{min-height:44px}label{display:flex;justify-content:space-between;align-items:center;gap:9px;margin:13px 0 5px}select{max-width:160px;min-height:38px;background:#090d19;border:1px solid #4b566f;border-radius:6px;color:#f4f5fc;padding:6px 8px}input[type=range]{width:100%;accent-color:#b6a0ff}input[type=checkbox]{width:18px;height:18px;accent-color:#b6a0ff}.hint{font-size:13px;color:#a6b1ca;overflow-wrap:anywhere}.notice{margin:13px 0;padding:10px;background:#090d19;border-radius:8px;font-size:13px}.notice[data-error=true]{color:#ffb3b5}.ready{color:#79e8d0;margin:11px 0 0;font-size:12px}.hand{margin:3px 0;font-size:12px;color:#a6b1ca}.footer{border-top:1px solid #30394d;padding-top:10px;margin-top:14px}.studio{width:100%}[hidden]{display:none!important}
      </style>
      <section aria-label="Prismwink camera controls">
        <header><img src="${chrome.runtime.getURL('assets/icon.svg')}" alt=""><strong>Prismwink</strong><button class="collapse" id="collapse" aria-expanded="true">Collapse</button></header>
        <div class="row compact-actions" id="compact-actions" hidden><button id="compact-toggle" class="primary">Vanish &amp; mute</button><button id="compact-recover" hidden>Return safely · keep muted</button></div>
        <div class="body" id="body"><p id="status" class="status"></p><p id="mic" class="mic" aria-live="polite"></p>
          <button id="toggle" class="primary">Vanish & mute</button>
          <div class="row"><button id="capture">Capture empty room</button><button id="clear" aria-label="Clear the empty room capture">Clear</button></div>
          <button id="recover" class="studio" hidden>Return safely · keep muted</button>
          <p id="notice" class="notice" role="status"></p>
          <label for="effect">Effect<select id="effect"><option value="dust">Dust dissolve</option><option value="pixel">Pixel scatter</option><option value="confetti">Confetti</option><option value="smoke">Soft smoke</option></select></label>
          <label for="palette">Color<select id="palette"><option value="natural">Natural</option><option value="prism">Prism mint</option><option value="stardust">Stardust gold</option></select></label>
          <label for="direction">Direction<select id="direction"><option value="right">Right</option><option value="left">Left</option><option value="up">Up</option></select></label>
          <label for="duration">Duration <span id="duration-value"></span></label><input id="duration" type="range" min="500" max="5000" step="100">
          <label for="density">Particle detail <span id="density-value"></span></label><input id="density" type="range" min="500" max="9000" step="500">
          <label for="gestures">Gesture control<input id="gestures" type="checkbox"></label>
          <label for="reduced-motion">Reduced motion<input id="reduced-motion" type="checkbox"></label>
          <p id="processing" class="ready"></p><p id="hand" class="hand"></p><p id="sync" class="hint"></p>
          <div class="footer"><p class="hint">The physical camera stays on while hidden so it can detect your return. The empty room is a still image.</p><button id="studio" class="studio">Open practice studio</button><p class="hint">Shortcut: Alt + Shift + V</p></div>
        </div>
      </section>`;
    document.body.append(host);
    let lastObservedMic = microphone().on;
    const microphoneObserver = new MutationObserver(() => {
      const current = microphone().on;
      if (current === lastObservedMic) return;
      lastObservedMic = current;
      if (performance.now() < expectedMicUntil && current === expectedMicState) return;
      if (micOwnership.owned) {
        micOwnership.owned = false; micOwnership.changed = true; ++micSerial;
        command('mic-result', { action: 'manual', success: true, restoreAllowed: false });
        lastSync = 'Microphone changed outside Prismwink; it will stay muted.';
        render();
      }
    });
    microphoneObserver.observe(document.body, { subtree: true, attributes: true, childList: true, attributeFilter: ['aria-label', 'data-is-muted'] });
    window.addEventListener('pagehide', () => microphoneObserver.disconnect(), { once: true });
    const element = <T extends HTMLElement>(id: string): T => shadow.getElementById(id) as T;
    controls = {
      status: element('status'), mic: element('mic'), toggle: element('toggle'), capture: element('capture'), clear: element('clear'), recover: element('recover'), notice: element('notice'), effect: element('effect'), palette: element('palette'), direction: element('direction'), duration: element('duration'), density: element('density'), gestures: element('gestures'), processing: element('processing'), hand: element('hand'), sync: element('sync'), studio: element('studio'), body: element('body'), compact: element('collapse'), compactActions: element('compact-actions'), compactToggle: element('compact-toggle'), compactRecover: element('compact-recover'), reducedMotion: element('reduced-motion'), durationValue: element('duration-value'), densityValue: element('density-value')
    };
    controls.effect.value = settings.effect;
    controls.palette.value = settings.palette;
    controls.direction.value = settings.direction;
    controls.duration.value = String(settings.duration);
    controls.density.value = String(settings.density);
    controls.gestures.checked = settings.gestures;
    controls.reducedMotion.checked = settings.reducedMotion;
    for (const toggle of [controls.toggle, controls.compactToggle]) toggle.addEventListener('click', () => command('toggle'));
    controls.capture.addEventListener('click', beginCapture);
    controls.clear.addEventListener('click', () => command('clear-plate'));
    for (const recover of [controls.recover, controls.compactRecover]) recover.addEventListener('click', () => command('recover'));
    controls.compact.addEventListener('click', () => { collapsed = !collapsed; render(); });
    controls.studio.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'open-studio' }).catch(() => {}));
    for (const key of ['effect', 'palette', 'direction', 'duration', 'density', 'gestures', 'reducedMotion'] as const) {
      controls[key].addEventListener('change', () => {
        const field = controls[key];
        if (key === 'gestures' || key === 'reducedMotion') settings[key] = (field as HTMLInputElement).checked;
        else if (key === 'duration' || key === 'density') settings[key] = Number(field.value);
        else settings[key] = field.value;
        saveSettings(); render();
      });
    }
    const header = shadow.querySelector('header') as HTMLElement;
    header.addEventListener('pointerdown', (event) => {
      if ((event.target as Element).closest('button')) return;
      const startX = event.clientX, startY = event.clientY;
      const rect = host.getBoundingClientRect();
      header.setPointerCapture(event.pointerId);
      const move = (next: PointerEvent) => {
        host.style.right = 'auto'; host.style.bottom = 'auto';
        host.style.left = `${Math.max(8, Math.min(innerWidth - rect.width - 8, rect.left + next.clientX - startX))}px`;
        host.style.top = `${Math.max(8, Math.min(innerHeight - 48, rect.top + next.clientY - startY))}px`;
      };
      const up = () => { header.removeEventListener('pointermove', move); header.removeEventListener('pointerup', up); };
      header.addEventListener('pointermove', move); header.addEventListener('pointerup', up, { once: true });
    });
    const iframe = document.createElement('iframe');
    iframe.id = 'prismwink-engine';
    iframe.src = chrome.runtime.getURL('engine.html');
    iframe.setAttribute('aria-hidden', 'true'); iframe.tabIndex = -1;
    iframe.style.cssText = 'position:fixed;width:1px;height:1px;left:-20px;top:-20px;border:0;opacity:0;pointer-events:none';
    const configure = () => {
      window.postMessage({ source: 'prismwink-content', type: 'config', engineUrl: iframe.src }, origin);
      command('configure', settings);
    };
    iframe.addEventListener('load', configure);
    document.body.append(iframe);
    configure();
    render();
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== origin || event.data?.source !== 'prismwink-hook') return;
    const data = event.data;
    if (data.type === 'mic' && ['mute', 'restore'].includes(data.action)) synchronizeMic(data.action);
    else if (data.type === 'mic' && data.action === 'invalidate') {
      micOwnership.owned = false; micOwnership.changed = true; ++micSerial;
      lastSync = 'Microphone changed outside Prismwink; it will stay muted.';
      render();
    }
    else if (data.type === 'status') {
      state = { ...state, ...data };
      if (captureQueued && (data.hasPlate || data.error)) {
        captureQueued = false;
        notice = data.hasPlate ? 'Empty room captured. Return to your seat and try a snap.' : '';
      }
      if (!data.streamActive) cancelCapture();
      render();
    }
  });
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'prismwink-toggle') command('toggle');
  });
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
  window.addEventListener('pagehide', cancelCapture, { once: true });
})();
