import { describe, type Status } from './format';

interface Placement { x: number; y: number; collapsed: boolean }

const POSE = {
  middle: { open: 'M19 18 L19 11 L19 5', pinch: 'M19 18 L18.5 13 L15.5 13.5', snapped: 'M19 18 L18 15 L16.5 19.5' },
  thumb: { open: 'M13.5 26 L9.5 23 L6.5 19.5', pinch: 'M13.5 26 L12.5 19.5 L15 14', snapped: 'M13.5 26 L12.5 18.5 L14 10.5' }
};

const STYLE = `
:host{all:initial}
*{box-sizing:border-box}
.pill{--tone:#5b6680;display:flex;align-items:center;gap:12px;width:400px;height:60px;padding:8px;border-radius:30px;background:#151c2e;border:1px solid #2e3850;box-shadow:0 12px 32px rgba(0,0,0,.38);color:#f4f5fc;font:500 14px/1.3 "Google Sans",Roboto,system-ui,sans-serif;max-width:min(440px,calc(100vw - 32px));animation:rise .32s cubic-bezier(.2,.8,.2,1) both;touch-action:none;user-select:none;cursor:grab}
.pill.dragging{cursor:grabbing;box-shadow:0 18px 40px rgba(0,0,0,.45)}
.pill[data-tone=ready],.pill[data-tone=hand]{--tone:#79e8d0}
.pill[data-tone=armed],.pill[data-tone=hidden]{--tone:#b6a0ff}
.pill[data-tone=busy]{--tone:#f4cc81}
.pill[data-tone=error]{--tone:#ff8d90}
.pill.collapsed{width:60px;padding:7px;gap:0}
.pill.collapsed .text,.pill.collapsed .action{display:none}
.orb{position:relative;flex:none;width:44px;height:44px;padding:0;border:0;border-radius:50%;background:#0d1322;color:var(--tone);cursor:inherit;transition:color .18s ease-out}
.orb:focus-visible,.action:focus-visible{outline:2px solid #f4f5fc;outline-offset:3px}
.orb svg{position:absolute;inset:0;width:44px;height:44px;overflow:visible}
.ring-track{fill:none;stroke:currentColor;stroke-opacity:.28;stroke-width:2}
.ring-progress{fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-dasharray:132;stroke-dashoffset:132;transform:rotate(-90deg);transform-origin:22px 22px;opacity:0}
.progress .ring-progress{opacity:1;animation:fill var(--duration,2400ms) linear forwards}
.hand{transform:translate(2px,2px)}
.palm{fill:currentColor;fill-opacity:.16;stroke:currentColor;stroke-width:2.4;stroke-linejoin:round}
.finger{fill:none;stroke:currentColor;stroke-width:3.2;stroke-linecap:round;stroke-linejoin:round;transition:d .22s cubic-bezier(.2,.8,.2,1)}
.middle{d:path("${POSE.middle.open}")}
.thumb{d:path("${POSE.thumb.open}")}
[data-pose=pinch] .middle{d:path("${POSE.middle.pinch}")}
[data-pose=pinch] .thumb{d:path("${POSE.thumb.pinch}")}
[data-pose=snapped] .middle{d:path("${POSE.middle.snapped}")}
[data-pose=snapped] .thumb{d:path("${POSE.thumb.snapped}")}
[data-pose=pinch] .orb{box-shadow:0 0 0 4px rgba(182,160,255,.22),0 0 18px rgba(182,160,255,.45)}
[data-pose=coach] .middle{animation:coach-middle 4.4s ease-in-out infinite}
[data-pose=coach] .thumb{animation:coach-thumb 4.4s ease-in-out infinite}
[data-pose=coach] .spark{animation:coach-spark 4.4s ease-out infinite}
.dim .hand{opacity:.55}
.spark{fill:currentColor;opacity:0;transform-box:fill-box;transform-origin:center}
.burst .spark{animation:spark .7s ease-out}
.text{display:flex;flex-direction:column;min-width:0;flex:1}
.title{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.detail{font-size:12px;color:#a6b1ca;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.detail:empty{display:none}
.action{flex:none;min-width:96px;height:44px;padding:0 18px;border:0;border-radius:22px;background:#b6a0ff;color:#090d19;font:600 14px "Google Sans",Roboto,system-ui,sans-serif;cursor:pointer;transition:background-color .15s ease-out,transform .15s ease-out}
.action:hover{background:#c8b8ff}
.action:active{transform:scale(.97)}
.action:disabled{background:#2e3850;color:#a6b1ca;cursor:default;transform:none}
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes fill{to{stroke-dashoffset:0}}
@keyframes spark{0%{opacity:1;transform:translate(0,0) scale(1)}100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(.3)}}
@keyframes coach-spark{0%,60%{opacity:0;transform:translate(0,0) scale(1)}62%{opacity:1;transform:translate(0,0) scale(1)}78%,100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(.3)}}
@keyframes coach-middle{0%,18%{d:path("${POSE.middle.open}")}32%,56%{d:path("${POSE.middle.pinch}")}62%,84%{d:path("${POSE.middle.snapped}")}100%{d:path("${POSE.middle.open}")}}
@keyframes coach-thumb{0%,18%{d:path("${POSE.thumb.open}")}32%,56%{d:path("${POSE.thumb.pinch}")}62%,84%{d:path("${POSE.thumb.snapped}")}100%{d:path("${POSE.thumb.open}")}}
@media (prefers-reduced-motion:reduce){
  .pill{animation:none}
  .finger,.orb,.action{transition:none}
  [data-pose=coach] .middle,[data-pose=coach] .thumb,[data-pose=coach] .spark,.burst .spark{animation:none}
  .progress .ring-progress{animation:none;stroke-dashoffset:0}
}
`;

