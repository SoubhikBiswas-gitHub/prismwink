import type { PersonMask } from './room';

export type TransitionKind = 'vanish' | 'return';
type Surface = OffscreenCanvas;
type Context = OffscreenCanvasRenderingContext2D;
export interface TransitionInput { kind: TransitionKind; width: number; height: number; snapshot: CanvasImageSource; mask: PersonMask; start: number; duration: number; reducedMotion: boolean }

const EDGE = 0.035;
const ASH_BAND = 0.1;
const LIFE = 0.28;
const ASH = 'rgb(74,66,61)';

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

function hash(x: number, y: number, seed: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise(x: number, y: number, seed: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const top = hash(ix, iy, seed) + (hash(ix + 1, iy, seed) - hash(ix, iy, seed)) * sx;
  const bottom = hash(ix, iy + 1, seed) + (hash(ix + 1, iy + 1, seed) - hash(ix, iy + 1, seed)) * sx;
  return top + (bottom - top) * sy;
}

// Per-pixel dissolve times in [0.04, 0.72]: noisy fronts sweeping from the top right across the person.
export function dissolveField(width: number, height: number, person: Float32Array, seed = 7): Float32Array {
  const raw = new Float32Array(width * height);
  let low = Infinity, high = -Infinity;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = x / width, v = y / height;
    const aspect = height / width;
    const grain = noise(u * 6, v * 6 * aspect, seed) * 0.4 + noise(u * 24, v * 24 * aspect, seed + 1) * 0.3 + noise(u * 90, v * 90 * aspect, seed + 2) * 0.18 + hash(x, y, seed + 3) * 0.12;
    const value = grain * 0.42 + ((1 - u) * 0.7 + v * 0.5) * 0.58;
    const i = y * width + x;
    raw[i] = value;
    if (person[i] > 0.5) { low = Math.min(low, value); high = Math.max(high, value); }
  }
  if (!Number.isFinite(low)) { low = Math.min(...raw); high = Math.max(...raw); }
  const range = Math.max(1e-6, high - low);
  for (let i = 0; i < raw.length; i++) raw[i] = 0.04 + clamp((raw[i] - low) / range, 0, 1) * 0.68;
  return raw;
}

