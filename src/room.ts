export interface PersonMask { data: Uint8Array; width: number; height: number }
type Surface = OffscreenCanvas;
type Context = OffscreenCanvasRenderingContext2D;

export function validMask(mask: unknown): mask is PersonMask {
  const value = mask as PersonMask | null | undefined;
  return Boolean(value && Number.isInteger(value.width) && Number.isInteger(value.height) && value.width > 0 && value.height > 0 && value.width * value.height <= 1 << 20 && value.data instanceof Uint8Array && value.data.length === value.width * value.height);
}

// Marks pixels that are safely background: the person, grown by `radius`, is excluded.
export function backgroundOf(mask: PersonMask, radius: number, threshold = 26): Uint8Array {
  const { width, height, data } = mask;
  const horizontal = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    let count = 0;
    const row = y * width;
    for (let x = -radius; x < width; x++) {
      const enter = x + radius;
      if (enter < width && data[row + enter] > threshold) count++;
      const leave = x - radius - 1;
      if (leave >= 0 && data[row + leave] > threshold) count--;
      if (x >= 0) horizontal[row + x] = count > 0 ? 1 : 0;
    }
  }
  const background = new Uint8Array(width * height);
  for (let x = 0; x < width; x++) {
    let count = 0;
    for (let y = -radius; y < height; y++) {
      const enter = y + radius;
      if (enter < height && horizontal[enter * width + x]) count++;
      const leave = y - radius - 1;
      if (leave >= 0 && horizontal[leave * width + x]) count--;
      if (y >= 0) background[y * width + x] = count > 0 ? 0 : 1;
    }
  }
  return background;
}

function bilinear(level: { w: number; h: number; c: Float32Array }, x: number, y: number, out: number[]) {
  const x0 = Math.max(0, Math.min(level.w - 1, Math.floor(x))), y0 = Math.max(0, Math.min(level.h - 1, Math.floor(y)));
  const x1 = Math.min(level.w - 1, x0 + 1), y1 = Math.min(level.h - 1, y0 + 1);
  const fx = Math.max(0, Math.min(1, x - x0)), fy = Math.max(0, Math.min(1, y - y0));
  out[0] = out[1] = out[2] = 0;
  let total = 0;
  for (const [px, py, weight] of [[x0, y0, (1 - fx) * (1 - fy)], [x1, y0, fx * (1 - fy)], [x0, y1, (1 - fx) * fy], [x1, y1, fx * fy]]) {
    const j = (py * level.w + px) * 4;
    const alpha = level.c[j + 3];
    if (!(alpha > 0) || !(weight > 0)) continue;
    for (let k = 0; k < 3; k++) out[k] += level.c[j + k] / alpha * weight;
    total += weight;
  }
  if (total > 0) for (let k = 0; k < 3; k++) out[k] /= total;
}

// Push-pull hole filling on premultiplied RGBA: every pixel ends opaque, known pixels keep their colour.
export function fillHoles(rgba: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const levels: { w: number; h: number; c: Float32Array }[] = [];
  let w = width, h = height;
  let c = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = rgba[i * 4 + 3] / 255;
    c[i * 4] = rgba[i * 4] * a; c[i * 4 + 1] = rgba[i * 4 + 1] * a; c[i * 4 + 2] = rgba[i * 4 + 2] * a; c[i * 4 + 3] = a;
  }
  levels.push({ w, h, c });
  while (w > 1 || h > 1) {
    const nw = Math.max(1, Math.ceil(w / 2)), nh = Math.max(1, Math.ceil(h / 2));
    const next = new Float32Array(nw * nh * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const from = (y * w + x) * 4, to = ((y >> 1) * nw + (x >> 1)) * 4;
      for (let k = 0; k < 4; k++) next[to + k] += c[from + k];
    }
    for (let i = 0; i < nw * nh; i++) {
      const a = next[i * 4 + 3];
      if (a > 1) for (let k = 0; k < 4; k++) next[i * 4 + k] /= a;
    }
    levels.push({ w: nw, h: nh, c: next });
    w = nw; h = nh; c = next;
  }
  for (let level = levels.length - 2; level >= 0; level--) {
    const fine = levels[level], coarse = levels[level + 1];
    const sample = [0, 0, 0];
    for (let y = 0; y < fine.h; y++) for (let x = 0; x < fine.w; x++) {
      const i = (y * fine.w + x) * 4;
      const a = Math.min(1, fine.c[i + 3]);
      const scale = fine.c[i + 3] > 0 ? a / fine.c[i + 3] : 0;
      bilinear(coarse, (x + 0.5) / 2 - 0.5, (y + 0.5) / 2 - 0.5, sample);
      for (let k = 0; k < 3; k++) fine.c[i + k] = fine.c[i + k] * scale + sample[k] * (1 - a);
      fine.c[i + 3] = 1;
    }
  }
  const out = new Uint8ClampedArray(width * height * 4);
  const base = levels[0].c;
  for (let i = 0; i < width * height; i++) {
    out[i * 4] = base[i * 4]; out[i * 4 + 1] = base[i * 4 + 1]; out[i * 4 + 2] = base[i * 4 + 2]; out[i * 4 + 3] = 255;
  }
  return out;
}

