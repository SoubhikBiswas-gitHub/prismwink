import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { SnapGestureDetector } from '../src/gesture';
import { EffectRenderer, validMask } from '../src/effects';
import { VisionClient } from '../src/vision-client';
import type { HandDetection } from '../src/gesture';
import type { PersonMask, RenderState } from '../src/effects';

function hand(gap: number, label = 'Left', x = 0.45): HandDetection {
  const points = Array.from({ length: 21 }, () => ({ x, y: 0.55, z: 0 }));
  points[0] = { x, y: 0.7, z: 0 };
  points[9] = { x, y: 0.5, z: 0 };
  points[4] = { x, y: 0.3, z: 0 };
  points[12] = { x: x + gap * 0.2, y: 0.3, z: 0 };
  return { landmarks: [points], handedness: [[{ categoryName: label }]] };
}

function snap(detector: SnapGestureDetector, start = 0) {
  detector.update(hand(1.2), start);
  detector.update(hand(0.1), start + 20);
  detector.update(hand(0.1), start + 100);
  return detector.update(hand(1.2), start + 150);
}

test('deliberate thumb/middle contact followed by quick release emits one cue', () => {
  const detector = new SnapGestureDetector();
  assert.deepEqual(snap(detector), { gesture: true, handStatus: 'ready' });
  assert.equal(detector.update(hand(1.2), 200).gesture, false);
});

test('a single noisy pinch frame, slow opening and prolonged hold do not trigger', () => {
  const detector = new SnapGestureDetector();
  detector.update(hand(0.1), 0);
  assert.equal(detector.update(hand(1.2), 80).gesture, false);
  detector.update(hand(0.1), 300);
  detector.update(hand(0.1), 400);
  detector.update(hand(0.6), 500);
  assert.equal(detector.update(hand(1.2), 900).gesture, false);
  detector.update(hand(0.1), 1200);
  detector.update(hand(0.1), 1300);
  detector.update(hand(0.1), 2300);
  assert.equal(detector.update(hand(1.2), 2400).gesture, false);
});

test('hand loss, hand switching and a large tracking jump cancel the armed cue', () => {
  for (const change of [{ landmarks: [] }, hand(1.2, 'Right'), hand(1.2, 'Left', 0.9)]) {
    const detector = new SnapGestureDetector();
    detector.update(hand(0.1), 0);
    detector.update(hand(0.1), 100);
    assert.equal(detector.update(change, 150).gesture, false);
    assert.equal(detector.update(hand(1.2), 200).gesture, false);
  }
});

test('a cooldown prevents repeated toggles and a later deliberate cue works', () => {
  const detector = new SnapGestureDetector();
  assert.equal(snap(detector).gesture, true);
  assert.equal(snap(detector, 300).gesture, false);
  assert.equal(snap(detector, 1800).gesture, true);
});

test('out-of-order timestamps and invalid tiny hands cannot release a stored cue', () => {
  const detector = new SnapGestureDetector();
  detector.update(hand(0.1), 100);
  detector.update(hand(0.1), 200);
  assert.equal(detector.update(hand(1.2), 190).gesture, false);
  assert.equal(detector.update(hand(1.2), 250).gesture, false);
  const invalid = hand(0.1);
  invalid.landmarks[0][9] = invalid.landmarks[0][0];
  assert.deepEqual(detector.update(invalid, 300), { gesture: false, handStatus: 'no-hand' });
});

interface PixelBuffer { width: number; height: number; data: Uint8ClampedArray }
class FakeCanvas {
  width: number;
  height: number;
  context: FakeContext;
  constructor(width = 64, height = 36) {
    this.width = width;
    this.height = height;
    this.context = new FakeContext(this);
  }
  getContext() { return this.context; }
}
class FakeContext {
  canvas: FakeCanvas;
  draws: unknown[] = [];
  pixels?: PixelBuffer;
  throwOnSource?: unknown;
  constructor(canvas: FakeCanvas) { this.canvas = canvas; this.draws = []; }
  createImageData(width: number, height: number) { return { width, height, data: new Uint8ClampedArray(width * height * 4) }; }
  putImageData(image: PixelBuffer) { this.pixels = image; }
  getImageData(_x: number, _y: number, width: number, height: number) {
    const image = this.createImageData(width, height);
    for (let i = 0; i < image.data.length; i += 4) image.data.set([40, 140, 180, 255], i);
    if (this.pixels?.data.length === image.data.length) image.data.set(this.pixels.data);
    return image;
  }
  drawImage(source: unknown) { if (source === this.throwOnSource) throw new Error('frame unavailable'); this.draws.push(source); }
  setTransform() {}
  clearRect() {}
  fills = 0;
  fillRect() { this.fills++; }
  beginPath() {}
  arc() {}
  fill() {}
}
const mask: PersonMask = { width: 4, height: 4, data: new Uint8Array(16).fill(255) };
const raw = { width: 64, height: 36, id: 'raw camera' } as unknown as HTMLCanvasElement;

