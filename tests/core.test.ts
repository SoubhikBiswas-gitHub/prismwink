import test from 'node:test';
import assert from 'node:assert/strict';
import { SnapDetector, measure, type HandFrame, type Point } from '../src/gesture';
import { backgroundOf, fillHoles, validMask } from '../src/room';
import { dissolveField } from '../src/effects';
import { clockTime, describe, friendlyError, since, type Status } from '../src/format';

type Pose = { thumb: [number, number, number]; middle: [number, number, number] };
const POSES = {
  open: { thumb: [0.07, -0.08, 0], middle: [0, -0.18, 0] },
  pinch: { thumb: [0.035, -0.13, -0.02], middle: [0.03, -0.14, -0.02] },
  snapped: { thumb: [0.05, -0.11, -0.03], middle: [0.02, -0.05, -0.02] },
  curledNearThumb: { thumb: [0.04, -0.095, -0.02], middle: [0.02, -0.05, -0.02] },
  halfOpen: { thumb: [0.045, -0.12, -0.02], middle: [0.02, -0.15, -0.02] },
  fist: { thumb: [0.03, -0.065, -0.03], middle: [0.02, -0.06, -0.03] }
} satisfies Record<string, Pose>;

function hand(pose: Pose, shift = 0): HandFrame {
  const world: Point[] = Array.from({ length: 21 }, () => ({ x: 0.01, y: -0.05, z: 0 }));
  world[0] = { x: 0, y: 0, z: 0 };
  world[9] = { x: 0, y: -0.09, z: 0 };
  world[4] = { x: pose.thumb[0], y: pose.thumb[1], z: pose.thumb[2] };
  world[12] = { x: pose.middle[0], y: pose.middle[1], z: pose.middle[2] };
  const image = world.map((point) => ({ x: 0.5 + shift + point.x * 3, y: 0.7 + point.y * 3, z: 0 }));
  return { landmarks: [image], worldLandmarks: [world] };
}

const none: HandFrame = { landmarks: [] };

function play(detector: SnapDetector, steps: [HandFrame, number][]) {
  return steps.map(([frame, at]) => detector.update(frame, at));
}

test('pose measurement uses metric world landmarks and rejects tiny or broken hands', () => {
  const pinch = measure(hand(POSES.pinch).landmarks[0], hand(POSES.pinch).worldLandmarks![0])!;
  assert.ok(pinch.pinch < 0.2 && pinch.reach > 1.5);
  const tiny = hand(POSES.open).landmarks[0].map((point) => ({ x: point.x / 20, y: point.y / 20 }));
  assert.equal(measure(tiny), null);
  assert.equal(measure(hand(POSES.open).landmarks[0].slice(0, 10)), null);
});

test('a real snap fires once: pinch, then the middle finger drops to the palm', () => {
  const detector = new SnapDetector();
  const results = play(detector, [[hand(POSES.open), 0], [hand(POSES.pinch), 50], [hand(POSES.pinch), 100], [hand(POSES.pinch), 150], [hand(POSES.snapped), 200], [hand(POSES.open), 250]]);
  assert.deepEqual(results.map((result) => result.snap), [false, false, false, false, true, false]);
  assert.equal(results[2].hand, 'armed');
});

test('a curl-only release still counts as a snap', () => {
  const detector = new SnapDetector();
  const results = play(detector, [[hand(POSES.pinch), 0], [hand(POSES.pinch), 40], [hand(POSES.curledNearThumb), 80]]);
  assert.equal(results.at(-1)!.snap, true);
});

test('motion blur during the snap: a short detection gap is tolerated', () => {
  const detector = new SnapDetector();
  const results = play(detector, [[hand(POSES.pinch), 0], [hand(POSES.pinch), 40], [none, 80], [none, 120], [hand(POSES.snapped), 300]]);
  assert.equal(results.at(-1)!.snap, true);
});

test('a hand that disappears for good, or returns too late, does not fire', () => {
  const detector = new SnapDetector();
  const results = play(detector, [[hand(POSES.pinch), 0], [hand(POSES.pinch), 40], [none, 100], [hand(POSES.open), 700]]);
  assert.ok(results.every((result) => !result.snap));
});

