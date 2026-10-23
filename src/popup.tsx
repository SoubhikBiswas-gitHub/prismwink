import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, type Status } from './format';
import { startDemo } from './demo';

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

function DustDemo() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => canvas.current ? startDemo(canvas.current, reducedMotion()) : undefined, []);
  return <canvas ref={canvas} className="demo" role="img" aria-label="A person snaps her fingers, crumbles into dust that leaves her room behind with a Hidden, mic muted label, then reassembles." />;
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
