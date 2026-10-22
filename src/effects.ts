import { RenderBudget } from './render-budget';

export type RenderState = 'visible' | 'vanishing' | 'hidden' | 'returning' | 'recovery';
export type EffectName = 'dust' | 'pixel' | 'confetti' | 'smoke';
export type PaletteName = 'natural' | 'prism' | 'stardust' | 'gold' | 'mint' | 'violet';
export type EffectDirection = 'left' | 'right' | 'up';
export interface PersonMask { data: Uint8Array | Uint8ClampedArray; width: number; height: number }
export interface EffectOptions { effect: EffectName; duration: number; density: number; palette: PaletteName; reducedMotion: boolean; direction: EffectDirection }
type Surface = HTMLCanvasElement | OffscreenCanvas;
type DrawContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
interface SourceDimensions { width: number; height: number }
interface Particle { x: number; y: number; phase: number; vx: number; vy: number; curl: number; radius: number; spin: number; color: string }

const EFFECTS = new Set<EffectName>(['dust', 'pixel', 'confetti', 'smoke']);
const PALETTES = new Set<PaletteName>(['natural', 'prism', 'stardust', 'gold', 'mint', 'violet']);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const COLORS: Record<string, number[]> = { mint: [121, 232, 208], violet: [182, 160, 255], stardust: [244, 204, 129], gold: [244, 204, 129] };

function dimensions(source: CanvasImageSource): SourceDimensions {
  const size = source as { videoWidth?: number; videoHeight?: number; naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
  return { width: size?.videoWidth || size?.naturalWidth || size?.width || 0, height: size?.videoHeight || size?.naturalHeight || size?.height || 0 };
}

function canvasFor(reference: Surface, width: number, height: number): Surface {
  const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(width, height) : ((reference as HTMLCanvasElement).ownerDocument || document).createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  if (!canvas.getContext('2d')) throw new Error('This browser cannot create the camera effect canvas.');
  return canvas;
}

function cropFor(source: CanvasImageSource, width: number, height: number) {
  const size = dimensions(source);
  if (!size.width || !size.height) throw new Error('The camera has not produced a frame yet.');
  const scale = Math.max(width / size.width, height / size.height);
  const sw = width / scale;
  const sh = height / scale;
  return { ...size, sx: (size.width - sw) / 2, sy: (size.height - sh) / 2, sw, sh };
}

function drawCover(context: DrawContext, source: CanvasImageSource, width: number, height: number) {
  const crop = cropFor(source, width, height);
  context.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);
  return crop;
}

export function validMask(mask: unknown): mask is PersonMask {
  const candidate = mask as PersonMask | undefined;
  return Boolean(candidate && Number.isInteger(candidate.width) && Number.isInteger(candidate.height) && candidate.width > 0 && candidate.height > 0 && candidate.width * candidate.height <= 1048576 && (candidate.data instanceof Uint8Array || candidate.data instanceof Uint8ClampedArray) && candidate.data.length === candidate.width * candidate.height);
}

export class EffectRenderer {
  readonly canvas: Surface;
  readonly context: DrawContext;
  onState?: (state: RenderState) => void;
  private _state: RenderState = 'visible';
  private readonly _budget = new RenderBudget();
  private _options: EffectOptions;
  private _activeOptions: EffectOptions;
  private _plate: Surface | null = null;
  private _plateValid = false;
  private _sourceDimensions: SourceDimensions | null = null;
  private _snapshot: Surface | null = null;
  private _particles: Particle[] = [];
  private _destroyed = false;
  private _start = 0;
  private _duration = 2500;
  private _erosion: Surface | null = null;
  private _erosionContext: DrawContext | null = null;
  private _erosionPixels: ImageData | null = null;
  private _baseAlpha: Uint8Array | null = null;
  private _phases: Float32Array | null = null;
  private _foreground: Surface | null = null;
  private _foregroundContext: DrawContext | null = null;