test('a fist opening, a single noisy pinch frame and a slow opening never fire', () => {
  const fist = play(new SnapDetector(), [[hand(POSES.fist), 0], [hand(POSES.fist), 40], [hand(POSES.fist), 80], [hand(POSES.open), 120]]);
  assert.ok(fist.every((result) => !result.snap));
  const noisy = play(new SnapDetector(), [[hand(POSES.pinch), 0], [hand(POSES.open), 40]]);
  assert.ok(noisy.every((result) => !result.snap));
  const slow = play(new SnapDetector(), [[hand(POSES.pinch), 0], [hand(POSES.pinch), 40], [hand(POSES.halfOpen), 200], [hand(POSES.halfOpen), 500], [hand(POSES.halfOpen), 700], [hand(POSES.open), 900]]);
  assert.ok(slow.every((result) => !result.snap));
});

test('holding the pinch too long disarms until the hand opens again', () => {
  const detector = new SnapDetector();
  const steps: [HandFrame, number][] = [];
  for (let at = 0; at <= 3200; at += 100) steps.push([hand(POSES.pinch), at]);
  steps.push([hand(POSES.snapped), 3250]);
  assert.ok(play(detector, steps).every((result) => !result.snap));
  const again = play(detector, [[hand(POSES.open), 3400], [hand(POSES.pinch), 3450], [hand(POSES.pinch), 3500], [hand(POSES.snapped), 3550]]);
  assert.equal(again.at(-1)!.snap, true);
});

test('cooldown blocks a double toggle, and a later snap works', () => {
  const detector = new SnapDetector();
  const snap = (at: number) => play(detector, [[hand(POSES.pinch), at], [hand(POSES.pinch), at + 40], [hand(POSES.snapped), at + 80]]).at(-1)!.snap;
  assert.equal(snap(0), true);
  assert.equal(snap(300), false);
  assert.equal(snap(2000), true);
});

test('a release far from the armed hand belongs to another hand and does not fire', () => {
  const detector = new SnapDetector();
  const results = play(detector, [[hand(POSES.pinch), 0], [hand(POSES.pinch), 40], [hand(POSES.open, 0.8), 80]]);
  assert.ok(results.every((result) => !result.snap));
});

test('stale or repeated timestamps are ignored', () => {
  const detector = new SnapDetector();
  play(detector, [[hand(POSES.pinch), 100], [hand(POSES.pinch), 140]]);
  assert.deepEqual(detector.update(hand(POSES.snapped), 120), { snap: false, hand: 'none' });
  assert.equal(detector.update(hand(POSES.snapped), 160).snap, true);
});

test('the background excludes the person grown by the safety radius', () => {
  const width = 20, height = 10;
  const data = new Uint8Array(width * height);
  for (let y = 3; y < 7; y++) for (let x = 8; x < 12; x++) data[y * width + x] = 255;
  const background = backgroundOf({ width, height, data }, 2);
  assert.equal(background[5 * width + 10], 0);
  assert.equal(background[5 * width + 6], 0);
  assert.equal(background[5 * width + 13], 0);
  assert.equal(background[5 * width + 5], 1);
  assert.equal(background[0], 1);
  assert.equal(background[1 * width + 10], 0);
});

test('hole filling keeps known pixels and fills unseen ones from their surroundings', () => {
  const width = 16, height = 8;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (x >= 6 && x < 10) continue;
    rgba.set(x < 6 ? [200, 40, 40, 255] : [40, 40, 200, 255], i);
  }
  const filled = fillHoles(rgba, width, height);
  assert.deepEqual([...filled.slice(0, 4)], [200, 40, 40, 255]);
  assert.deepEqual([...filled.slice((width - 1) * 4, width * 4)], [40, 40, 200, 255]);
  const middle = (4 * width + 7) * 4;
  assert.equal(filled[middle + 3], 255);
  assert.ok(filled[middle] > 60 && filled[middle + 2] > 60, 'a hole between red and blue blends both');
  assert.ok(filled[middle + 1] < 80);
});