const SVG = 'http://www.w3.org/2000/svg';
const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string>) => {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
};
(() => {
  if (document.getElementById('prismwink-pill')) return;
  const origin = location.origin;
  let status: Status = { camera: false, phase: 'visible', since: Date.now(), duration: 0, mic: 'live', vision: 'loading', error: '', hand: 'none', room: 0, gestures: true, notice: '' };
  let gestures = true;
  let placement: Placement = { x: -1, y: -1, collapsed: false };
  let host: HTMLDivElement | null = null;
  let frame: HTMLIFrameElement | null = null;
  let lastPhase: Status['phase'] = 'visible';
  const parts = {} as { pill: HTMLDivElement; orb: HTMLButtonElement; title: HTMLSpanElement; detail: HTMLSpanElement; action: HTMLButtonElement; figure: SVGSVGElement };

  const post = (data: Record<string, unknown>) => window.postMessage({ source: 'prismwink-content', ...data }, origin);
  const pushSettings = () => post({ type: 'settings', gestures });

  function render() {
    if (!host) return;
    const view = describe(status, matchMedia('(prefers-reduced-motion: reduce)').matches);
    const { pill, orb, title, detail, action } = parts;
    pill.dataset.tone = view.tone;
    pill.dataset.pose = view.pose;
    pill.classList.toggle('collapsed', placement.collapsed);
    pill.classList.toggle('dim', status.phase === 'hidden');
    title.textContent = view.title;
    detail.textContent = status.notice || view.detail;
    const hidden = status.phase === 'hidden' || status.phase === 'returning';
    action.textContent = hidden ? 'Return' : 'Vanish';
    action.setAttribute('aria-label', hidden ? 'Return to camera' : 'Vanish from camera and mute microphone');
    action.disabled = (!status.camera && status.phase === 'visible') || status.phase === 'vanishing' || status.phase === 'returning';
    orb.setAttribute('aria-expanded', String(!placement.collapsed));
    orb.setAttribute('aria-label', `Prismwink: ${view.title}. ${placement.collapsed ? 'Expand' : 'Collapse'}. Arrow keys move it.`);
    const transitioning = status.phase === 'vanishing' || status.phase === 'returning';
    if (status.phase !== lastPhase) {
      parts.figure.classList.remove('progress', 'burst');
      if (transitioning) {
        void parts.figure.getBoundingClientRect();
        parts.figure.style.setProperty('--duration', `${status.duration || 2400}ms`);
        parts.figure.classList.add('progress', 'burst');
      }
      lastPhase = status.phase;
    }
  }

  function place() {
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const width = rect.width || 60, height = rect.height || 60;
    if (placement.x < 0) {
      host.style.left = '16px';
      host.style.top = `${Math.max(8, innerHeight - height - 96)}px`;
      return;
    }
    host.style.left = `${Math.round(Math.min(Math.max(8, placement.x * innerWidth), innerWidth - width - 8))}px`;
    host.style.top = `${Math.round(Math.min(Math.max(8, placement.y * innerHeight), innerHeight - height - 8))}px`;
  }

  function save() {
    chrome.storage.local.set({ prismwinkPill: placement }).catch(() => {});
  }

  function moveTo(left: number, top: number) {
    placement = { ...placement, x: left / innerWidth, y: top / innerHeight };
    place();
  }

  function buildFigure(): SVGSVGElement {
    const figure = svg('svg', { viewBox: '0 0 44 44', 'aria-hidden': 'true' });
    figure.append(svg('circle', { class: 'ring-track', cx: '22', cy: '22', r: '21' }), svg('circle', { class: 'ring-progress', cx: '22', cy: '22', r: '21' }));
    const hand = svg('g', { class: 'hand' });
    hand.append(
      svg('path', { class: 'palm', d: 'M13.5 26 C12 22 13 18.5 16.5 18 L26 18.5 C29 19.5 30 23.5 28.5 27.5 C26.5 32 21.5 33 17.5 31.5 C15.5 30.5 14.3 28.5 13.5 26 Z' }),
      svg('path', { class: 'finger', d: 'M16 18.5 L12.5 12 L10.5 8' }),
      svg('path', { class: 'finger', d: 'M23 18.5 L23.5 12 L24 8' }),
      svg('path', { class: 'finger', d: 'M26.5 20 L28 16 L29 12.5' }),
      svg('path', { class: 'finger middle', d: POSE.middle.open }),
      svg('path', { class: 'finger thumb', d: POSE.thumb.open })
    );
    for (const [dx, dy] of [[-7, -6], [0, -9], [7, -6], [-8, 2], [8, 2], [0, 7]]) {
      const spark = svg('circle', { class: 'spark', cx: '15.5', cy: '13.5', r: '1.4' });
      spark.style.setProperty('--dx', `${dx}px`);
      spark.style.setProperty('--dy', `${dy}px`);
      hand.append(spark);
    }
    figure.append(hand);
    return figure;
  }

  function enableDragging(pill: HTMLDivElement) {
    let start: { x: number; y: number; left: number; top: number; id: number } | null = null;
    let moved = false;
    pill.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || (event.target as Element).closest('.action') || !host) return;
      const rect = host.getBoundingClientRect();
      start = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, id: event.pointerId };
      moved = false;
    });
    pill.addEventListener('pointermove', (event) => {
      if (!start || event.pointerId !== start.id) return;
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      if (!moved) { moved = true; pill.setPointerCapture(start.id); pill.classList.add('dragging'); }
      moveTo(start.left + dx, start.top + dy);
    });
    const finish = () => {
      if (!start) return;
      if (moved) save();
      pill.classList.remove('dragging');
      start = null;
    };
    pill.addEventListener('pointerup', finish);
    pill.addEventListener('pointercancel', finish);
    // A drag that ends on the orb must not also collapse it.
    pill.addEventListener('click', (event) => { if (moved) { event.stopPropagation(); event.preventDefault(); moved = false; } }, true);
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
      const orb = document.createElement('button');
      orb.className = 'orb';
      orb.type = 'button';
      const figure = buildFigure();
      orb.append(figure);
      const text = document.createElement('span');
      text.className = 'text';
      text.setAttribute('role', 'status');
      text.setAttribute('aria-live', 'polite');
      const title = document.createElement('span');
      title.className = 'title';
      const detail = document.createElement('span');
      detail.className = 'detail';
      text.append(title, detail);
      const action = document.createElement('button');
      action.className = 'action';
      action.type = 'button';
      action.addEventListener('click', () => post({ type: 'toggle' }));
      orb.addEventListener('click', () => { placement = { ...placement, collapsed: !placement.collapsed }; save(); render(); requestAnimationFrame(place); });
      orb.addEventListener('keydown', (event) => {
        const step = event.shiftKey ? 64 : 16;
        const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
        if (!delta || !host) return;
        event.preventDefault();
        const rect = host.getBoundingClientRect();
        moveTo(rect.left + delta[0], rect.top + delta[1]);
        save();
      });
      pill.append(orb, text, action);
      shadow.append(style, pill);
      Object.assign(parts, { pill, orb, title, detail, action, figure });
      enableDragging(pill);
      document.body.append(host);
      host.style.bottom = '';
      render();
      place();
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
  window.addEventListener('resize', place);
  setInterval(() => { if (status.phase === 'hidden') render(); }, 15000);

  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type === 'prismwink-toggle') post({ type: 'toggle' });
    else if (message?.type === 'prismwink-status') respond(status);
    return false;
  });

  chrome.storage.local.get(['prismwink', 'prismwinkPill']).then((stored) => {
    const saved = stored.prismwink as { gestures?: boolean } | undefined;
    if (typeof saved?.gestures === 'boolean') gestures = saved.gestures;
    const pill = stored.prismwinkPill as Partial<Placement> | undefined;
    if (pill && Number.isFinite(pill.x) && Number.isFinite(pill.y)) placement = { x: Number(pill.x), y: Number(pill.y), collapsed: Boolean(pill.collapsed) };
    pushSettings();
    render();
    place();
  }).catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    const next = changes.prismwink?.newValue as { gestures?: boolean } | undefined;
    if (area !== 'local' || typeof next?.gestures !== 'boolean') return;
    gestures = next.gestures;
    pushSettings();
  });

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
  // Meet rebuilds large parts of the page between the lobby and the call.
  setInterval(mount, 3000);
})();