  constructor(canvas: Surface, { onState }: { onState?: (state: RenderState) => void } = {}) {
    if (!canvas?.getContext) throw new Error('A camera canvas is required.');
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false }) as DrawContext | null;
    if (!context) throw new Error('This browser cannot render camera effects.');
    this.context = context;
    canvas.width ||= 640;
    canvas.height ||= 360;
    this.onState = onState;
    this._state = 'visible';
    this._options = { effect: 'dust', duration: 2500, density: 4500, palette: 'natural', reducedMotion: false, direction: 'right' };
    this._activeOptions = { ...this._options };
    this._plate = null;
    this._plateValid = false;
    this._sourceDimensions = null;
    this._snapshot = null;
    this._particles = [];
    this._destroyed = false;
  }

  get state() { return this._state; }
  get quality() { return this._budget.quality; }
  get hasPlate() { return this._plateValid; }
  get options() { return { ...this._options }; }

  setOptions(options: Partial<EffectOptions> = {}) {
    if (options.effect && EFFECTS.has(options.effect)) this._options.effect = options.effect;
    if (options.palette && PALETTES.has(options.palette)) this._options.palette = options.palette;
    if (typeof options.duration === 'number' && Number.isFinite(options.duration)) this._options.duration = clamp(options.duration, 500, 5000);
    if (typeof options.density === 'number' && Number.isFinite(options.density)) this._options.density = Math.round(clamp(options.density, 500, 9000));
    if (typeof options.reducedMotion === 'boolean') this._options.reducedMotion = options.reducedMotion;
    if (options.direction && ['left', 'right', 'up'].includes(options.direction)) this._options.direction = options.direction;
  }

  _setState(state: RenderState) {
    if (state === this._state) return;
    this._state = state;
    try {
      this.onState?.(state);
    } catch (error) {
      this._state = 'recovery';
      throw error;
    }
  }

  capturePlate(source: CanvasImageSource) {
    if (this._destroyed) throw new Error('The camera renderer has stopped.');
    if (this._state !== 'visible') throw new Error('Return to the camera before capturing the empty room.');
    const candidate = canvasFor(this.canvas, this.canvas.width, this.canvas.height);
    drawCover(candidate.getContext('2d') as DrawContext, source, candidate.width, candidate.height);
    this._plate = candidate;
    this._plateValid = true;
    this._sourceDimensions = dimensions(source);
    return true;
  }

  clearPlate() {
    this._plateValid = false;
    if (this._state === 'visible') this._plate = null;
    else this._setState('recovery');
  }

  toggle(source: CanvasImageSource, mask: PersonMask | null | undefined, timestamp = performance.now()) {
    if (this._destroyed || !['visible', 'hidden'].includes(this._state) || !this.hasPlate || !validMask(mask) || !Number.isFinite(timestamp)) return false;
    if (!mask.data.some(alpha => alpha > 100)) return false;
    const size = dimensions(source);
    if (size.width !== this._sourceDimensions!.width || size.height !== this._sourceDimensions!.height) {
      this.clearPlate();
      return false;
    }
    this._activeOptions = { ...this._options };
    this._prepareSnapshot(source, mask);
    this._start = timestamp;
    this._duration = this._activeOptions.reducedMotion ? 180 : this._activeOptions.duration;
    this._setState(this._state === 'visible' ? 'vanishing' : 'returning');
    return true;
  }

  _prepareSnapshot(source: CanvasImageSource, mask: PersonMask) {
    const width = this.canvas.width;
    const height = this.canvas.height;
    this._snapshot = canvasFor(this.canvas, width, height);
    const snapshotContext = this._snapshot.getContext('2d', { willReadFrequently: true }) as DrawContext;
    const crop = drawCover(snapshotContext, source, width, height);
    const rawMask = canvasFor(this.canvas, mask.width, mask.height);
    const rawContext = rawMask.getContext('2d') as DrawContext;
    const rawPixels = rawContext.createImageData(mask.width, mask.height);
    for (let i = 0; i < mask.data.length; i++) {
      rawPixels.data[i * 4] = rawPixels.data[i * 4 + 1] = rawPixels.data[i * 4 + 2] = 255;
      rawPixels.data[i * 4 + 3] = mask.data[i];
    }
    rawContext.putImageData(rawPixels, 0, 0);
    const mw = Math.min(320, width);
    const mh = Math.max(1, Math.round(mw * height / width));
    this._erosion = canvasFor(this.canvas, mw, mh);
    this._erosionContext = this._erosion.getContext('2d', { willReadFrequently: true }) as DrawContext;
    this._erosionContext.drawImage(rawMask, crop.sx / crop.width * mask.width, crop.sy / crop.height * mask.height, crop.sw / crop.width * mask.width, crop.sh / crop.height * mask.height, 0, 0, mw, mh);
    const scaled = this._erosionContext.getImageData(0, 0, mw, mh);
    this._baseAlpha = new Uint8Array(mw * mh);
    this._phases = new Float32Array(mw * mh);
    this._erosionPixels = this._erosionContext.createImageData(mw, mh);
    let seed = 21817;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < this._baseAlpha.length; i++) {
      const x = (i % mw) / mw;
      const y = Math.floor(i / mw) / mh;
      const directional = this._activeOptions.direction === 'left' ? 1 - x : this._activeOptions.direction === 'up' ? 1 - y : x;
      this._baseAlpha[i] = scaled.data[i * 4 + 3];
      this._phases[i] = 0.12 + directional * 0.68 + random() * 0.12;
      const j = i * 4;
      this._erosionPixels.data[j] = this._erosionPixels.data[j + 1] = this._erosionPixels.data[j + 2] = 255;
    }
    this._foreground = canvasFor(this.canvas, width, height);
    this._foregroundContext = this._foreground.getContext('2d') as DrawContext;
    const image = snapshotContext.getImageData(0, 0, width, height);
    const max = this._activeOptions.effect === 'smoke' ? Math.min(this._activeOptions.density, 650) : this._activeOptions.density;
    this._particles = [];
    for (let attempt = 0; this._particles.length < max && attempt < max * 14; attempt++) {
      const x = random() * width;
      const y = random() * height;
      const index = Math.min(mw * mh - 1, Math.floor(y / height * mh) * mw + Math.floor(x / width * mw));
      if (this._baseAlpha[index] < 130) continue;
      const pixel = (Math.floor(y) * width + Math.floor(x)) * 4;
      let color = [image.data[pixel], image.data[pixel + 1], image.data[pixel + 2]];
      const tint = COLORS[this._activeOptions.palette] || (this._activeOptions.palette === 'prism' || this._activeOptions.effect === 'confetti' ? [COLORS.mint, COLORS.violet, COLORS.stardust][Math.floor(random() * 3)] : null);
      if (tint) color = color.map((value, channel) => Math.round(value * 0.3 + tint[channel] * 0.7));
      const direction = this._activeOptions.direction === 'left' ? -1 : 1;
      this._particles.push({ x, y, phase: this._phases[index], vx: direction * (width * (0.12 + random() * 0.56)), vy: -height * (0.1 + random() * 0.55), curl: random() * Math.PI * 2, radius: 0.7 + random() * 1.8, spin: (random() - 0.5) * 16, color: `rgb(${color.join(',')})` });
    }
  }

  _drawSafe() {
    const { context, canvas } = this;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = 'source-over';
    context.globalAlpha = 1;
    if (this._plate) context.drawImage(this._plate, 0, 0, canvas.width, canvas.height);
    else {
      context.fillStyle = '#090D19';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  render(source: CanvasImageSource, _mask: PersonMask | null | undefined, timestamp = performance.now()) {
    if (this._destroyed) return;
    const animated = this._state === 'vanishing' || this._state === 'returning';
    const started = performance.now();
    try {
      const size = dimensions(source);
      if (this.hasPlate && size.width && (size.width !== this._sourceDimensions!.width || size.height !== this._sourceDimensions!.height)) this.clearPlate();
      this.context.setTransform(1, 0, 0, 1, 0, 0);
      this.context.globalCompositeOperation = 'source-over';
      this.context.globalAlpha = 1;
      if (this._state === 'visible') {
        drawCover(this.context, source, this.canvas.width, this.canvas.height);
        return;
      }
      this._drawSafe();
      if (this._state === 'hidden' || this._state === 'recovery') return;
      const t = clamp((timestamp - this._start) / this._duration, 0, 1);
      const p = this._state === 'vanishing' ? t : 1 - t;
      if (t >= 1) {
        const next = this._state === 'vanishing' ? 'hidden' : 'visible';
        this._setState(next);
        this._particles = [];
        this._snapshot = null;
        if (next === 'visible') drawCover(this.context, source, this.canvas.width, this.canvas.height);
        return;
      }
      this._drawForeground(p);
      if (!this._activeOptions.reducedMotion) this._drawParticles(p);
    } catch (error) {
      try { this._setState('recovery'); } catch { /* Preserve the original frame error. */ }
      try { this._drawSafe(); } catch { /* The last delivered safe frame remains on the output. */ }
      throw error;
    } finally {
      if (animated && !this._activeOptions.reducedMotion) this._budget.observe(performance.now() - started);
    }
  }

  _drawForeground(progress: number) {
    if (this._activeOptions.reducedMotion) {
      const foreground = this._foregroundContext!;
      foreground.clearRect(0, 0, this.canvas.width, this.canvas.height);
      foreground.globalCompositeOperation = 'source-over';
      foreground.drawImage(this._snapshot!, 0, 0);
      for (let i = 0; i < this._baseAlpha!.length; i++) this._erosionPixels!.data[i * 4 + 3] = this._baseAlpha![i];
      this._erosionContext!.putImageData(this._erosionPixels!, 0, 0);
      foreground.globalCompositeOperation = 'destination-in';
      foreground.drawImage(this._erosion!, 0, 0, this.canvas.width, this.canvas.height);
      foreground.globalCompositeOperation = 'source-over';
      this.context.globalAlpha = 1 - progress;
      this.context.drawImage(this._foreground!, 0, 0);
      this.context.globalAlpha = 1;
      return;
    }
    for (let i = 0; i < this._baseAlpha!.length; i++) this._erosionPixels!.data[i * 4 + 3] = Math.round(this._baseAlpha![i] * clamp((this._phases![i] - progress) / 0.11 + 0.5, 0, 1));
    this._erosionContext!.putImageData(this._erosionPixels!, 0, 0);
    const foreground = this._foregroundContext!;
    foreground.clearRect(0, 0, this.canvas.width, this.canvas.height);
    foreground.globalCompositeOperation = 'source-over';
    foreground.drawImage(this._snapshot!, 0, 0);
    foreground.globalCompositeOperation = 'destination-in';
    foreground.drawImage(this._erosion!, 0, 0, this.canvas.width, this.canvas.height);
    foreground.globalCompositeOperation = 'source-over';
    this.context.drawImage(this._foreground!, 0, 0);
  }

  _drawParticles(progress: number) {
    const context = this.context;
    const effect = this._activeOptions.effect;
    const count = this._budget.particleCount(this._particles.length);
    for (let index = 0; index < count; index++) {
      const particle = this._particles[Math.floor(index * this._particles.length / count)];
      const elapsed = (progress - particle.phase) / (1 - particle.phase);
      if (elapsed <= 0 || elapsed >= 1) continue;
      const age = Math.sqrt(elapsed);
      const alpha = Math.pow(1 - elapsed, 1.5) * Math.min(1, elapsed * 13);
      let x = particle.x + particle.vx * age;
      let y = particle.y + particle.vy * age + Math.sin(age * 5 + particle.curl) * age * 22;
      context.fillStyle = particle.color;
      context.globalAlpha = alpha;
      if (effect === 'pixel') {
        x = Math.round(x / 5) * 5;
        y = Math.round(y / 5) * 5;
        const size = (particle.radius + 1.5) * 1.5;
        context.fillRect(x, y, size, size);
      } else if (effect === 'confetti') {
        y += elapsed * elapsed * this.canvas.height * 0.45;
        const rotation = particle.spin * age;
        context.setTransform(Math.cos(rotation), Math.sin(rotation), -Math.sin(rotation), Math.cos(rotation), x, y);
        context.fillRect(-particle.radius, -particle.radius, particle.radius * 2.2, particle.radius * 3.5);
        context.setTransform(1, 0, 0, 1, 0, 0);
      } else if (effect === 'smoke') {
        context.globalAlpha = alpha * 0.075;
        context.beginPath();
        context.arc(x, y, particle.radius * (5 + age * 10), 0, Math.PI * 2);
        context.fill();
      } else context.fillRect(x, y, particle.radius, particle.radius);
    }
    context.globalAlpha = 1;
    context.setTransform(1, 0, 0, 1, 0, 0);
  }

  recover() {
    if (this._destroyed) return;
    this._snapshot = null;
    this._particles = [];
    this._plateValid = false;
    this._plate = null;
    this._setState('visible');
  }

  destroy() {
    this._destroyed = true;
    this._snapshot = null;
    this._plate = null;
    this._particles = [];
    this._baseAlpha = null;
    this._phases = null;
    this._erosionPixels = null;
    this._erosion = this._foreground = null;
    this._plateValid = false;
  }
}
