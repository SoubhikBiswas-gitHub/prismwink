import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { chromium } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');
const W = 640, H = 360, FPS = 15, GRID = [16, 9] as const;

async function frame(source: ReturnType<typeof sharp>): Promise<{ yuv: Buffer; grid: number[] }> {
  const rgb = await source.resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const pixels = W * H, yuv = Buffer.alloc(pixels * 3 / 2);
  const clamp = (x: number) => Math.min(255, Math.max(0, Math.round(x)));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const j = (y * W + x) * 3, r = rgb[j]!, g = rgb[j + 1]!, b = rgb[j + 2]!;
    yuv[y * W + x] = clamp(16 + 0.257 * r + 0.504 * g + 0.098 * b);
    if (x % 2 === 0 && y % 2 === 0) {
      const c = (y / 2) * (W / 2) + x / 2;
      yuv[pixels + c] = clamp(128 - 0.148 * r - 0.291 * g + 0.439 * b);
      yuv[pixels + pixels / 4 + c] = clamp(128 + 0.439 * r - 0.368 * g - 0.071 * b);
    }
  }
  const grid: number[] = [];
  for (let gy = 0; gy < GRID[1]; gy++) for (let gx = 0; gx < GRID[0]; gx++) {
    let sum = 0, n = 0;
    for (let y = gy * H / GRID[1]; y < (gy + 1) * H / GRID[1]; y += 4) for (let x = gx * W / GRID[0]; x < (gx + 1) * W / GRID[0]; x += 4) {
      const j = (y * W + x) * 3;
      sum += rgb[j]! + rgb[j + 1]! + rgb[j + 2]!;
      n += 3;
    }
    grid.push(sum / n);
  }
  return { yuv, grid };
}

const page = `<!doctype html><body>
<button id="mic" aria-label="Turn off microphone (⌘ + d)" data-is-muted="false">Mic</button>
<video id="self" autoplay muted playsinline width="640" height="360"></video>
<script>
  window.statuses = [];
  addEventListener('message', (e) => { if (e.source === window && e.data?.source === 'prismwink-hook' && e.data.type === 'status') statuses.push(e.data); });
  window.start = async () => { const s = await navigator.mediaDevices.getUserMedia({ video: { width: ${W}, height: ${H} }, audio: true }); document.getElementById('self').srcObject = s; };
  const read = () => { const v = document.getElementById('self'); const c = document.createElement('canvas'); c.width = ${W}; c.height = ${H}; const g = c.getContext('2d'); g.drawImage(v, 0, 0, ${W}, ${H}); return g.getImageData(0, 0, ${W}, ${H}).data; };
  window.person = () => { const d = read(); let n = 0, t = 0; for (let y = 180; y < 340; y += 2) for (let x = 200; x < 440; x += 2) { const i = (y * ${W} + x) * 4; t++; if (d[i] > 140 && d[i + 2] > d[i] + 8 && d[i + 2] > 170) n++; } return n / t; };
  window.grid = () => { const d = read(); const out = []; for (let gy = 0; gy < ${GRID[1]}; gy++) for (let gx = 0; gx < ${GRID[0]}; gx++) { let s = 0, n = 0; for (let y = gy * ${H / GRID[1]}; y < (gy + 1) * ${H / GRID[1]}; y += 4) for (let x = gx * ${W / GRID[0]}; x < (gx + 1) * ${W / GRID[0]}; x += 4) { const i = (y * ${W} + x) * 4; s += d[i] + d[i + 1] + d[i + 2]; n += 3; } out.push(s / n); } return out; };
</script></body>`;

test('while hidden, walking away reveals the real empty room, and coming back never leaks you', { skip: process.env.PRISMWINK_BROWSER !== '1' && 'set PRISMWINK_BROWSER=1 after npm run build' }, async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'prismwink-room-'));
  const portrait = await frame(sharp(path.join(root, 'tests/fixtures/camera-portrait.png')));
  const empty = await frame(sharp(path.join(root, 'tests/fixtures/camera-portrait.png')).extract({ left: 0, top: 0, width: 560, height: 315 }));
  const parts: Buffer[] = [Buffer.from(`YUV4MPEG2 W${W} H${H} F${FPS}:1 Ip A1:1 C420jpeg\n`)];
  for (let n = 0; n < FPS * 12; n++) parts.push(Buffer.from('FRAME\n'), portrait.yuv);
  for (let n = 0; n < FPS * 6; n++) parts.push(Buffer.from('FRAME\n'), empty.yuv);
  const fixture = path.join(temporary, 'walk-away.y4m');
  await writeFile(fixture, Buffer.concat(parts));
  const context = await chromium.launchPersistentContext(path.join(temporary, 'profile'), {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${root}/dist`, `--load-extension=${root}/dist`, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${fixture}`]
  });
  const distance = (a: number[], b: number[]) => a.reduce((sum, value, i) => sum + Math.abs(value - b[i]!), 0) / a.length;
  try {
    await context.route('https://meet.google.com/**', (route) => route.fulfill({ contentType: 'text/html', body: page }));
    const tab = await context.newPage();
    await tab.goto('https://meet.google.com/abc-defg-hij');
    type Win = Window & { start: () => Promise<void>; statuses: { camera: boolean; vision: string; phase: string; results: number }[]; person: () => number; grid: () => number[] };
    const started = Date.now();
    await tab.evaluate(() => (window as unknown as Win).start());
    await tab.waitForFunction(() => { const s = (window as unknown as Win).statuses.at(-1); return s?.camera && s.vision === 'ready' && s.results > 3; }, null, { timeout: 60000 });
    assert.ok(await tab.evaluate(() => (window as unknown as Win).person()) > 0.3, 'The person is on camera before vanishing.');
    await tab.locator('#prismwink-pill .action').click();
    await tab.waitForFunction(() => (window as unknown as Win).statuses.at(-1)?.phase === 'hidden', null, { timeout: 8000 });
    assert.ok(Date.now() - started < 11000, 'Vanished while the person was still in frame (fixture timing).');
    await tab.locator('#self').screenshot({ path: path.join(root, 'test-results/hidden-before-walk-away.png') });
    const before = distance(await tab.evaluate(() => (window as unknown as Win).grid()), empty.grid);
    let worst = 0, converged = Infinity;
    const until = Date.now() + 14000;
    while (Date.now() < until && converged >= 12) {
      worst = Math.max(worst, await tab.evaluate(() => (window as unknown as Win).person()));
      converged = Math.min(converged, distance(await tab.evaluate(() => (window as unknown as Win).grid()), empty.grid));
      await tab.waitForTimeout(150);
    }
    assert.ok(converged < 12 && before > converged * 2, `Once the room is empty, hidden output becomes the real room (difference ${before.toFixed(1)} → ${converged.toFixed(1)}).`);
    await tab.locator('#self').screenshot({ path: path.join(root, 'test-results/hidden-after-walk-away.png') });
    const back = Date.now() + 9000;
    while (Date.now() < back) {
      worst = Math.max(worst, await tab.evaluate(() => (window as unknown as Win).person()));
      await tab.waitForTimeout(200);
    }
    assert.ok(worst < 0.03, `Walking back in while hidden still never shows the person (worst ${worst}).`);
    assert.ok(distance(await tab.evaluate(() => (window as unknown as Win).grid()), portrait.grid) > 5, 'Hidden output is not the live camera.');
  } finally {
    await context.close();
    await rm(temporary, { recursive: true, force: true });
  }
});
