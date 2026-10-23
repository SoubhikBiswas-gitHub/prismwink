export {};

interface Status { camera: boolean; phase: 'visible' | 'vanishing' | 'hidden' | 'returning'; vision: 'loading' | 'ready' | 'error'; error: string; hand: 'none' | 'hand' | 'armed'; room: number; gestures: boolean; notice: string }
interface Settings { gestures: boolean }

const STYLE = `
:host{all:initial}
.pill{display:flex;align-items:center;gap:10px;min-height:48px;max-width:min(420px,calc(100vw - 32px));padding:6px 6px 6px 14px;border-radius:999px;background:#151c2e;border:1px solid #2e3850;box-shadow:0 8px 28px rgba(0,0,0,.35);color:#f4f5fc;font:500 14px/1.3 "Google Sans",Roboto,system-ui,sans-serif;box-sizing:border-box}
.dot{flex:none;width:10px;height:10px;border-radius:50%;background:#5b6680;transition:background-color .18s ease-out,box-shadow .18s ease-out}
.dot[data-tone=ready]{background:#79e8d0}
.dot[data-tone=hand]{background:#79e8d0;box-shadow:0 0 0 4px rgba(121,232,208,.22)}
.dot[data-tone=armed]{background:#b6a0ff;box-shadow:0 0 0 6px rgba(182,160,255,.3)}
.dot[data-tone=busy]{background:#f4cc81}
.dot[data-tone=hidden]{background:#b6a0ff}
.dot[data-tone=error]{background:#ff8d90}
.text{display:flex;flex-direction:column;min-width:0;flex:1}
.title{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.detail{font-size:12px;color:#a6b1ca;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.detail:empty{display:none}
button{flex:none;min-width:88px;min-height:36px;padding:0 16px;border:0;border-radius:999px;background:#b6a0ff;color:#090d19;font:600 14px "Google Sans",Roboto,system-ui,sans-serif;cursor:pointer;transition:background-color .15s ease-out}
button:hover{background:#c8b8ff}
button:focus-visible{outline:2px solid #f4f5fc;outline-offset:2px}
button:disabled{background:#2e3850;color:#a6b1ca;cursor:default}
@media (prefers-reduced-motion:reduce){.dot,button{transition:none}}
`;

(() => {
  if (document.getElementById('prismwink-pill')) return;
  const origin = location.origin;
  let status: Status = { camera: false, phase: 'visible', vision: 'loading', error: '', hand: 'none', room: 0, gestures: true, notice: '' };
  let settings: Settings = { gestures: true };
  let host: HTMLDivElement | null = null;
  let frame: HTMLIFrameElement | null = null;
  const parts = {} as { dot: HTMLSpanElement; title: HTMLSpanElement; detail: HTMLSpanElement; button: HTMLButtonElement };

  const post = (data: Record<string, unknown>) => window.postMessage({ source: 'prismwink-content', ...data }, origin);
  const pushSettings = () => post({ type: 'settings', gestures: settings.gestures });

  function describe(): { tone: string; title: string; detail: string } {
    const gesture = status.gestures && status.vision === 'ready';
    if (status.phase === 'vanishing') return { tone: 'busy', title: 'Vanishing…', detail: '' };
    if (status.phase === 'returning') return { tone: 'busy', title: 'Coming back…', detail: '' };
    if (status.phase === 'hidden') return { tone: 'hidden', title: 'You’re hidden', detail: gesture ? 'Snap again to come back' : 'Press Return to come back' };
    if (!status.camera) return { tone: 'idle', title: 'Prismwink', detail: 'Turn on your camera to use it' };
    if (status.vision === 'error') return { tone: 'error', title: 'Gesture unavailable', detail: status.error || 'Use the button or Alt+Shift+V' };
    if (status.vision === 'loading') return { tone: 'busy', title: 'Getting ready…', detail: '' };
    const room = status.room < 0.6 ? `Learning your room · ${Math.round(status.room * 100)}%` : '';
    if (!gesture) return { tone: 'ready', title: 'Ready', detail: room || 'Press Vanish or Alt+Shift+V' };
    if (status.hand === 'armed') return { tone: 'armed', title: 'Now snap', detail: room };
    if (status.hand === 'hand') return { tone: 'hand', title: 'Hand seen · snap to vanish', detail: room };
    return { tone: 'ready', title: 'Snap to vanish', detail: room || 'Thumb and middle finger, then snap' };
  }

  function render() {
    if (!host) return;
    const view = describe();
    parts.dot.dataset.tone = view.tone;
    parts.title.textContent = view.title;
    parts.detail.textContent = status.notice || view.detail;
    const hidden = status.phase === 'hidden' || status.phase === 'returning';
    parts.button.textContent = hidden ? 'Return' : 'Vanish';
    parts.button.setAttribute('aria-label', hidden ? 'Return to camera and restore microphone' : 'Vanish from camera and mute microphone');
    parts.button.disabled = (!status.camera && status.phase === 'visible') || status.phase === 'vanishing' || status.phase === 'returning';
  }

  function mount() {
    if (!document.body) return;
    if (!host?.isConnected) {
      host = document.createElement('div');
      host.id = 'prismwink-pill';
      host.style.cssText = 'position:fixed;left:16px;bottom:96px;z-index:2147483646';
      const shadow = host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = STYLE;
      const pill = document.createElement('div');
      pill.className = 'pill';
      pill.setAttribute('role', 'status');
      pill.setAttribute('aria-live', 'polite');
      parts.dot = document.createElement('span');
      parts.dot.className = 'dot';
      const text = document.createElement('span');
      text.className = 'text';
      parts.title = document.createElement('span');
      parts.title.className = 'title';
      parts.detail = document.createElement('span');
      parts.detail.className = 'detail';
      text.append(parts.title, parts.detail);
      parts.button = document.createElement('button');
      parts.button.type = 'button';
      parts.button.addEventListener('click', () => post({ type: 'toggle' }));
      pill.append(parts.dot, text, parts.button);
      shadow.append(style, pill);
      document.body.append(host);
      render();
    }
    if (!frame?.isConnected) {
      frame = document.createElement('iframe');
      frame.id = 'prismwink-engine';
      frame.src = chrome.runtime.getURL('engine.html');
      frame.setAttribute('aria-hidden', 'true');
      frame.tabIndex = -1;
      frame.style.cssText = 'position:fixed;width:1px;height:1px;left:-10px;top:-10px;border:0;opacity:0;pointer-events:none';
      frame.addEventListener('load', () => { post({ type: 'config', engineUrl: frame!.src }); pushSettings(); });
      document.body.append(frame);
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== origin || event.data?.source !== 'prismwink-hook' || event.data.type !== 'status') return;
    status = { ...status, ...event.data };
    render();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'prismwink-toggle') post({ type: 'toggle' });
  });

  chrome.storage.local.get('prismwink').then((stored) => {
    const saved = stored.prismwink as Partial<Settings> | undefined;
    if (typeof saved?.gestures === 'boolean') settings = { gestures: saved.gestures };
    pushSettings();
  }).catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    const next = changes.prismwink?.newValue as Partial<Settings> | undefined;
    if (area !== 'local' || typeof next?.gestures !== 'boolean') return;
    settings = { gestures: next.gestures };
    pushSettings();
  });

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
  // Meet rebuilds large parts of the page between the lobby and the call.
  setInterval(mount, 3000);
})();