test('masks are validated before use', () => {
  assert.equal(validMask({ width: 2, height: 2, data: new Uint8Array(4) }), true);
  assert.equal(validMask({ width: 2, height: 2, data: new Uint8Array(3) }), false);
  assert.equal(validMask({ width: 0, height: 0, data: new Uint8Array(0) }), false);
  assert.equal(validMask(null), false);
});

test('dissolve timing spans the person and leaves time for the last dust to drift', () => {
  const width = 48, height = 27;
  const person = new Float32Array(width * height);
  for (let y = 5; y < 27; y++) for (let x = 14; x < 34; x++) person[y * width + x] = 1;
  const field = dissolveField(width, height, person);
  let low = Infinity, high = -Infinity;
  for (let i = 0; i < field.length; i++) {
    assert.ok(field[i] >= 0.04 - 1e-6 && field[i] <= 0.72 + 1e-6);
    if (person[i]) { low = Math.min(low, field[i]); high = Math.max(high, field[i]); }
  }
  assert.ok(Math.abs(low - 0.04) < 1e-6 && Math.abs(high - 0.72) < 1e-6);
});

test('times read as 12-hour clock with uppercase AM/PM and a running duration', () => {
  const start = new Date(2026, 9, 23, 22, 42).getTime();
  const plain = (text: string) => text.replace(/\u202f/g, ' ');
  assert.equal(plain(clockTime(start, 'en-IN')), '10:42 PM');
  assert.equal(plain(clockTime(start, 'en-US')), '10:42 PM');
  assert.equal(plain(since(start, start + 20_000, 'en-US')), 'Since 10:42 PM');
  assert.equal(plain(since(start, start + 7 * 60000, 'en-US')), 'Since 10:42 PM · 7 min');
  assert.equal(plain(since(start, start + 75 * 60000, 'en-US')), 'Since 10:42 PM · 1 h 15 min');
});

test('status wording is honest for every state, including who muted the mic', () => {
  const base: Status = { camera: true, phase: 'visible', since: 0, duration: 0, mic: 'live', vision: 'ready', error: '', hand: 'none', room: 0.9, gestures: true, notice: '' };
  assert.equal(describe({ ...base, camera: false }).detail, 'Turn on your camera to start');
  assert.equal(describe(base).title, 'Snap to vanish');
  assert.equal(describe(base).pose, 'coach');
  assert.equal(describe(base, true).pose, 'open', 'reduced motion stops the coach loop');
  assert.equal(describe({ ...base, room: 0.4 }).detail, 'Learning your room · 40%');
  assert.equal(describe({ ...base, effects: 'limited' }).detail, 'Dust effect needs graphics acceleration');
  assert.deepEqual([describe({ ...base, hand: 'armed' }).tone, describe({ ...base, hand: 'armed' }).pose], ['armed', 'pinch']);
  assert.equal(describe({ ...base, phase: 'vanishing', mic: 'muted' }).detail, 'Mic muted by Prismwink');
  assert.match(describe({ ...base, phase: 'hidden', mic: 'already', since: 0 }, false, 120_000).detail, /2 min · Mic was off$/);
  assert.equal(describe({ ...base, phase: 'hidden', gestures: false }).title, 'You’re hidden');
  assert.equal(describe({ ...base, vision: 'error', error: '' }).detail, 'Use the button or Alt+Shift+V');
});

test('engine failures become one plain sentence, never a stack trace', () => {
  const trace = 'Local camera processing could not load: INTERNAL: Service "kGpuService", required by node ...\n=== Source Location Trace: ===\nthird_party/mediapipe/framework/calculator_graph.cc:737';
  assert.equal(friendlyError(trace), 'Graphics acceleration is off in Chrome, so the dust effect is unavailable.');
  assert.equal(friendlyError('Local camera processing took too long to load.'), 'Gesture tracking took too long to load. Reload the Meet tab to retry.');
  assert.equal(friendlyError('This browser cannot process camera frames.'), 'This version of Chrome cannot run camera effects. Update Chrome to use Prismwink.');
  assert.equal(friendlyError('Local camera processing could not load: model file missing\nstack line'), 'model file missing');
  assert.equal(friendlyError(''), 'Gesture tracking is unavailable. Use the button or Alt+Shift+V.');
  assert.ok(friendlyError('x'.repeat(200)).length <= 90);
});
