import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

const hasChrome = typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);

function Popup() {
  const [gestures, setGestures] = useState(true);
  const [shortcut, setShortcut] = useState('Alt+Shift+V');

  useEffect(() => {
    if (!hasChrome) return;
    chrome.storage.local.get('prismwink').then((stored) => {
      const saved = stored.prismwink as { gestures?: boolean } | undefined;
      if (typeof saved?.gestures === 'boolean') setGestures(saved.gestures);
    }).catch(() => {});
    chrome.commands?.getAll().then((commands) => {
      const key = commands.find((command) => command.name === 'toggle-vanish')?.shortcut;
      setShortcut(key || 'Not set');
    }).catch(() => {});
  }, []);

  const changeGestures = (value: boolean) => {
    setGestures(value);
    if (hasChrome) void chrome.storage.local.set({ prismwink: { gestures: value } });
  };

  return <>
    <header><img src="assets/icon.svg" width={28} height={28} alt="" /><span>Prismwink</span></header>
    <main>
      <h1>Snap to vanish.<br />Snap to come back.</h1>
      <ol>
        <li>Join a Google Meet call with your camera on.</li>
        <li>Raise a hand, press your thumb and middle finger together, then snap. You turn to dust and your microphone mutes.</li>
        <li>Snap again to come back. Your microphone turns back on only if Prismwink muted it.</li>
      </ol>
      <p className="tip">For the cleanest vanish, step out of view for a moment once so Prismwink can see your whole room.</p>
      <label className="switch">
        <span><strong>Hand gesture</strong><small>Off: use the button or shortcut only</small></span>
        <input type="checkbox" role="switch" checked={gestures} onChange={(event) => changeGestures(event.currentTarget.checked)} />
      </label>
      <div className="shortcut">
        <span>Shortcut <kbd>{shortcut}</kbd></span>
        <button type="button" onClick={() => hasChrome && void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}>Change</button>
      </div>
    </main>
    <footer>Video and audio are processed on this device only.</footer>
  </>;
}

const app = document.getElementById('app');
if (!app) throw new Error('The popup mount is missing.');
createRoot(app).render(<Popup />);
