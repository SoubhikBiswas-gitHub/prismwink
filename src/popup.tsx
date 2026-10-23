import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, type Status } from './format';

type Theme = 'auto' | 'light' | 'dark';
type Link = { kind: 'loading' } | { kind: 'none' } | { kind: 'reload'; tabId: number } | { kind: 'live'; tabId: number; status: Status };

const hasChrome = typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

async function findMeet(): Promise<Link> {
  if (!hasChrome) return { kind: 'none' };
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.startsWith('https://meet.google.com/')) return { kind: 'none' };
  try {
    const status = await chrome.tabs.sendMessage(tab.id, { type: 'prismwink-status' }) as Status | undefined;
    return status ? { kind: 'live', tabId: tab.id, status } : { kind: 'reload', tabId: tab.id };
  } catch {
    return { kind: 'reload', tabId: tab.id };
  }
}

function StatusCard() {
  const [link, setLink] = useState<Link>({ kind: 'loading' });
  useEffect(() => {
    let alive = true;
    const refresh = () => findMeet().then((next) => alive && setLink(next)).catch(() => alive && setLink({ kind: 'none' }));
    refresh();
    const timer = setInterval(refresh, 1000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  if (link.kind === 'loading') return <section className="status" data-tone="idle" aria-busy="true"><span className="dot" /><div className="copy"><strong>Checking this tab…</strong></div></section>;
  if (link.kind === 'none') return <section className="status" data-tone="idle">
    <span className="dot" />
    <div className="copy"><strong>Not in a Meet tab</strong><small>Prismwink works inside Google Meet calls.</small></div>
    <button type="button" className="primary" onClick={() => hasChrome && void chrome.tabs.create({ url: 'https://meet.google.com/' })}>Open Meet</button>
  </section>;
  if (link.kind === 'reload') return <section className="status" data-tone="busy">
    <span className="dot" />
    <div className="copy"><strong>Reload this Meet tab</strong><small>It was open before Prismwink was installed or updated.</small></div>
    <button type="button" className="primary" onClick={() => void chrome.tabs.reload(link.tabId)}>Reload</button>
  </section>;
  const view = describe(link.status, true);
  const hidden = link.status.phase === 'hidden' || link.status.phase === 'returning';
  const busy = link.status.phase === 'vanishing' || link.status.phase === 'returning';
  return <section className="status" data-tone={view.tone} aria-live="polite">
    <span className="dot" />
    <div className="copy"><strong>{view.title}</strong>{view.detail && <small>{view.detail}</small>}</div>
    <button type="button" className="primary" disabled={busy || (!link.status.camera && !hidden)} onClick={() => void chrome.tabs.sendMessage(link.tabId, { type: 'prismwink-toggle' }).then(() => findMeet().then(setLink))}>{hidden ? 'Return' : 'Vanish'}</button>
  </section>;
}

interface Grain { x: number; y: number; color: string; phase: number; vx: number; vy: number; size: number }

function DustDemo() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    const width = 300, height = 150, scale = devicePixelRatio || 1;
    element.width = width * scale;
    element.height = height * scale;
    context.scale(scale, scale);
    const person = (ink: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) => {
      const body = ink.createLinearGradient(0, 70, 0, 150);
      body.addColorStop(0, '#c8b8ff');
      body.addColorStop(1, '#8f7ad8');
      ink.fillStyle = '#2f221d';
      ink.beginPath(); ink.ellipse(150, 58, 22, 26, 0, 0, Math.PI * 2); ink.fill();
      ink.fillRect(128, 58, 44, 26);
      ink.fillStyle = '#d7ad8f';
      ink.fillRect(143, 76, 14, 20);
      ink.fillStyle = body;
      ink.beginPath(); ink.moveTo(98, 150); ink.bezierCurveTo(100, 108, 122, 94, 150, 94); ink.bezierCurveTo(178, 94, 200, 108, 202, 150); ink.closePath(); ink.fill();
      ink.fillStyle = '#e9c3a6';
      ink.beginPath(); ink.ellipse(150, 66, 16, 19, 0, 0, Math.PI * 2); ink.fill();
    };
    const layer = new OffscreenCanvas(width * scale, height * scale);
    const layerInk = layer.getContext('2d')!;
    layerInk.scale(scale, scale);
    const shape = new OffscreenCanvas(width, height);
    const ink = shape.getContext('2d')!;
    person(ink);
    const pixels = ink.getImageData(0, 0, width, height).data;
    const grains: Grain[] = [];
    let seed = 7;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (pixels[i + 3] < 128) continue;
      grains.push({ x, y, color: `rgb(${pixels[i]},${pixels[i + 1]},${pixels[i + 2]})`, phase: 0.05 + ((width - x) / width) * 0.45 + (y / height) * 0.2 + random() * 0.2, vx: 40 + random() * 90, vy: -20 - random() * 45, size: 0.9 + random() * 1.3 });
    }
    const lastPhase = grains.reduce((max, grain) => Math.max(max, grain.phase), 0);
    const room = (alpha: number) => {
      context.globalAlpha = 1;
      const wall = context.createLinearGradient(0, 0, 0, height);
      wall.addColorStop(0, '#1b2440'); wall.addColorStop(1, '#10162a');
      context.fillStyle = wall; context.fillRect(0, 0, width, height);
      const glow = context.createRadialGradient(256, 54, 2, 256, 54, 60);
      glow.addColorStop(0, 'rgba(244,204,129,.45)'); glow.addColorStop(1, 'rgba(244,204,129,0)');
      context.fillStyle = glow; context.fillRect(190, 0, 110, 130);
      context.fillStyle = '#f4dca8';
      context.beginPath(); context.moveTo(246, 40); context.lineTo(266, 40); context.lineTo(272, 58); context.lineTo(240, 58); context.closePath(); context.fill();
      context.fillStyle = '#b8954f'; context.fillRect(255, 58, 2, 40); context.fillRect(247, 97, 18, 3);
      context.fillStyle = '#3a4466'; context.fillRect(26, 28, 50, 36);
      context.fillStyle = '#4f6a8f'; context.fillRect(30, 32, 42, 28);
      context.fillStyle = '#7f9cc0'; context.beginPath(); context.moveTo(30, 60); context.lineTo(44, 44); context.lineTo(54, 54); context.lineTo(62, 46); context.lineTo(72, 60); context.closePath(); context.fill();
      context.fillStyle = '#1a2036'; context.fillRect(0, 128, width, 22);
      context.globalAlpha = alpha;
    };
    const LOOP = 6400;
    let frame = 0;
    const draw = (time: number) => {
      const t = (time % LOOP) / LOOP;
      // 0–0.15 solid, 0.15–0.5 dissolve, 0.5–0.62 gone, 0.62–0.92 return, then solid.
      const q = t < 0.15 ? 0 : t < 0.5 ? (t - 0.15) / 0.35 : t < 0.62 ? 1 : t < 0.92 ? 1 - (t - 0.62) / 0.3 : 0;
      room(1);
      // The undissolved figure stays a smooth vector; only grains that have left are cut out.
      layerInk.globalCompositeOperation = 'copy';
      layerInk.fillStyle = 'rgba(0,0,0,0)';
      layerInk.fillRect(0, 0, width, height);
      layerInk.globalCompositeOperation = 'source-over';
      person(layerInk);
      layerInk.globalCompositeOperation = 'destination-out';
      layerInk.fillStyle = '#000';
      for (const grain of grains) if (q * 1.1 > grain.phase) layerInk.fillRect(grain.x - 0.6, grain.y - 0.6, 2.2, 2.2);
      layerInk.globalCompositeOperation = 'source-over';
      if (q * 1.1 <= lastPhase) context.drawImage(layer, 0, 0, width, height);
      for (const grain of grains) {
        const age = (q * 1.1 - grain.phase) / 0.32;
        if (age <= 0 || age >= 1) continue;
        const travel = 1 - (1 - age) * (1 - age);
        context.globalAlpha = Math.pow(1 - age, 1.3);
        context.fillStyle = age < 0.4 ? grain.color : '#6a5f5a';
        context.fillRect(grain.x + grain.vx * travel, grain.y + grain.vy * travel + Math.sin(age * 6 + grain.phase * 20) * 4 * age, grain.size, grain.size);
      }
      context.globalAlpha = 1;
      if (!reducedMotion()) frame = requestAnimationFrame(draw);
    };
    if (reducedMotion()) draw(LOOP * 0.32);
    else frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  return <canvas ref={canvas} className="demo" role="img" aria-label="A person dissolves into dust, leaving the room behind, then reassembles." />;
}

function ThemeControl({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  return <div className="segmented" role="radiogroup" aria-label="Theme">
    {(['auto', 'light', 'dark'] as const).map((value) => (
      <button key={value} type="button" role="radio" aria-checked={theme === value} onClick={() => onChange(value)}>{value[0].toUpperCase() + value.slice(1)}</button>
    ))}
  </div>;
}

function Popup() {
  const [gestures, setGestures] = useState(true);
  const [shortcut, setShortcut] = useState('Alt+Shift+V');
  const [theme, setTheme] = useState<Theme>('auto');

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => {
    if (!hasChrome) return;
    chrome.storage.local.get(['prismwink', 'prismwinkTheme']).then((stored) => {
      const saved = stored.prismwink as { gestures?: boolean } | undefined;
      if (typeof saved?.gestures === 'boolean') setGestures(saved.gestures);
      if (['auto', 'light', 'dark'].includes(stored.prismwinkTheme as string)) setTheme(stored.prismwinkTheme as Theme);
    }).catch(() => {});
    chrome.commands?.getAll().then((commands) => {
      setShortcut(commands.find((command) => command.name === 'toggle-vanish')?.shortcut || 'Not set');
    }).catch(() => {});
  }, []);

  const changeGestures = (value: boolean) => {
    setGestures(value);
    if (hasChrome) void chrome.storage.local.set({ prismwink: { gestures: value } });
  };
  const changeTheme = (value: Theme) => {
    setTheme(value);
    if (hasChrome) void chrome.storage.local.set({ prismwinkTheme: value });
  };

  return <>
    <header><img src="assets/icon.svg" width={26} height={26} alt="" /><span>Prismwink</span></header>
    <StatusCard />
    <figure className="hero">
      <DustDemo />
    </figure>
    <h1>Snap to vanish.<br />Snap to come back.</h1>
    <ol className="steps">
      <li><b>Raise a hand</b> in your Meet call, camera on.</li>
      <li><b>Pinch</b> thumb and middle finger, then <b>snap</b>. You turn to dust; your mic mutes.</li>
      <li><b>Snap again</b> to return. Your mic turns back on only if Prismwink muted it.</li>
    </ol>
    <section className="settings">
      <label className="row">
        <span><strong>Hand gesture</strong><small>Off: use the button or shortcut</small></span>
        <input type="checkbox" role="switch" checked={gestures} onChange={(event) => changeGestures(event.currentTarget.checked)} />
      </label>
      <div className="row">
        <span><strong>Shortcut</strong><small><kbd>{shortcut}</kbd></small></span>
        <button type="button" onClick={() => hasChrome && void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}>Change</button>
      </div>
      <div className="row">
        <span><strong>Theme</strong></span>
        <ThemeControl theme={theme} onChange={changeTheme} />
      </div>
    </section>
    <footer>Video and audio are processed on this device only. Tip: step out of view once so Prismwink learns your whole room.</footer>
  </>;
}

const app = document.getElementById('app');
if (!app) throw new Error('The popup mount is missing.');
createRoot(app).render(<Popup />);
