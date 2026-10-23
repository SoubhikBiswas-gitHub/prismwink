type Pose = 'pinch' | 'snapped';
interface Grain { x: number; y: number; color: string; phase: number; vx: number; vy: number; size: number }

const W = 300, H = 150;
const LOOP = 8000;
const SNAP_AT = 1400, DISSOLVE = [1500, 4400], HIDDEN_CHIP = [4200, 5700], RETURN = [5600, 7300], RELAX_AT = 7600;
const PINCH = { x: 199, y: 71 };
const SKIN = '#f0c6a6', SKIN_EDGE = '#c98d72', HAIR = '#3a241d', SLEEVE = '#a48ff2';

const svg = (body: string, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 300" width="600" height="300"><defs>${defs}</defs>${body}</svg>`;
const finger = (d: string) => `<path d="${d}" fill="none" stroke="${SKIN_EDGE}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${SKIN}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`;

const ROOM = svg(`
  <rect width="600" height="300" fill="url(#wall)"/>
  <rect x="44" y="38" width="128" height="116" rx="8" fill="#38446e"/>
  <rect x="53" y="47" width="110" height="98" rx="4" fill="url(#sky)"/>
  <circle cx="138" cy="70" r="11" fill="#f6f1dc"/><circle cx="133" cy="67" r="10" fill="#22305f" opacity=".35"/>
  <g fill="#e8edff"><circle cx="72" cy="62" r="1.6"/><circle cx="96" cy="80" r="1.2"/><circle cx="116" cy="58" r="1.4"/><circle cx="84" cy="118" r="1.1"/><circle cx="150" cy="120" r="1.3"/></g>
  <path d="M108 47 V145 M53 96 H163" stroke="#38446e" stroke-width="6"/>
  <path d="M74 226 H122 L116 262 H80 Z" fill="#c98b5e"/><rect x="70" y="220" width="56" height="10" rx="3" fill="#b07548"/>
  <g fill="#3f8f6b"><ellipse cx="80" cy="196" rx="12" ry="26" transform="rotate(-28 80 196)"/><ellipse cx="114" cy="192" rx="12" ry="27" transform="rotate(26 114 192)"/></g>
  <g fill="#5fb38a"><ellipse cx="98" cy="182" rx="11" ry="32"/><ellipse cx="66" cy="214" rx="9" ry="20" transform="rotate(-58 66 214)"/><ellipse cx="130" cy="212" rx="9" ry="19" transform="rotate(56 130 212)"/></g>
  <path d="M98 216 V160 M98 214 C90 200 82 196 80 196 M98 214 C106 200 112 194 114 192" stroke="#2f6f53" stroke-width="2.5" fill="none"/>
  <rect x="436" y="56" width="58" height="44" rx="4" fill="#38446e"/><rect x="442" y="62" width="46" height="32" rx="2" fill="#4c6a92"/>
  <path d="M442 94 L458 76 L468 86 L476 78 L488 94 Z" fill="#8fb0d6"/>
  <rect x="300" y="0" width="300" height="300" fill="url(#glow)"/>
  <path d="M512 92 H562 L576 132 H498 Z" fill="#f6dca0"/><path d="M512 92 H562 L566 104 H508 Z" fill="#fff1c9" opacity=".7"/>
  <rect x="535" y="132" width="5" height="132" rx="2" fill="#c9a25c"/><rect x="515" y="260" width="45" height="7" rx="3.5" fill="#b38a45"/>
`, `
  <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#232d52"/><stop offset="1" stop-color="#151b34"/></linearGradient>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f1838"/><stop offset="1" stop-color="#2c3d74"/></linearGradient>
  <radialGradient id="glow" cx="537" cy="120" r="190" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffd68c" stop-opacity=".5"/><stop offset=".45" stop-color="#ffd68c" stop-opacity=".14"/><stop offset="1" stop-color="#ffd68c" stop-opacity="0"/></radialGradient>
`);

function person(pose: Pose) {
  const middle = pose === 'pinch' ? 'M421 147 L413 133 L399 141' : 'M421 147 L416 140 L413 152';
  const thumb = pose === 'pinch' ? 'M408 164 L397 155 L398 144' : 'M408 164 L398 151 L396 135';
  return svg(`
    <path d="M256 124 C246 72 296 50 330 64 C360 78 356 124 350 162 C347 178 338 188 326 190 L274 190 C260 188 254 176 254 160 Z" fill="${HAIR}"/>
    <rect x="287" y="148" width="26" height="40" rx="9" fill="#d99c7e"/>
    <path d="M194 300 C196 226 236 192 300 188 C364 192 404 226 406 300 Z" fill="url(#sweater)"/>
    <path d="M274 191 Q300 210 326 191" fill="none" stroke="#7d66d4" stroke-width="6" stroke-linecap="round"/>
    <path d="M372 228 L432 262 L421 186" fill="none" stroke="${SLEEVE}" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M407 186 L435 184" stroke="#8a72e0" stroke-width="9" stroke-linecap="round"/>
    <ellipse cx="420" cy="161" rx="14" ry="16" fill="${SKIN}" stroke="${SKIN_EDGE}" stroke-width="1.5"/>
    ${finger('M432 152 L439 137')}${finger('M426 147 L429 127')}${finger('M415 148 L414 124')}${finger(middle)}${finger(thumb)}
    <ellipse cx="300" cy="121" rx="32" ry="39" fill="${SKIN}"/>
    <ellipse cx="268" cy="126" rx="5" ry="8" fill="#e3ad8f"/><ellipse cx="332" cy="126" rx="5" ry="8" fill="#e3ad8f"/>
    <path d="M267 120 C264 78 334 72 335 114 C318 94 292 92 269 124 Z" fill="${HAIR}"/>
    <path d="M281 113 Q288 109 295 112 M305 112 Q312 109 319 113" stroke="${HAIR}" stroke-width="2.6" stroke-linecap="round" fill="none"/>
    <ellipse cx="288" cy="124" rx="3.2" ry="3.8" fill="#2a1a15"/><ellipse cx="312" cy="124" rx="3.2" ry="3.8" fill="#2a1a15"/>
    <circle cx="281" cy="137" r="5.5" fill="#f08f86" opacity=".35"/><circle cx="319" cy="137" r="5.5" fill="#f08f86" opacity=".35"/>
    <path d="M290 141 Q300 150 310 141" stroke="#b0574a" stroke-width="2.6" stroke-linecap="round" fill="none"/>
  `, `<linearGradient id="sweater" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bba8ff"/><stop offset="1" stop-color="#8a72e0"/></linearGradient>`);
}

const DESK = svg(`
  <rect x="0" y="268" width="600" height="32" fill="#2a2140"/><rect x="0" y="266" width="600" height="4" fill="#3d3260"/>
  <rect x="118" y="238" width="26" height="30" rx="5" fill="#79e8d0"/><path d="M144 246 C156 246 156 262 144 262" stroke="#79e8d0" stroke-width="4" fill="none"/>
  <path d="M126 230 C122 222 132 218 128 210 M136 230 C132 222 142 218 138 210" stroke="#e8edff" stroke-width="2" stroke-linecap="round" fill="none" opacity=".35"/>
`);

function load(markup: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Demo artwork failed to load.'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  });
}

function surface(image: HTMLImageElement, scale: number) {
  const canvas = new OffscreenCanvas(W * scale, H * scale);
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0, W * scale, H * scale);
  return canvas;
}

