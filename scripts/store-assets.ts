import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {chromium, type BrowserContext} from '@playwright/test';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'store/graphics');
const source = path.join(root, 'store/source');
await mkdir(output, {recursive:true});
await mkdir(source, {recursive:true});
const temporary = await mkdtemp(path.join(tmpdir(), 'prismwink-artwork-'));
const icon = await readFile(path.join(root, 'public/assets/icon.svg'), 'utf8');
const inner = icon.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const padded = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><g transform="translate(16 16) scale(.75)">${inner}</g></svg>`;
await writeFile(path.join(source, 'store-icon.svg'), padded);
await sharp(Buffer.from(padded)).png().toFile(path.join(output, 'icon-128.png'));
const fonts = await Promise.all(['bricolage','manrope'].map(async name => (await readFile(path.join(root, `public/assets/fonts/${name}.ttf`))).toString('base64')));
const fontCss = `@font-face{font-family:Display;src:url(data:font/ttf;base64,${fonts[0]})}@font-face{font-family:Body;src:url(data:font/ttf;base64,${fonts[1]})}`;
const iconData = `data:image/svg+xml;base64,${Buffer.from(icon).toString('base64')}`;
const pngData = async (name:string) => `data:image/png;base64,${(await readFile(path.join(source, name))).toString('base64')}`;
let context: BrowserContext | undefined;
try {
  context = await chromium.launchPersistentContext(path.join(temporary, 'profile'), {channel:'chromium',headless:true,viewport:{width:1440,height:1080},args:[`--disable-extensions-except=${path.join(root,'dist')}`,`--load-extension=${path.join(root,'dist')}`]});
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).hostname;
  const studio = await context.newPage();
  await studio.goto(`chrome-extension://${id}/studio.html`);
  await studio.locator('#toggle-effect').waitFor();
  await studio.waitForFunction(() => !(document.querySelector('#toggle-effect') as HTMLButtonElement)?.disabled);
  await studio.locator('#dismiss-notice').click();
  await studio.screenshot({path:path.join(source,'studio.png'),fullPage:true});
  await studio.locator('.preview-frame').screenshot({path:path.join(source,'stage.png')});
  await studio.locator('.effect-strip').screenshot({path:path.join(source,'effects.png')});
  await studio.locator('#toggle-effect').click();
  await studio.waitForTimeout(1000);
  await studio.locator('.preview-frame').screenshot({path:path.join(source,'dust.png')});
  await studio.waitForFunction(() => document.querySelector('#visibility-status')?.textContent?.includes('Hidden'));
  await studio.locator('#toggle-effect').click();
  await studio.waitForFunction(() => document.querySelector('#visibility-status')?.textContent?.includes('Visible'));
  await studio.locator('#direction').selectOption('up');
  await studio.locator('#palette').selectOption('prism');
  await studio.locator('.inspector').screenshot({path:path.join(source,'settings.png')});
  for (const name of ['Grand entrance','Quiet break','A little celebration']) {
    await studio.locator('#scene-name').fill(name);
    await studio.getByRole('button',{name:'Save scene',exact:true}).click();
  }
  await studio.locator('.scenes-section').screenshot({path:path.join(source,'scenes.png')});
  await studio.locator('#show-guide').click();
  await studio.locator('.guide').screenshot({path:path.join(source,'guide.png')});
  const art = await context.newPage();
  const stage = await pngData('stage.png');
  const effects = await pngData('effects.png');
  const dust = await pngData('dust.png');
  const settings = await pngData('settings.png');
  const scenes = await pngData('scenes.png');
  const guide = await pngData('guide.png');
  const baseCss = `${fontCss}*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:#090D19;color:#F4F5FC}body{font-family:Body,sans-serif}.card{width:1280px;height:800px;padding:42px 52px;background:radial-gradient(ellipse at 85% 40%,#263054 0,transparent 60%),#090D19;overflow:hidden;position:relative}.brand{display:flex;align-items:center;gap:13px;font:700 25px Display}.brand img{width:40px;height:40px}.eyebrow{margin:30px 0 10px;color:#79E8D0;font-size:14px;font-weight:700;letter-spacing:2px;text-transform:uppercase}h1{font:650 53px/1.06 Display;letter-spacing:-2px;margin:0 0 17px;max-width:1000px}p{color:#A6B1CA;font-size:18px;line-height:1.55;margin:0}.caption{position:absolute;bottom:26px;left:52px;right:52px;font-size:12px;color:#A6B1CA;display:flex;justify-content:space-between}.shot{display:block;border:1px solid #3d4863;border-radius:14px;box-shadow:0 20px 60px #0004}.wide{width:920px;margin:24px auto 0}.strip{display:block;width:920px;margin:12px auto}.two{display:grid;grid-template-columns:650px 1fr;gap:42px;align-items:center;margin-top:26px}.notes{padding:22px;background:#151C2E;border:1px solid #30394d;border-radius:14px}.notes strong{display:block;font:650 25px Display;margin:0 0 10px}.notes p{font-size:17px;margin-bottom:20px}.notes p:last-child{margin-bottom:0}.chip{display:inline-block;padding:7px 12px;background:#2b2847;border:1px solid #645a90;color:#d6caff;border-radius:20px;font-size:13px;margin-right:8px}`;
  const footer = `<div class="caption"><span>Actual Prismwink interface · illustrated studio demo</span><span>Camera access starts only when you choose My camera</span></div>`;
  const brand = `<div class="brand"><img src="${iconData}">Prismwink</div>`;
  const cards = [
    {file:'01-studio.png',title:'Four ways to make an entrance.',tag:'Your camera. Your stage.',body:`<img class="shot wide" style="height:340px;object-fit:cover" src="${stage}"><img class="strip" src="${effects}">`,description:'Four working effects in the permission-free studio demo.'},
    {file:'02-dust.png',title:'Disappear. Return. Make it playful.',tag:'The signature dust dissolve',body:`<div class="two"><img class="shot" style="width:650px" src="${dust}"><div class="notes"><strong>A little magic, on cue.</strong><p>A deliberate thumb–middle-finger pinch and release, a button, or a keyboard shortcut.</p><p>In Meet, vanish gates your outgoing microphone. Return restores only the mute state Prismwink owns.</p><span class="chip">Dust dissolve</span><span class="chip">Reversible</span></div></div>`,description:'The actual demo renderer during a dust transition; microphone behavior is explained in accompanying copy.'},
    {file:'03-settings.png',title:'Make the effect your own.',tag:'Small controls. Plenty of personality.',body:`<div class="two" style="grid-template-columns:1fr 310px"><div><img class="shot" style="width:680px" src="${stage}"><div style="margin-top:22px"><span class="chip">Direction</span><span class="chip">Palette</span><span class="chip">Reduced motion</span><span class="chip">Adaptive detail</span></div></div><img class="shot" style="width:300px;max-height:475px;object-fit:contain;background:#151c2e" src="${settings}"></div>`,description:'Actual direction, palette, detail and reduced-motion controls.'},
    {file:'04-scenes.png',title:'Keep your next act ready.',tag:'Your scenes, saved locally',body:`<div style="margin-top:32px"><img class="shot" style="width:1040px;margin:auto;max-height:390px;object-fit:contain;background:#090d19" src="${scenes}"></div><div style="margin:25px 20px"><span class="chip">Named scenes</span><span class="chip">Favorites</span><span class="chip">Recent effects</span><span class="chip">Import & export</span></div><p style="margin-left:20px">Save an effect combination. Bring it back when the moment fits.</p>`,description:'Actual saved scene controls and named preset examples.'},
    {file:'05-setup.png',title:'Practice first. Feel ready for the call.',tag:'A clear first-run guide',body:`<div class="two" style="grid-template-columns:700px 1fr"><div><img class="shot" style="width:700px" src="${guide}"></div><div class="notes"><strong>Set the stage.</strong><p>Try Demo without permissions. Then open your camera and capture the empty room.</p><p>The room is a still image. Your camera stays active while hidden so return gestures can be detected.</p><p>Manual controls and safe recovery remain available.</p></div></div>`,description:'Actual setup guide with accurate camera and still-room behavior.'},
  ];
  for (const card of cards) {
    await art.setViewportSize({width:1280,height:800});
    await art.setContent(`<!doctype html><meta charset="utf-8"><style>${baseCss}</style><div class="card">${brand}<div class="eyebrow">${card.tag}</div><h1>${card.title}</h1>${card.body}${footer}</div>`);
    await art.evaluate(async () => {await document.fonts.ready;await Promise.all([...document.images].map(image => image.decode()));});
    await art.screenshot({path:path.join(output,card.file)});
  }
  for (const [file,width,height] of [['promo-small.png',440,280],['promo-marquee.png',1400,560]] as const) {
    await art.setViewportSize({width,height});
    const large = width > 500;
    await art.setContent(`<!doctype html><meta charset="utf-8"><style>${fontCss}*{box-sizing:border-box}body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:radial-gradient(ellipse at 68% 25%,#42385f 0,transparent 60%),#090D19;color:#F4F5FC;font-family:Body;display:flex;align-items:center;justify-content:center;gap:${large?70:24}px}.prism{width:${large?300:125}px;transform:rotate(-8deg);filter:drop-shadow(0 25px 30px #0005)}.copy{max-width:${large?680:220}px}.copy strong{display:block;font:700 ${large?76:34}px Display;letter-spacing:-2px}.copy p{font:${large?34:17}px/1.2 Display;color:#B6A0FF;margin:15px 0 0}.dot{position:absolute;width:8px;height:8px;background:#79E8D0;transform:rotate(25deg)}.d1{left:8%;top:20%}.d2{right:10%;top:13%;background:#F4CC81}.d3{right:15%;bottom:17%;background:#B6A0FF}.d4{left:36%;bottom:13%;width:5px;height:5px;background:#F4CC81}</style><i class="dot d1"></i><i class="dot d2"></i><i class="dot d3"></i><i class="dot d4"></i><img class="prism" src="${iconData}"><div class="copy"><strong>Prismwink</strong><p>Put a little magic<br>on camera.</p></div>`);
    await art.evaluate(async () => {await document.fonts.ready;await Promise.all([...document.images].map(image => image.decode()));});
    await art.screenshot({path:path.join(output,file)});
  }
  const assets = [];
  for (const [file,width,height] of [['icon-128.png',128,128],...cards.map(card => [card.file,1280,800] as const),['promo-small.png',440,280],['promo-marquee.png',1400,560]] as const) {
    const metadata = await sharp(path.join(output,String(file))).metadata();
    if (metadata.width !== width || metadata.height !== height) throw new Error(`Incorrect export dimensions: ${file}`);
    assets.push({file:`graphics/${file}`,width,height,kind:String(file).startsWith('0')?'screenshot':String(file).startsWith('icon')?'icon':'promotional'});
  }
  await writeFile(path.join(root,'store/assets.json'),JSON.stringify({product:'Prismwink',assets,notes:cards.map(card => ({file:card.file,description:card.description})),source:'Actual installed extension UI and original repository vector mark; screenshots show the illustrated practice demo.',liveMeetVerified:false},null,2)+'\n');
  const gallery = `<html><head><meta charset="utf-8"><title>Prismwink store assets</title><style>body{background:#090d19;color:#f4f5fc;font:16px sans-serif;padding:32px}main{display:grid;grid-template-columns:repeat(2,minmax(300px,1fr));gap:24px}img{display:block;max-width:100%;border:1px solid #30394d}p{color:#a6b1ca}</style></head><body><h1>Prismwink · Store assets</h1><p>Five actual-product screenshots, store icon, small promo and marquee. All dimensions validated.</p><main>${assets.map(asset=>`<section><p>${asset.file} · ${asset.width}×${asset.height}</p><img src="${asset.file}"></section>`).join('')}</main></body></html>`;
  await writeFile(path.join(root,'store/preview.html'),gallery);
  console.log(`Exported and validated ${assets.length} store images to ${output}`);
} finally { await context?.close();await rm(temporary,{recursive:true,force:true}); }
