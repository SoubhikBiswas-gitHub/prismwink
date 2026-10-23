import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';

interface Check { check: string; passed: boolean; detail: string }
interface Status { camera: boolean; phase: string; vision: string; error: string; hand: string; room: number; gestures: boolean; claps: boolean; notice: string; processMs: number; visionMs: number; results: number }
interface Harness {
  hookFirst: boolean;
  status: Status | null;
  stream: MediaStream | null;
  start: () => Promise<void>;
  loopback: () => Promise<void>;
  peak: (ms: number) => Promise<number>;
  person: () => number;
  decoded: () => Promise<number>;
  snapshot: () => string;
  extraPerson: () => Promise<number>;
  micMuted: () => string | null;
  audioEnabled: () => boolean[];
  stopAll: () => void;
}
type HarnessWindow = Window & { harness: Harness };

const root = path.resolve(import.meta.dirname, '..');
const evidence = path.join(root, 'test-results');
const WIDTH = 1280, HEIGHT = 720;

const harnessHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Meet test harness</title>
<style>body{font:16px sans-serif;background:#202124;color:#fff;padding:24px}video{width:320px;height:180px;background:#000}button{min-height:44px;padding:10px;margin:4px}</style></head><body>
<h1>Local Meet test harness</h1>
<button id="start">Start camera</button>
<button id="mic" aria-label="Turn off microphone (⌘ + d)" data-is-muted="false">Mic</button>
<button id="cam" aria-label="Turn off camera (⌘ + e)" data-is-muted="false">Cam</button>
<video id="self" autoplay muted playsinline></video><video id="remote" autoplay muted playsinline></video><video id="extra" autoplay muted playsinline></video>
<script>
(() => {
  let micOn = true, sender, receiver, analyser, samples;
  const remote = document.getElementById('remote'), mic = document.getElementById('mic');
  const remoteStream = new MediaStream();
  const lavender = (video) => {
    if (video.readyState < 2) return -1;
    const c = document.createElement('canvas'); c.width = 160; c.height = 90;
    const g = c.getContext('2d'); g.drawImage(video, 0, 0, 160, 90);
    const d = g.getImageData(48, 50, 64, 38).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 140 && d[i + 2] > d[i] + 8 && d[i + 2] > 170) n++;
    return n / (d.length / 4);
  };
  const harness = window.harness = {
    hookFirst: Boolean(window.__prismwinkHook), status: null, stream: null,
    async start() {
      harness.stream = await navigator.mediaDevices.getUserMedia({ video: { width: ${WIDTH}, height: ${HEIGHT} }, audio: true });
      document.getElementById('self').srcObject = harness.stream;
    },
    async loopback() {
      sender = new RTCPeerConnection(); receiver = new RTCPeerConnection();
      sender.onicecandidate = (e) => e.candidate && receiver.addIceCandidate(e.candidate);
      receiver.onicecandidate = (e) => e.candidate && sender.addIceCandidate(e.candidate);
      receiver.ontrack = (e) => {
        remoteStream.addTrack(e.track); remote.srcObject = remoteStream; remote.play().catch(() => {});
        if (e.track.kind === 'audio') {
          const audio = new AudioContext(); analyser = audio.createAnalyser(); analyser.fftSize = 2048; samples = new Float32Array(2048);
          audio.createMediaStreamSource(new MediaStream([e.track])).connect(analyser); audio.resume();
        }
      };
      harness.stream.getTracks().forEach((t) => sender.addTrack(t, harness.stream));
      await sender.setLocalDescription(await sender.createOffer());
      await receiver.setRemoteDescription(sender.localDescription);
      await receiver.setLocalDescription(await receiver.createAnswer());
      await sender.setRemoteDescription(receiver.localDescription);
    },
    async peak(ms) {
      let best = 0; const end = performance.now() + ms;
      while (performance.now() < end) {
        if (analyser) { analyser.getFloatTimeDomainData(samples); best = Math.max(best, Math.sqrt(samples.reduce((s, v) => s + v * v, 0) / samples.length)); }
        await new Promise((r) => setTimeout(r, 30));
      }
      return best;
    },
    person: () => lavender(remote),
    async decoded() {
      const stats = await receiver.getStats(); let frames = 0;
      stats.forEach((s) => { if (s.type === 'inbound-rtp' && s.kind === 'video') frames = s.framesDecoded; });
      return frames;
    },
    snapshot() {
      const self = document.getElementById('self');
      const c = document.createElement('canvas'); c.width = self.videoWidth; c.height = self.videoHeight;
      c.getContext('2d').drawImage(self, 0, 0); return c.toDataURL('image/png');
    },
    async extraPerson() {
      const extra = await navigator.mediaDevices.getUserMedia({ video: { width: ${WIDTH}, height: ${HEIGHT} } });
      const video = document.getElementById('extra'); video.srcObject = extra; await video.play();
      await new Promise((r) => setTimeout(r, 1200));
      const value = lavender(video); extra.getTracks().forEach((t) => t.stop()); return value;
    },
    micMuted: () => mic.getAttribute('data-is-muted'),
    audioEnabled: () => harness.stream.getAudioTracks().map((t) => t.enabled),
    stopAll() { harness.stream?.getTracks().forEach((t) => t.stop()); sender?.close(); receiver?.close(); }
  };
  mic.addEventListener('click', () => {
    micOn = !micOn;
    harness.stream?.getAudioTracks().forEach((t) => { t.enabled = micOn; });
    mic.setAttribute('data-is-muted', String(!micOn));
    mic.setAttribute('aria-label', micOn ? 'Turn off microphone (⌘ + d)' : 'Turn on microphone (⌘ + d)');
  });
  document.getElementById('start').addEventListener('click', () => harness.start());
  window.addEventListener('message', (e) => { if (e.source === window && e.data?.source === 'prismwink-hook' && e.data.type === 'status') harness.status = e.data; });
})();
</script></body></html>`;

async function cameraFixture(file: string) {
  const rgb = await sharp(path.join(root, 'tests/fixtures/camera-portrait.png')).resize(WIDTH, HEIGHT, { fit: 'cover' }).removeAlpha().raw().toBuffer();
  const pixels = WIDTH * HEIGHT, frame = Buffer.alloc(pixels * 3 / 2);
  const clamp = (x: number) => Math.min(255, Math.max(0, Math.round(x)));
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    const j = (y * WIDTH + x) * 3, r = rgb[j]!, g = rgb[j + 1]!, b = rgb[j + 2]!;
    frame[y * WIDTH + x] = clamp(16 + 0.257 * r + 0.504 * g + 0.098 * b);
    if (x % 2 === 0 && y % 2 === 0) {
      const c = (y / 2) * (WIDTH / 2) + x / 2;
      frame[pixels + c] = clamp(128 - 0.148 * r - 0.291 * g + 0.439 * b);
      frame[pixels + pixels / 4 + c] = clamp(128 + 0.439 * r - 0.368 * g - 0.071 * b);
    }
  }
  const parts: Buffer[] = [Buffer.from(`YUV4MPEG2 W${WIDTH} H${HEIGHT} F30:1 Ip A1:1 C420jpeg\n`)];
  for (let n = 0; n < 10; n++) parts.push(Buffer.from('FRAME\n'), frame);
  await writeFile(file, Buffer.concat(parts));
}

const h = (page: Page) => page.evaluate.bind(page);
const until = (page: Page, test: () => unknown, timeout = 15000) => page.waitForFunction(test, null, { timeout, polling: 50 });
const status = (page: Page) => page.evaluate(() => (window as unknown as HarnessWindow).harness.status!);

async function savePng(page: Page, name: string) {
  const data = await page.evaluate(() => (window as unknown as HarnessWindow).harness.snapshot());
  await writeFile(path.join(evidence, name), Buffer.from(data.split(',')[1]!, 'base64'));
}

async function toggleFromShortcut(worker: Worker) {
  await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'https://meet.google.com/*' });
    await chrome.tabs.sendMessage(tab!.id!, { type: 'prismwink-toggle' });
  });
}

const checks: Check[] = [];
const pass = (check: string, detail: string) => { checks.push({ check, passed: true, detail }); console.log(`PASS ${check}: ${detail}`); };
await mkdir(evidence, { recursive: true });
const temporary = await mkdtemp(path.join(tmpdir(), 'prismwink-'));
let context: BrowserContext | undefined;
try {
  const fixture = path.join(temporary, 'camera.y4m');
  await cameraFixture(fixture);
  context = await chromium.launchPersistentContext(path.join(temporary, 'profile'), {
    channel: 'chromium', headless: true, viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${path.join(root, 'dist')}`, `--load-extension=${path.join(root, 'dist')}`, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${fixture}`, '--autoplay-policy=no-user-gesture-required']
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 20000 });
  const id = new URL(worker.url()).hostname;
  pass('Extension loads', 'Manifest V3 extension and its service worker start in a fresh profile.');

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.getByRole('heading', { name: /Snap to vanish/ }).waitFor();
  await popup.evaluate(() => document.fonts.ready);
  await popup.locator('body').screenshot({ path: path.join(evidence, 'popup-current.png') });
  const gestureSwitch = popup.getByRole('switch', { name: /^Snap/ });
  assert.equal(await gestureSwitch.isChecked(), true);
  await gestureSwitch.click();
  assert.deepEqual(await popup.evaluate(() => chrome.storage.local.get('prismwink')), { prismwink: { gestures: false, claps: true } });
  const clapSwitch = popup.getByRole('switch', { name: /Double clap/ });
  assert.equal(await clapSwitch.isChecked(), true);
  pass('Popup', 'Explains the gesture, shows the shortcut, and saves the hand gesture switch.');

  await context.route('https://meet.google.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: harnessHtml }));
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('https://meet.google.com/abc-defg-hij');
  assert.equal(await h(page)(() => (window as unknown as HarnessWindow).harness.hookFirst), true, 'The camera hook must load before page scripts.');
  const pill = page.locator('#prismwink-pill');
  await pill.getByText('Turn on your camera').waitFor();
  await until(page, () => (window as unknown as HarnessWindow).harness.status?.gestures === false);
  await gestureSwitch.click();
  await until(page, () => (window as unknown as HarnessWindow).harness.status?.gestures === true);
  await clapSwitch.click();
  await until(page, () => (window as unknown as HarnessWindow).harness.status?.claps === false);
  await clapSwitch.click();
  await until(page, () => (window as unknown as HarnessWindow).harness.status?.claps === true);
  pass('Settings reach the meeting', 'Turning the snap and double clap switches off and on in the popup updates an open Meet tab live.');

  await page.getByRole('button', { name: 'Start camera' }).click();
  await until(page, () => { const s = (window as unknown as HarnessWindow).harness.status; return s?.camera && s.vision === 'ready' && s.results > 3; }, 90000);
  const settings = await page.evaluate(() => {
    const track = (window as unknown as HarnessWindow).harness.stream!.getVideoTracks()[0]!;
    return { ...track.getSettings(), label: track.label };
  });
  assert.equal(settings.width, WIDTH);
  assert.ok(settings.deviceId && settings.label, 'The processed track reports the real camera identity.');
  const before = (await status(page)).results;
  await page.waitForTimeout(3000);
  const after = await status(page);
  const rate = (after.results - before) / 3;
  pass('Local vision runs', `Segmentation and hand tracking run in the extension worker (${after.visionMs} ms per frame, ${rate.toFixed(1)} results/s with no hand in view); the output track keeps the camera's ${settings.width}×${settings.height} size, device and label.`);

  await page.evaluate(() => (window as unknown as HarnessWindow).harness.loopback());
  await until(page, () => (window as unknown as HarnessWindow).harness.person() > 0.3, 20000);
  const loud = await page.evaluate(() => (window as unknown as HarnessWindow).harness.peak(2500));
  assert.ok(loud > 0.005, `Receiver should hear the microphone (peak ${loud}).`);
  await until(page, () => ((window as unknown as HarnessWindow).harness.status?.room ?? 0) > 0.3, 15000);
  pass('Receiver sees and hears you', `A WebRTC receiver decodes the camera with the person visible and hears audio (peak RMS ${loud.toFixed(3)}). Room learned automatically: ${Math.round((await status(page)).room * 100)}% with no setup.`);

  await pill.getByRole('button', { name: /Vanish/ }).click();
  await until(page, () => (window as unknown as HarnessWindow).harness.status?.phase === 'vanishing', 2000);
  assert.equal(await page.evaluate(() => (window as unknown as HarnessWindow).harness.micMuted()), 'true');
  assert.deepEqual(await page.evaluate(() => (window as unknown as HarnessWindow).harness.audioEnabled()), [false]);
  await page.waitForTimeout(900);
  await savePng(page, 'vanish-midway.png');
  await until(page, () => (window as unknown as HarnessWindow).harness.status?.phase === 'hidden', 6000);
  await page.waitForTimeout(800);
  const hiddenPerson = await page.evaluate(() => (window as unknown as HarnessWindow).harness.person());
  const quiet = await page.evaluate(() => (window as unknown as HarnessWindow).harness.peak(1500));
  const framesA = await page.evaluate(() => (window as unknown as HarnessWindow).harness.decoded());
  await page.waitForTimeout(1500);
  const framesB = await page.evaluate(() => (window as unknown as HarnessWindow).harness.decoded());
  await savePng(page, 'hidden.png');
  console.log(`NOTE Transition render cost ${(await status(page)).processMs} ms per 1280×720 frame.`);
  assert.ok(hiddenPerson < 0.03, `Person must be gone from the receiver (lavender ${hiddenPerson}).`);
  assert.ok(quiet < 0.001, `Receiver must be silent (peak ${quiet}).`);
  assert.ok(framesB - framesA > 20, 'Video keeps flowing while hidden.');
  pass('Vanish hides and mutes', `Meet's mic button is clicked to muted at once and the track is gated; the receiver sees the room without the person (${(hiddenPerson * 100).toFixed(1)}% sweater pixels), hears silence (peak ${quiet.toFixed(4)}), and keeps getting ${((framesB - framesA) / 1.5).toFixed(0)} fps.`);

  await pill.getByRole('button', { name: /Return/ }).click();
  await until(page, () => (window as unknown as HarnessWindow).harness.status?.phase === 'returning', 2000);
  await page.waitForTimeout(700);
  await savePng(page, 'return-midway.png');
  await until(page, () => (window as unknown as HarnessWindow).harness.status?.phase === 'visible', 6000);
  await until(page, () => (window as unknown as HarnessWindow).harness.person() > 0.3, 5000);
  assert.equal(await page.evaluate(() => (window as unknown as HarnessWindow).harness.micMuted()), 'false');
  await until(page, () => (window as unknown as HarnessWindow).harness.audioEnabled().every(Boolean), 3000);
  const back = await page.evaluate(() => (window as unknown as HarnessWindow).harness.peak(2500));
  assert.ok(back > 0.005, `Receiver should hear the microphone again (peak ${back}).`);
  pass('Return restores camera and mic', `The person reassembles, and the mic that Prismwink muted is turned back on (peak RMS ${back.toFixed(3)}).`);

  await page.getByRole('button', { name: /Turn off microphone/ }).click();
  await toggleFromShortcut(worker);
  await until(page, () => (window as unknown as HarnessWindow).harness.status?.phase === 'hidden', 6000);
  await toggleFromShortcut(worker);
  await until(page, () => (window as unknown as HarnessWindow).harness.status?.phase === 'visible', 6000);
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => (window as unknown as HarnessWindow).harness.micMuted()), 'true');
  assert.deepEqual(await page.evaluate(() => (window as unknown as HarnessWindow).harness.audioEnabled()), [false]);
  pass('Keyboard shortcut, and an already-muted mic stays muted', 'The shortcut message path vanishes and returns; a mic you muted yourself is never turned on.');

  await page.getByRole('button', { name: /Turn on microphone/ }).click();
  await pill.getByRole('button', { name: /Vanish/ }).click();
  await until(page, () => (window as unknown as HarnessWindow).harness.status?.phase === 'hidden', 6000);
  await page.getByRole('button', { name: /Turn on microphone/ }).click();
  await until(page, () => (window as unknown as HarnessWindow).harness.audioEnabled().every(Boolean), 3000);
  await pill.getByRole('button', { name: /Return/ }).click();
  await until(page, () => (window as unknown as HarnessWindow).harness.status?.phase === 'visible', 6000);
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => (window as unknown as HarnessWindow).harness.micMuted()), 'false');
  assert.deepEqual(await page.evaluate(() => (window as unknown as HarnessWindow).harness.audioEnabled()), [true]);
  pass('Your mic choice while hidden wins', 'Unmuting in Meet while hidden is honoured immediately, and returning does not toggle it again.');

  await pill.getByRole('button', { name: /Vanish/ }).click();
  await until(page, () => (window as unknown as HarnessWindow).harness.status?.phase === 'hidden', 6000);
  const extra = await page.evaluate(() => (window as unknown as HarnessWindow).harness.extraPerson());
  assert.ok(extra >= 0 && extra < 0.03, `A camera opened while hidden must stay hidden (lavender ${extra}).`);
  pass('A camera opened while hidden stays hidden', `A second camera request while hidden shows the room, not you (${(extra * 100).toFixed(1)}% sweater pixels).`);

  const other = await context.newPage();
  await other.goto('about:blank');
  await other.bringToFront();
  const visibility = await page.evaluate(() => document.visibilityState);
  const bgA = await page.evaluate(() => (window as unknown as HarnessWindow).harness.decoded());
  await page.waitForTimeout(3000);
  const bgB = await page.evaluate(() => (window as unknown as HarnessWindow).harness.decoded());
  await other.close();
  await page.bringToFront();
  assert.ok(bgB - bgA > 45, `Video must keep flowing behind another tab (${bgB - bgA} frames in 3 s).`);
  if (visibility === 'hidden') pass('Background tab keeps streaming', `With the meeting tab hidden, the receiver still decoded ${((bgB - bgA) / 3).toFixed(0)} fps.`);
  else console.log(`NOTE Headless Chromium kept the tab ${visibility}, so background throttling was not exercised here. Frames are camera-driven, not timer-driven; check a real background tab by hand.`);

  await pill.getByRole('button', { name: /Return/ }).click();
  await until(page, () => (window as unknown as HarnessWindow).harness.status?.phase === 'visible', 6000);
  await page.evaluate(() => (window as unknown as HarnessWindow).harness.stopAll());
  await until(page, () => (window as unknown as HarnessWindow).harness.status?.camera === false, 5000);
  await pill.getByText('Turn on your camera').waitFor();
  await page.screenshot({ path: path.join(evidence, 'meet-pill.png') });

  const answer = await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'https://meet.google.com/*' });
    return chrome.tabs.sendMessage(tab!.id!, { type: 'prismwink-status' });
  }) as Status;
  assert.equal(answer.camera, false);
  assert.equal(answer.phase, 'visible');
  const orb = pill.locator('.orb');
  const startBox = (await pill.boundingBox())!;
  await page.mouse.move(startBox.x + 30, startBox.y + 30);
  await page.mouse.down();
  await page.mouse.move(startBox.x + 330, startBox.y + 30 - 200, { steps: 8 });
  await page.mouse.up();
  const moved = (await pill.boundingBox())!;
  assert.ok(Math.abs(moved.x - startBox.x - 300) < 4 && Math.abs(moved.y - startBox.y + 200) < 4, `The pill follows a drag (${JSON.stringify(startBox)} -> ${JSON.stringify(moved)}).`);
  assert.equal(await orb.getAttribute('aria-expanded'), 'true', 'A drag that ends on the orb does not collapse it.');
  await orb.click();
  assert.equal(await orb.getAttribute('aria-expanded'), 'false');
  await orb.focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  await page.reload();
  await pill.locator('.orb[aria-expanded="false"]').waitFor();
  const restored = (await pill.boundingBox())!;
  assert.ok(Math.abs(restored.x - moved.x - 16) < 4 && Math.abs(restored.y - moved.y) < 4, `The pill keeps its spot after reload (${restored.x},${restored.y} vs ${moved.x + 16},${moved.y}).`);
  await pill.locator('.orb').click();
  assert.equal(await pill.locator('.orb').getAttribute('aria-expanded'), 'true');
  pass('Pill is movable and remembers', 'The pill drags by its body or orb, moves with arrow keys, collapses to an orb, and keeps both after a reload. The popup can read live status from the Meet tab.');
  assert.deepEqual(errors, [], 'No uncaught page errors.');
  pass('Clean stop', 'Stopping the camera ends processing and the pill returns to its idle state, with no page errors.');
} catch (error) {
  checks.push({ check: 'Browser verification', passed: false, detail: error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error) });
  console.log(`FAIL ${checks.at(-1)!.detail}`);
} finally {
  await context?.close();
  await writeFile(path.join(evidence, 'browser-results.json'), JSON.stringify({ timestamp: new Date().toISOString(), checks, liveMeetVerified: false }, null, 2) + '\n');
  await rm(temporary, { recursive: true, force: true });
}
if (checks.some((check) => !check.passed)) process.exitCode = 1;