const ease = (t: number) => 1 - (1 - t) * (1 - t);
const progress = (time: number, [start, end]: number[]) => Math.min(1, Math.max(0, (time - start) / (end - start)));

// Plays the snap, dust, hidden and return story in a loop; returns a stop function.
export function startDemo(canvas: HTMLCanvasElement, reducedMotion: boolean): () => void {
  let stopped = false;
  let frame = 0;
  const scale = Math.min(3, devicePixelRatio || 1);
  canvas.width = W * scale;
  canvas.height = H * scale;
  const context = canvas.getContext('2d');
  if (!context) return () => {};
  Promise.all([load(ROOM), load(person('pinch')), load(person('snapped')), load(DESK)]).then(([roomImage, pinchImage, snappedImage, deskImage]) => {
    if (stopped) return;
    const room = surface(roomImage, scale), pinch = surface(pinchImage, scale), snapped = surface(snappedImage, scale), desk = surface(deskImage, scale);
    const sample = new OffscreenCanvas(W, H).getContext('2d', { willReadFrequently: true })!;
    sample.drawImage(snappedImage, 0, 0, W, H);
    const pixels = sample.getImageData(0, 0, W, H).data;
    const grains: Grain[] = [];
    let seed = 11;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (pixels[i + 3] < 100 || y > 133) continue;
      // Dust starts at the snapping hand and sweeps across the body.
      grains.push({ x, y, color: `rgb(${pixels[i]},${pixels[i + 1]},${pixels[i + 2]})`, phase: Math.hypot(x - PINCH.x, y - PINCH.y) * 0.85 + random() * 22, vx: 34 + random() * 70, vy: -16 - random() * 34, size: 0.8 + random() * 1.1 });
    }
    const near = Math.min(...grains.map((grain) => grain.phase)), far = Math.max(...grains.map((grain) => grain.phase));
    for (const grain of grains) grain.phase = 0.02 + (grain.phase - near) / (far - near) * 0.7;
    const lastPhase = grains.reduce((max, grain) => Math.max(max, grain.phase), 0);
    const layer = new OffscreenCanvas(W * scale, H * scale);
    const ink = layer.getContext('2d')!;
    ink.scale(scale, scale);

    const draw = (now: number) => {
      if (stopped) return;
      const time = reducedMotion ? 0 : now % LOOP;
      const dissolving = time >= DISSOLVE[0] && time < RETURN[1];
      const q = time < DISSOLVE[0] ? 0 : time < DISSOLVE[1] ? progress(time, DISSOLVE) : time < RETURN[0] ? 1 : time < RETURN[1] ? 1 - ease(progress(time, RETURN)) : 0;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.drawImage(room, 0, 0);
      context.setTransform(scale, 0, 0, scale, 0, 0);
      const pose = time >= SNAP_AT && time < RELAX_AT ? snapped : pinch;
      if (!dissolving || q === 0) context.drawImage(pose, 0, 0, W, H);
      else {
        ink.globalCompositeOperation = 'copy';
        ink.drawImage(snapped, 0, 0, W, H);
        ink.globalCompositeOperation = 'source-atop';
        for (const grain of grains) {
          const ahead = grain.phase - q * 1.08;
          if (ahead > 0 && ahead < 0.1) { ink.globalAlpha = (1 - ahead / 0.1) * 0.75; ink.fillStyle = '#4a3f3a'; ink.fillRect(grain.x, grain.y, 1, 1); }
        }
        ink.globalAlpha = 1;
        ink.globalCompositeOperation = 'destination-out';
        for (const grain of grains) if (q * 1.08 > grain.phase) ink.fillRect(grain.x - 0.6, grain.y - 0.6, 2.2, 2.2);
        if (q * 1.08 <= lastPhase) context.drawImage(layer, 0, 0, W, H);
        for (const grain of grains) {
          const age = (q * 1.08 - grain.phase) / 0.3;
          if (age <= 0 || age >= 1) continue;
          const travel = ease(age);
          context.globalAlpha = Math.pow(1 - age, 1.3);
          context.fillStyle = age < 0.35 ? grain.color : '#6a5f5a';
          context.fillRect(grain.x + grain.vx * travel, grain.y + grain.vy * travel + Math.sin(age * 6 + grain.phase * 30) * 3 * age, grain.size, grain.size);
        }
        context.globalAlpha = 1;
      }
      const spark = progress(time, [SNAP_AT, SNAP_AT + 380]);
      if (spark > 0 && spark < 1) {
        context.strokeStyle = '#f4cc81';
        context.lineWidth = 1.2;
        context.lineCap = 'round';
        context.globalAlpha = 1 - spark;
        for (let ray = 0; ray < 8; ray++) {
          const angle = ray * Math.PI / 4 + 0.3, inner = 3 + spark * 6, outer = 6 + spark * 11;
          context.beginPath();
          context.moveTo(PINCH.x + Math.cos(angle) * inner, PINCH.y + Math.sin(angle) * inner);
          context.lineTo(PINCH.x + Math.cos(angle) * outer, PINCH.y + Math.sin(angle) * outer);
          context.stroke();
        }
        context.globalAlpha = 1;
      }
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.drawImage(desk, 0, 0);
      context.setTransform(scale, 0, 0, scale, 0, 0);
      const chip = Math.min(progress(time, [HIDDEN_CHIP[0], HIDDEN_CHIP[0] + 250]), 1 - progress(time, [HIDDEN_CHIP[1] - 250, HIDDEN_CHIP[1]]));
      if (chip > 0) {
        context.globalAlpha = chip;
        context.fillStyle = 'rgba(9,13,25,.78)';
        context.beginPath();
        context.roundRect(10, 10, 112, 22, 11);
        context.fill();
        context.fillStyle = '#b6a0ff';
        context.beginPath();
        context.arc(22, 21, 3.5, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#f4f5fc';
        context.font = '600 10.5px Manrope, system-ui, sans-serif';
        context.textBaseline = 'middle';
        context.fillText('Hidden · mic muted', 31, 21.5);
        context.globalAlpha = 1;
      }
      if (!reducedMotion) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
  }).catch(() => {});
  return () => { stopped = true; cancelAnimationFrame(frame); };
}
