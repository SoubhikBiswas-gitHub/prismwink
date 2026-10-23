export interface Point { x: number; y: number; z?: number }
export interface HandFrame { landmarks: Point[][]; worldLandmarks?: Point[][] }
export type HandStatus = 'none' | 'hand' | 'armed';
export interface SnapResult { snap: boolean; hand: HandStatus }
export interface SnapOptions { armRatio: number; releaseRatio: number; minReach: number; minFrames: number; maxHoldMs: number; releaseWindowMs: number; cooldownMs: number }

interface Pose { wrist: Point; imageSpan: number; pinch: number; reach: number }
interface Armed { since: number; last: number; frames: number; wrist: Point; imageSpan: number; reach: number }

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
const flat = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const finite = (point: Point | undefined) => Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y));

// World landmarks are metric and hand-centred, so the ratios hold when the palm turns sideways.
export function measure(image: Point[] | undefined, world?: Point[]): Pose | null {
  if (!image || image.length < 21 || ![0, 4, 9, 12].every((i) => finite(image[i]))) return null;
  const imageSpan = flat(image[0], image[9]);
  if (imageSpan < 0.04) return null;
  const points = world && world.length >= 21 && [0, 4, 9, 12].every((i) => finite(world[i])) ? world : image;
  const span = distance(points[0], points[9]);
  if (!(span > 0)) return null;
  return { wrist: image[0], imageSpan, pinch: distance(points[4], points[12]) / span, reach: distance(points[0], points[12]) / span };
}

export class SnapDetector {
  readonly options: SnapOptions;
  private armed: Armed | null = null;
  private locked = false;
  private lastTimestamp = -Infinity;
  private cooldownUntil = -Infinity;

  constructor(options: Partial<SnapOptions> = {}) {
    this.options = { armRatio: 0.4, releaseRatio: 0.62, minReach: 1.05, minFrames: 2, maxHoldMs: 3000, releaseWindowMs: 500, cooldownMs: 1500, ...options };
  }

  reset() {
    this.armed = null;
    this.locked = false;
    this.lastTimestamp = -Infinity;
    this.cooldownUntil = -Infinity;
  }

  update(frame: HandFrame | null | undefined, timestamp: number): SnapResult {
    if (!Number.isFinite(timestamp) || timestamp <= this.lastTimestamp) return { snap: false, hand: 'none' };
    this.lastTimestamp = timestamp;
    const { armRatio, releaseRatio, minReach, minFrames, maxHoldMs, releaseWindowMs, cooldownMs } = this.options;
    const poses = (frame?.landmarks ?? []).map((image, index) => measure(image, frame?.worldLandmarks?.[index])).filter((pose): pose is Pose => Boolean(pose));
    if (this.armed && timestamp - this.armed.last > releaseWindowMs) this.armed = null;
    if (!poses.length) {
      // A snap blurs the hand, so a short detection gap keeps the armed pinch alive.
      if (!this.armed) this.locked = false;
      return { snap: false, hand: 'none' };
    }
    if (timestamp < this.cooldownUntil) {
      this.armed = null;
      return { snap: false, hand: 'hand' };
    }
    const armed = this.armed;
    const pose = armed
      ? poses.reduce<Pose | null>((best, next) => {
        const gap = flat(next.wrist, armed.wrist);
        return gap < armed.imageSpan * 2.5 && (!best || gap < flat(best.wrist, armed.wrist)) ? next : best;
      }, null)
      : poses.reduce((best, next) => next.pinch < best.pinch ? next : best);
    if (!pose) return { snap: false, hand: 'hand' };
    const pinched = pose.pinch <= armRatio && pose.reach >= minReach;
    if (pinched) {
      if (armed) {
        armed.frames += 1;
        armed.last = timestamp;
        armed.wrist = pose.wrist;
        if (timestamp - armed.since > maxHoldMs) {
          this.armed = null;
          this.locked = true;
        }
      } else if (!this.locked) {
        this.armed = { since: timestamp, last: timestamp, frames: 1, wrist: pose.wrist, imageSpan: pose.imageSpan, reach: pose.reach };
      }
      return { snap: false, hand: this.armed ? 'armed' : 'hand' };
    }
    if (this.locked && pose.pinch >= releaseRatio) this.locked = false;
    if (!armed) return { snap: false, hand: 'hand' };
    // A real snap drops the middle fingertip onto the palm, so a curl also counts as release.
    const curled = pose.pinch >= armRatio + 0.08 && pose.reach <= armed.reach - 0.3;
    if (pose.pinch < releaseRatio && !curled) return { snap: false, hand: 'armed' };
    this.armed = null;
    if (armed.frames < minFrames) return { snap: false, hand: 'hand' };
    this.cooldownUntil = timestamp + cooldownMs;
    return { snap: true, hand: 'hand' };
  }
}