function renderer(t: TestContext, onState?: (state: RenderState) => void) {
  const previous = globalThis.OffscreenCanvas;
  globalThis.OffscreenCanvas = FakeCanvas as unknown as typeof OffscreenCanvas;
  t.after(() => { globalThis.OffscreenCanvas = previous; });
  const canvas = new FakeCanvas();
  return { canvas, effect: new EffectRenderer(canvas as unknown as HTMLCanvasElement, { onState }) };
}

test('no plate, no foreground, malformed masks and overlapping transitions are rejected', t => {
  const { effect } = renderer(t);
  assert.equal(effect.toggle(raw, mask, 0), false);
  effect.capturePlate(raw);
  assert.equal(effect.toggle(raw, { ...mask, data: new Uint8Array(16) }, 0), false);
  assert.equal(effect.toggle(raw, { ...mask, width: 100000 }, 0), false);
  assert.equal(effect.toggle(raw, mask, 0), true);
  assert.equal(effect.toggle(raw, mask, 1), false);
  assert.equal(validMask({ width: 0, height: 0, data: new Uint8Array() }), false);
});

test('the state callback runs before the first transformed frame and hidden output never draws the raw source', t => {
  const notices: { state: RenderState; frames: number }[] = [];
  const { effect, canvas } = renderer(t, state => notices.push({ state, frames: canvas.context.draws.length }));
  effect.capturePlate(raw);
  effect.render(raw, mask, 0);
  const before = canvas.context.draws.length;
  assert.equal(effect.toggle(raw, mask, 10), true);
  assert.deepEqual(notices, [{ state: 'vanishing', frames: before }]);
  effect.render(raw, mask, 2510);
  assert.equal(effect.state, 'hidden');
  canvas.context.draws = [];
  effect.render(raw, null, 3000);
  effect.render(raw, mask, 4000);
  assert.equal(canvas.context.draws.includes(raw), false);
  assert.ok(canvas.context.draws.length > 0);
});

test('a cleared plate or changed device while hidden enters recovery without revealing live pixels', t => {
  const { effect, canvas } = renderer(t);
  effect.capturePlate(raw);
  effect.toggle(raw, mask, 0);
  effect.render(raw, mask, 3000);
  canvas.context.draws = [];
  const replacement = { width: 128, height: 72, id: 'new camera' } as unknown as HTMLCanvasElement;
  effect.render(replacement, mask, 4000);
  assert.equal(effect.state, 'recovery');
  assert.equal(effect.hasPlate, false);
  assert.equal(canvas.context.draws.includes(raw), false);
  assert.equal(canvas.context.draws.includes(replacement), false);
  assert.equal(effect.toggle(replacement, mask, 4500), false);
  effect.recover();
  effect.render(replacement, mask, 4600);
  assert.equal(canvas.context.draws.at(-1), replacement);
  assert.equal(effect.hasPlate, false);
});

test('a rendering failure announces recovery synchronously and remains safe across later frames', t => {
  const notices: RenderState[] = [];
  const { effect, canvas } = renderer(t, state => notices.push(state));
  effect.capturePlate(raw);
  canvas.context.throwOnSource = raw;
  assert.throws(() => effect.render(raw, mask, 100), /frame unavailable/);
  assert.equal(effect.state, 'recovery');
  assert.deepEqual(notices, ['recovery']);
  canvas.context.throwOnSource = undefined;
  canvas.context.draws = [];
  effect.render(raw, mask, 200);
  assert.equal(canvas.context.draws.includes(raw), false);
});

test('return reconstructs and resumes live video only after its transition completes', t => {
  const { effect, canvas } = renderer(t);
  effect.capturePlate(raw);
  effect.toggle(raw, mask, 0);
  effect.render(raw, mask, 3000);
  const returned = { ...raw, id: 'current pose' };
  assert.equal(effect.toggle(returned, mask, 4000), true);
  canvas.context.draws = [];
  effect.render(returned, mask, 4100);
  assert.equal(canvas.context.draws.includes(returned), false);
  effect.render(returned, mask, 7000);
  assert.equal(effect.state, 'visible');
  assert.equal(canvas.context.draws.at(-1), returned);
});