const surface = (width: number, height: number): [Surface, Context] => {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: false });
  if (!context) throw new Error('This browser cannot create a 2D canvas.');
  return [canvas, context];
};

export class RoomModel {
  readonly width: number;
  readonly height: number;
  private readonly plate: Surface;
  private readonly plateContext: Context;
  private readonly scratch: Surface;
  private readonly scratchContext: Context;
  private weights: Surface | null = null;
  private seen: Uint8Array | null = null;
  private seenCount = 0;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    [this.plate, this.plateContext] = surface(width, height);
    [this.scratch, this.scratchContext] = surface(width, height);
  }

  get coverage() { return this.seen ? this.seenCount / this.seen.length : 0; }

  learn(frame: CanvasImageSource, mask: PersonMask) {
    if (!this.seen || this.seen.length !== mask.data.length || this.weights?.width !== mask.width || this.weights.height !== mask.height) {
      this.seen = new Uint8Array(mask.data.length);
      this.seenCount = 0;
      this.weights = new OffscreenCanvas(mask.width, mask.height);
    }
    const background = backgroundOf(mask, Math.max(2, Math.round(mask.width / 50)));
    const context = this.weights.getContext('2d') as Context;
    const pixels = context.createImageData(mask.width, mask.height);
    for (let i = 0; i < background.length; i++) {
      if (!background[i]) continue;
      // First sight paints fully; later sightings blend so lighting drifts smoothly.
      pixels.data[i * 4 + 3] = this.seen[i] ? 72 : 255;
      if (!this.seen[i]) { this.seen[i] = 1; this.seenCount++; }
    }
    context.putImageData(pixels, 0, 0);
    const scratch = this.scratchContext;
    scratch.globalCompositeOperation = 'copy';
    scratch.drawImage(frame, 0, 0, this.width, this.height);
    scratch.globalCompositeOperation = 'destination-in';
    scratch.imageSmoothingEnabled = true;
    scratch.drawImage(this.weights, 0, 0, this.width, this.height);
    scratch.globalCompositeOperation = 'source-over';
    this.plateContext.drawImage(this.scratch, 0, 0);
  }

  // A full-frame room image: learned pixels, with never-seen areas filled from their surroundings.
  complete(): Surface {
    const [result, context] = surface(this.width, this.height);
    const sw = Math.min(160, this.width), sh = Math.max(1, Math.round(sw * this.height / this.width));
    const [small, smallContext] = surface(sw, sh);
    smallContext.drawImage(this.plate, 0, 0, sw, sh);
    const pixels = smallContext.getImageData(0, 0, sw, sh);
    pixels.data.set(fillHoles(pixels.data, sw, sh));
    smallContext.putImageData(pixels, 0, 0);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.filter = `blur(${Math.max(2, Math.round(this.width / 160))}px)`;
    context.drawImage(small, 0, 0, this.width, this.height);
    context.filter = 'none';
    // Feather the learned area into the filled area so no seam shows.
    const [edge, edgeContext] = surface(this.width, this.height);
    edgeContext.filter = `blur(${Math.max(3, Math.round(this.width / 90))}px)`;
    edgeContext.drawImage(this.plate, 0, 0);
    edgeContext.filter = 'none';
    edgeContext.globalCompositeOperation = 'source-in';
    edgeContext.drawImage(this.plate, 0, 0);
    context.drawImage(edge, 0, 0);
    return result;
  }
}