export function maskSurface(mask: PersonMask): Surface {
  const canvas = new OffscreenCanvas(mask.width, mask.height);
  const context = canvas.getContext('2d') as Context;
  const pixels = context.createImageData(mask.width, mask.height);
  for (let i = 0; i < mask.data.length; i++) {
    pixels.data[i * 4] = pixels.data[i * 4 + 1] = pixels.data[i * 4 + 2] = 255;
    pixels.data[i * 4 + 3] = mask.data[i];
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

export class DustTransition {
  readonly kind: TransitionKind;
  readonly start: number;
  readonly duration: number;
  readonly reducedMotion: boolean;
  private readonly width: number;
  private readonly height: number;
  private readonly fieldWidth: number;
  private readonly fieldHeight: number;
  private readonly phase: Float32Array;
  private readonly snapshotMask: Surface;
  private readonly layer: Surface;
  private readonly layerContext: Context;
  private readonly erosion: Surface;
  private readonly erosionPixels: ImageData;
  private readonly ash: Surface;
  private readonly ashPixels: ImageData;
  private readonly particles: Float32Array;
  private readonly colors: string[] = [];
  private readonly count: number;

  constructor({ kind, width, height, snapshot, mask, start, duration, reducedMotion }: TransitionInput) {
    this.kind = kind;
    this.start = start;
    this.duration = reducedMotion ? 350 : duration;
    this.reducedMotion = reducedMotion;
    this.width = width;
    this.height = height;
    this.fieldWidth = Math.min(480, width);
    this.fieldHeight = Math.max(1, Math.round(this.fieldWidth * height / width));
    this.snapshotMask = maskSurface(mask);
    this.layer = new OffscreenCanvas(width, height);
    this.layerContext = this.layer.getContext('2d') as Context;
    const fw = this.fieldWidth, fh = this.fieldHeight;
    this.erosion = new OffscreenCanvas(fw, fh);
    this.ash = new OffscreenCanvas(fw, fh);
    const erosionContext = this.erosion.getContext('2d') as Context;
    this.erosionPixels = erosionContext.createImageData(fw, fh);
    this.ashPixels = (this.ash.getContext('2d') as Context).createImageData(fw, fh);
    const sample = new OffscreenCanvas(fw, fh);
    const sampleContext = sample.getContext('2d', { willReadFrequently: true }) as Context;
    sampleContext.drawImage(this.snapshotMask, 0, 0, fw, fh);
    const maskPixels = sampleContext.getImageData(0, 0, fw, fh).data;
    sampleContext.globalCompositeOperation = 'copy';
    sampleContext.drawImage(snapshot, 0, 0, fw, fh);
    const colorPixels = sampleContext.getImageData(0, 0, fw, fh).data;
    const person = new Float32Array(fw * fh);
    let area = 0;
    for (let i = 0; i < person.length; i++) {
      person[i] = maskPixels[i * 4 + 3] / 255;
      if (person[i] > 0.6) area++;
      this.erosionPixels.data[i * 4] = this.erosionPixels.data[i * 4 + 1] = this.erosionPixels.data[i * 4 + 2] = 255;
      this.ashPixels.data[i * 4] = 58; this.ashPixels.data[i * 4 + 1] = 50; this.ashPixels.data[i * 4 + 2] = 46;
    }
    this.phase = dissolveField(fw, fh, person, Math.floor(start) & 1023);
    const scale = width / 1280;
    const target = reducedMotion ? 0 : Math.min(11000, Math.round(area * 0.45));
    this.particles = new Float32Array(target * 7);
    let seed = (Math.floor(start) | 0) ^ 0x9e3779b9;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    let count = 0;
    for (let attempt = 0; count < target && attempt < target * 6; attempt++) {
      const fx = Math.floor(random() * fw), fy = Math.floor(random() * fh);
      const i = fy * fw + fx;
      if (person[i] <= 0.6) continue;
      const angle = -0.5 + (random() - 0.5) * 1.1;
      const speed = width * (0.18 + random() * 0.4);
      const o = count * 7;
      this.particles[o] = (fx + random()) * width / fw;
      this.particles[o + 1] = (fy + random()) * height / fh;
      this.particles[o + 2] = this.phase[i];
      this.particles[o + 3] = Math.cos(angle) * speed;
      this.particles[o + 4] = Math.sin(angle) * speed - height * 0.05;
      this.particles[o + 5] = Math.max(1, (1 + random() * random() * 2.6) * scale * 1.5);
      this.particles[o + 6] = random() * 6.283;
      const lift = 1.08;
      this.colors.push(`rgb(${Math.min(255, colorPixels[i * 4] * lift) | 0},${Math.min(255, colorPixels[i * 4 + 1] * lift) | 0},${Math.min(255, colorPixels[i * 4 + 2] * lift) | 0})`);
      count++;
    }
    this.count = count;
  }

  progress(now: number) { return clamp((now - this.start) / this.duration, 0, 1); }

  // Draws one frame over the room. Returns true once the transition has finished.
  draw(context: Context, live: CanvasImageSource, liveMask: Surface | null, room: CanvasImageSource, now: number): boolean {
    const p = this.progress(now);
    const q = this.kind === 'vanish' ? p : 1 - (1 - (1 - p) * (1 - p));
    const { width, height } = this;
    context.globalCompositeOperation = 'copy';
    context.globalAlpha = 1;
    context.drawImage(room, 0, 0, width, height);
    context.globalCompositeOperation = 'source-over';
    const layer = this.layerContext;
    layer.globalCompositeOperation = 'copy';
    layer.drawImage(live, 0, 0, width, height);
    layer.globalCompositeOperation = 'destination-in';
    layer.imageSmoothingEnabled = true;
    layer.drawImage(liveMask ?? this.snapshotMask, 0, 0, width, height);
    if (this.reducedMotion) {
      context.globalAlpha = 1 - q;
      context.drawImage(this.layer, 0, 0);
      context.globalAlpha = 1;
      return p >= 1;
    }
    const erosion = this.erosionPixels.data, ash = this.ashPixels.data, phase = this.phase;
    for (let i = 0; i < phase.length; i++) {
      const d = phase[i] - q;
      const alpha = d >= EDGE ? 1 : d <= 0 ? 0 : d / EDGE;
      erosion[i * 4 + 3] = alpha * 255;
      ash[i * 4 + 3] = d < ASH_BAND && alpha > 0 ? (1 - d / ASH_BAND) * 215 * alpha : 0;
    }
    (this.erosion.getContext('2d') as Context).putImageData(this.erosionPixels, 0, 0);
    (this.ash.getContext('2d') as Context).putImageData(this.ashPixels, 0, 0);
    layer.drawImage(this.erosion, 0, 0, width, height);
    layer.globalCompositeOperation = 'source-atop';
    layer.drawImage(this.ash, 0, 0, width, height);
    layer.globalCompositeOperation = 'source-over';
    context.drawImage(this.layer, 0, 0);
    this.drawParticles(context, q);
    return p >= 1;
  }

  private drawParticles(context: Context, q: number) {
    const particles = this.particles;
    const sway = this.height * 0.025;
    for (let n = 0; n < this.count; n++) {
      const o = n * 7;
      const t = (q - particles[o + 2]) / LIFE;
      if (t <= 0 || t >= 1) continue;
      const travel = 1 - (1 - t) * (1 - t);
      const swirl = particles[o + 6];
      const x = particles[o] + particles[o + 3] * travel * LIFE + Math.sin(t * 7 + swirl) * sway * t;
      const y = particles[o + 1] + particles[o + 4] * travel * LIFE + Math.cos(t * 5 + swirl) * sway * t;
      context.globalAlpha = Math.pow(1 - t, 1.4) * Math.min(1, t * 14);
      context.fillStyle = t < 0.35 ? this.colors[n] : ASH;
      const size = particles[o + 5] * (1 - t * 0.45);
      context.fillRect(x, y, size, size);
    }
    context.globalAlpha = 1;
  }
}
