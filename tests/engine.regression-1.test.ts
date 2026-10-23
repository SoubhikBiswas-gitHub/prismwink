// Regression: ISSUE-001 — without WebGL the segmenter failure took down hand tracking and the whole engine
// Found by /qa on 2026-10-23
// Report: .gstack/qa-reports/qa-report-meet-google-com-2026-10-23.md
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');
const page = `<!doctype html><body>
<button id="mic" aria-label="Turn off microphone (⌘ + d)" data-is-muted="false">Mic</button>
<video id="self" autoplay muted playsinline></video>
<script>
  window.statuses = [];
  addEventListener('message', (e) => { if (e.source === window && e.data?.source === 'prismwink-hook' && e.data.type === 'status') statuses.push(e.data); });
  const mic = document.getElementById('mic');
  mic.addEventListener('click', () => {
    const on = mic.getAttribute('data-is-muted') === 'true';
    mic.setAttribute('data-is-muted', String(!on));
    window.stream?.getAudioTracks().forEach((t) => { t.enabled = on; });
  });
  window.start = async () => { window.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360 }, audio: true }); document.getElementById('self').srcObject = window.stream; };
  window.brightness = () => { const v = document.getElementById('self'); const c = document.createElement('canvas'); c.width = 32; c.height = 18; const g = c.getContext('2d'); g.drawImage(v, 0, 0, 32, 18); const d = g.getImageData(0, 0, 32, 18).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4) / 3; };
</script></body>`;

test('without WebGL the snap gesture still loads, and Vanish still hides you and mutes', { skip: process.env.PRISMWINK_BROWSER !== '1' && 'set PRISMWINK_BROWSER=1 after npm run build' }, async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'prismwink-nogl-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${root}/dist`, `--load-extension=${root}/dist`, '--disable-gpu', '--disable-software-rasterizer', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
  });
  try {
    await context.route('https://meet.google.com/**', (route) => route.fulfill({ contentType: 'text/html', body: page }));
    const tab = await context.newPage();
    await tab.goto('https://meet.google.com/abc-defg-hij');
    assert.equal(await tab.evaluate(() => Boolean(new OffscreenCanvas(1, 1).getContext('webgl2') || new OffscreenCanvas(1, 1).getContext('webgl'))), false, 'This test needs a browser without WebGL.');
    await tab.evaluate(() => (window as unknown as { start: () => Promise<void> }).start());
    type Status = { vision: string; camera: boolean; phase: string; error: string };
    const latest = () => tab.evaluate(() => (window as unknown as { statuses: Status[] }).statuses.at(-1));
    await tab.waitForFunction(() => { const s = (window as unknown as { statuses: Status[] }).statuses.at(-1); return s?.camera && s.vision !== 'loading'; }, null, { timeout: 60000 });
    const ready = await latest();
    assert.equal(ready?.vision, 'ready', `Hand tracking must load without WebGL (got ${ready?.vision}: ${ready?.error.slice(0, 120)}).`);
    await tab.locator('#prismwink-pill .action').click();
    await tab.waitForFunction(() => (window as unknown as { statuses: Status[] }).statuses.at(-1)?.phase === 'hidden', null, { timeout: 8000 });
    assert.equal(await tab.locator('#mic').getAttribute('data-is-muted'), 'true');
    await tab.waitForTimeout(500);
    assert.ok(await tab.evaluate(() => (window as unknown as { brightness: () => number }).brightness()) < 30, 'The hidden output is the neutral dark frame, not the raw camera.');
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