test('all visual styles render a transition; reduced motion finishes quickly and destroy preserves the output', t => {
  const { effect, canvas } = renderer(t);
  for (const style of ['dust', 'pixel', 'confetti', 'smoke'] as const) {
    effect.recover();
    effect.setOptions({ effect: style, palette: 'prism', duration: 2000, density: 500 });
    effect.capturePlate(raw);
    assert.equal(effect.toggle(raw, mask, 0), true);
    effect.render(raw, mask, 1000);
    assert.equal(effect.state, 'vanishing');
  }
  effect.recover();
  effect.setOptions({ reducedMotion: true });
  effect.capturePlate(raw);
  effect.toggle(raw, mask, 0);
  effect.render(raw, mask, 200);
  assert.equal(effect.state, 'hidden');
  const draws = canvas.context.draws.length;
  effect.destroy();
  effect.render(raw, mask, 1000);
  assert.equal(canvas.context.draws.length, draws);
});

interface MockBitmap { closed: boolean; close: () => void }
function mockWorker(t: TestContext, { initError = false, postError = false }: { initError?: boolean; postError?: boolean } = {}) {
  const previousWorker = globalThis.Worker;
  const previousBitmap = globalThis.createImageBitmap;
  const instances: WorkerMock[] = [];
  const bitmaps: MockBitmap[] = [];
  class WorkerMock {
    onmessage?: (event: { data: unknown }) => void;
    last?: { id: number; bitmap: MockBitmap };
    terminated = false;
    constructor() { instances.push(this); }
    postMessage(message: { type: string; id: number; bitmap: MockBitmap }) {
      if (message.type === 'init') queueMicrotask(() => this.onmessage?.({ data: initError ? { type: 'error', message: 'missing local assets' } : { type: 'ready' } }));
      else {
        if (postError) throw new Error('transfer failed');
        this.last = message;
      }
    }
    terminate() { this.terminated = true; }
    result() { this.last!.bitmap.close(); this.onmessage?.({ data: { type: 'result', id: this.last!.id, mask, gesture: false, handStatus: 'ready' } }); }
  }
  globalThis.Worker = WorkerMock as unknown as typeof Worker;
  globalThis.createImageBitmap = (async () => {
    const bitmap = { closed: false, close() { this.closed = true; } };
    bitmaps.push(bitmap);
    return bitmap;
  }) as unknown as typeof createImageBitmap;
  t.after(() => { globalThis.Worker = previousWorker; globalThis.createImageBitmap = previousBitmap; });
  return { instances, bitmaps };
}

test('vision initialization rejects instead of reporting readiness when local assets fail', async t => {
  const { instances } = mockWorker(t, { initError: true });
  const client = new VisionClient({ workerUrl: 'local-worker.js' });
  await assert.rejects(client.init(), /missing local assets/);
  assert.equal(client.ready, false);
  assert.equal(instances[0].terminated, true);
});

test('vision allows one in-flight frame, returns its mask, and close rejects pending work', async t => {
  const { instances } = mockWorker(t);
  const client = new VisionClient({ workerUrl: 'local-worker.js' });
  await client.init();
  const first = client.process(raw, 100);
  assert.equal(await client.process(raw, 110), null);
  await new Promise(resolve => setImmediate(resolve));
  instances[0].result();
  assert.deepEqual(await first, { mask, gesture: false, handStatus: 'ready' });
  const second = client.process(raw, 200);
  await new Promise(resolve => setImmediate(resolve));
  client.close();
  await assert.rejects(second, /stopped/);
  assert.equal(instances[0].terminated, true);
  await assert.rejects(client.process(raw, 300), /stopped/);
});

test('vision closes an untransferred frame when posting to the worker fails', async t => {
  const { bitmaps } = mockWorker(t, { postError: true });
  const client = new VisionClient({ workerUrl: 'local-worker.js' });
  await assert.rejects(client.process(raw, 100), /transfer failed/);
  assert.equal(bitmaps[0].closed, true);
  assert.equal(client.pending.size, 0);
  client.close();
});


test('slow effect frames reduce particle drawing without changing presets or exposing live pixels', t => {
  const { effect, canvas } = renderer(t);
  let clock = 0;
  t.mock.method(performance, 'now', () => { clock += 30; return clock; });
  effect.setOptions({density: 4500});
  effect.capturePlate(raw);
  effect.toggle(raw, mask, 0);
  let firstFills = 0;
  for (let index = 0; index < 6; index++) {
    const before = canvas.context.fills;
    effect.render(raw, mask, 1500);
    if (index === 0) firstFills = canvas.context.fills - before;
  }
  assert.equal(effect.quality, 'light');
  const before = canvas.context.fills;
  effect.render(raw, mask, 1500);
  assert.ok(canvas.context.fills - before < firstFills * 0.5);
  assert.equal(effect.options.density, 4500);
  effect.render(raw, mask, 3000);
  canvas.context.draws = [];
  effect.render(raw, mask, 4000);
  assert.equal(effect.state, 'hidden');
  assert.equal(canvas.context.draws.includes(raw), false);
});
