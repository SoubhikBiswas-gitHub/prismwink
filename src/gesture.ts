export interface Landmark { x: number; y: number; z?: number }
export interface HandDetection { landmarks: Landmark[][]; handedness?: { categoryName?: string }[][] }
export type HandStatus = 'ready' | 'pinched' | 'no-hand';
export interface GestureResult { gesture: boolean; handStatus: HandStatus }
export interface GestureOptions { cooldown: number; minPinchMs: number; maxPinchMs: number; releaseWindowMs: number; pinchRatio: number; releaseRatio: number }
interface Contact { start: number; last: number; frames: number; releaseStart: number | null }
interface HandCandidate { points: Landmark[]; span: number; label: string; wrist: Landmark; ratio: number }

const distance = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y);

export class SnapGestureDetector {
  readonly options: GestureOptions;
  contact: Contact | null = null;
  lastHand: { wrist: Landmark; label: string } | null = null;
  lastTimestamp = -Infinity;
  nextAllowedAt = -Infinity;
  needsRelease = false;
  constructor({ cooldown = 1300, minPinchMs = 65, maxPinchMs = 900, releaseWindowMs = 260, pinchRatio = 0.42, releaseRatio = 0.92 }: Partial<GestureOptions> = {}) {
    this.options = { cooldown, minPinchMs, maxPinchMs, releaseWindowMs, pinchRatio, releaseRatio };
    this.reset();
  }

  reset() {
    this.contact = null;
    this.lastHand = null;
    this.lastTimestamp = -Infinity;
    this.nextAllowedAt = -Infinity;
    this.needsRelease = false;
  }

  update(result: HandDetection | Landmark[][] | undefined, timestamp: number): GestureResult {
    const detection: HandDetection | undefined = Array.isArray(result) ? { landmarks: result } : result;
    const landmarks = detection?.landmarks;
    if (!Number.isFinite(timestamp) || timestamp <= this.lastTimestamp) {
      this.contact = null;
      this.lastHand = null;
      return { gesture: false, handStatus: 'no-hand' };
    }
    this.lastTimestamp = timestamp;
    const candidates = (landmarks || []).map((points, index) => {
      if (points.length < 21 || [0, 4, 9, 12].some(i => !Number.isFinite(points[i]?.x) || !Number.isFinite(points[i]?.y))) return null;
      const span = distance(points[0], points[9]);
      if (span < 0.035) return null;
      const label = detection?.handedness?.[index]?.[0]?.categoryName || '';
      return { points, span, label, wrist: points[0], ratio: distance(points[4], points[12]) / span };
    }).filter((candidate): candidate is HandCandidate => Boolean(candidate));
    const previous = this.lastHand;
    let hand = candidates.find(candidate => previous && candidate.label === previous.label && distance(candidate.wrist, previous.wrist) < candidate.span * 1.25);
    if (!hand) {
      hand = candidates[0];
      this.contact = null;
      this.needsRelease = false;
    }
    if (!hand) {
      this.lastHand = null;
      this.contact = null;
      this.needsRelease = false;
      return { gesture: false, handStatus: 'no-hand' };
    }
    this.lastHand = { wrist: { ...hand.wrist }, label: hand.label };
    const { pinchRatio, releaseRatio, minPinchMs, maxPinchMs, releaseWindowMs, cooldown } = this.options;
    const pinched = hand.ratio <= pinchRatio;
    const released = hand.ratio >= releaseRatio;
    const handStatus = pinched ? 'pinched' : 'ready';
    if (this.needsRelease) {
      if (released) this.needsRelease = false;
      return { gesture: false, handStatus };
    }
    if (timestamp < this.nextAllowedAt) {
      this.contact = null;
      return { gesture: false, handStatus };
    }
    if (pinched) {
      if (!this.contact) this.contact = { start: timestamp, last: timestamp, frames: 0, releaseStart: null };
      this.contact.frames++;
      this.contact.last = timestamp;
      this.contact.releaseStart = null;
      if (timestamp - this.contact.start > maxPinchMs) {
        this.contact = null;
        this.needsRelease = true;
      }
      return { gesture: false, handStatus };
    }
    if (!this.contact) return { gesture: false, handStatus };
    this.contact.releaseStart ??= timestamp;
    const held = this.contact.last - this.contact.start;
    const opening = timestamp - this.contact.releaseStart;
    const sinceContact = timestamp - this.contact.last;
    const valid = released && this.contact.frames >= 2 && held >= minPinchMs && held <= maxPinchMs && opening <= releaseWindowMs && sinceContact <= releaseWindowMs;
    if (released || opening > releaseWindowMs || sinceContact > releaseWindowMs) this.contact = null;
    if (valid) {
      this.nextAllowedAt = timestamp + cooldown;
      return { gesture: true, handStatus: 'ready' };
    }
    return { gesture: false, handStatus };
  }
}
