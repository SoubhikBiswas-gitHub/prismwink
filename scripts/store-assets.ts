import { chromium } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const destination = path.join(root, 'store/graphics');
const popup = (await readFile(path.join(root, 'test-results/popup-current.png'))).toString('base64');
const icon = (await readFile(path.join(root, 'public/assets/icons/icon-128.png'))).toString('base64');
const display = (await readFile(path.join(root, 'public/assets/fonts/bricolage.ttf'))).toString('base64');
const text = (await readFile(path.join(root, 'public/assets/fonts/manrope.ttf'))).toString('base64');
await mkdir(destination, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const variants = [
    { name: '01-controls.png', width: 1280, height: 800, small: false, headline: 'One gesture.<br>A little camera magic.', description: 'Snap or double clap to vanish and mute.<br>Do it again to return.', capture: true },
    { name: 'promo-small.png', width: 440, height: 280, small: true, headline: 'Snap. Vanish.<br>Come back.', description: 'Camera magic for Google Meet', capture: false },
    { name: 'promo-marquee.png', width: 1400, height: 560, small: false, headline: 'Snap to vanish.<br>Snap to come back.', description: 'A dust effect and microphone control<br>for Google Meet.', capture: true },
  ];
  const moments = [
    { name: '02-vanish.png', title: 'Need a moment? Snap.', subtitle: 'Dissolve into dust and mute your microphone in Google Meet.', source: 'vanish-midway.png', wide: true, note: 'Actual extension output captured in a local camera test with a sample image.' },
    { name: '03-return.png', title: 'Back? Reappear in a snap.', subtitle: 'Snap or double clap again to return to your camera.', source: 'return-midway.png', wide: true, note: 'Actual extension output captured in a local camera test with a sample image.' },
    { name: '04-gestures.png', title: 'Can’t snap? Clap twice.', subtitle: 'Choose snap, visual double clap, or the keyboard shortcut.\nTurn either gesture on or off in the popup.', source: 'popup-current.png', wide: false, note: 'Actual extension popup. Its effect preview is illustrated. Both hands must be visible for double clap.' },
    { name: '05-microphone.png', title: 'Muted before?\nMuted after.', subtitle: 'Prismwink restores only a mic it muted.\nYour own microphone changes stay in your hands.', source: 'popup-current.png', wide: false, note: 'Actual extension popup. Its effect preview is illustrated. Camera processing runs on your device.' },
  ];
  for (const moment of moments) {
    const capture = (await readFile(path.join(root, 'test-results', moment.source))).toString('base64');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
      @font-face{font-family:Display;src:url(data:font/ttf;base64,${display})} @font-face{font-family:Text;src:url(data:font/ttf;base64,${text})}
      *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:#090d19;color:#f4f5fc}body{font-family:Text,sans-serif;padding:36px 56px}
      header{display:flex;align-items:center;gap:12px;color:#b6a0ff;font-size:22px;font-weight:700}header img{width:36px;height:36px}.number{margin-left:auto;color:#a6b1ca;font-size:14px;letter-spacing:2px}
      main{display:flex;align-items:center;gap:64px;height:650px}.copy{flex:1}h1{font-family:Display,sans-serif;font-size:62px;line-height:1.06;letter-spacing:-1.5px;font-weight:650;margin:0 0 26px;white-space:pre-line}p{color:#a6b1ca;font-size:23px;line-height:1.6;white-space:pre-line;margin:0}.note{font-size:13px;line-height:1.5;color:#a6b1ca;position:absolute;bottom:25px;left:56px;right:56px}
      .capture{height:624px;width:auto;border-radius:18px;border:1px solid #2e3850;flex:none}
      body.wide main{display:block;height:auto}body.wide h1{font-size:47px;margin:22px 0 8px}body.wide p{font-size:20px}body.wide .capture{display:block;width:870px;height:auto;margin:22px auto 0;border-radius:16px}
    </style></head><body class="${moment.wide ? 'wide' : ''}"><header><img src="data:image/png;base64,${icon}" alt="">Prismwink<span class="number">CAMERA MAGIC FOR GOOGLE MEET</span></header><main><section class="copy"><h1>${moment.title}</h1><p>${moment.subtitle}</p></section><img class="capture" src="data:image/png;base64,${capture}" alt="Current Prismwink ${moment.wide ? 'camera effect' : 'popup controls'}"></main><div class="note">${moment.note}</div></body></html>`);
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
    await page.screenshot({ path: path.join(destination, moment.name), animations: 'disabled' });
    console.log(`${moment.name}: 1280 x 800`);
  }
  for (const item of variants) {
    await page.setViewportSize({ width: item.width, height: item.height });
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
      @font-face{font-family:Display;src:url(data:font/ttf;base64,${display})} @font-face{font-family:Text;src:url(data:font/ttf;base64,${text})}
      *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:#090d19;color:#f4f5fc}body{font-family:Text,sans-serif;display:flex;align-items:center;justify-content:space-between;padding:${item.small ? '28px 32px' : '48px 72px'};gap:48px}
      .copy{flex:1}.brand{display:flex;align-items:center;gap:12px;color:#b6a0ff;font-size:${item.small ? 18 : 24}px;font-weight:700}.brand img{width:${item.small ? 32 : 48}px;height:auto}
      h1{font-family:Display,sans-serif;font-size:${item.small ? 39 : item.height > 600 ? 61 : 56}px;line-height:1.06;letter-spacing:-1.5px;font-weight:650;margin:${item.small ? 18 : 30}px 0 18px}p{color:#a6b1ca;font-size:${item.small ? 14 : 22}px;line-height:1.6;margin:0}.note{margin-top:28px;font-size:13px;color:#a6b1ca}
      .capture{height:${item.height - 64}px;max-width:47%;object-fit:contain;object-position:center;border-radius:16px;border:1px solid #2e3850;background:#151c2e}
    </style></head><body><section class="copy"><div class="brand"><img src="data:image/png;base64,${icon}" alt="">Prismwink</div><h1>${item.headline}</h1><p>${item.description}</p>${item.capture ? '<p class="note">Actual extension popup shown. Its effect preview is illustrated.</p>' : ''}</section>${item.capture ? `<img class="capture" src="data:image/png;base64,${popup}" alt="Prismwink popup with snap, double clap, shortcut and theme controls">` : ''}</body></html>`);
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
    await page.screenshot({ path: path.join(destination, item.name), animations: 'disabled' });
    console.log(`${item.name}: ${item.width} x ${item.height}`);
  }
} finally { await browser.close(); }
