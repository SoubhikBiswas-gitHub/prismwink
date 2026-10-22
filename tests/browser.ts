import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {chromium,type BrowserContext} from '@playwright/test';
import {runMeetChecks,type MeetCheck} from './meet-browser';

const root=path.resolve(import.meta.dirname,'..');
const evidence=path.join(root,'test-results');
await mkdir(evidence,{recursive:true});
const temporary=await mkdtemp(path.join(tmpdir(),'prismwink-tests-'));
const fixture=path.join(temporary,'camera.y4m');
const results:MeetCheck[]=[];
let context:BrowserContext|undefined;
const pass=(check:string,detail:string)=>{results.push({check,passed:true,detail});console.log(`PASS ${check}`);};

async function makeCameraFixture(){
  const w=640,h=360;
  const rgb=await sharp(path.join(root,'tests/fixtures/camera-portrait.png')).resize(w,h,{fit:'cover'}).removeAlpha().raw().toBuffer();
  const pixels=w*h,base=Buffer.alloc(pixels*3/2);
  const clamp=(x:number)=>Math.min(255,Math.max(0,Math.round(x)));
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x,j=i*3,r=rgb[j]!,g=rgb[j+1]!,b=rgb[j+2]!;
    base[i]=clamp(16+.257*r+.504*g+.098*b);
    if(x%2===0&&y%2===0){
      let ar=0,ag=0,ab=0;
      for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){const k=((y+dy)*w+x+dx)*3;ar+=rgb[k]!/4;ag+=rgb[k+1]!/4;ab+=rgb[k+2]!/4;}
      const c=(y/2)*(w/2)+x/2;
      base[pixels+c]=clamp(128-.148*ar-.291*ag+.439*ab);
      base[pixels+pixels/4+c]=clamp(128+.439*ar-.368*ag-.071*ab);
    }
  }
  const parts:Buffer[]=[Buffer.from(`YUV4MPEG2 W${w} H${h} F30:1 Ip A1:1 C420jpeg\n`)];
  for(let n=0;n<90;n++){
    const frame=Buffer.from(base),delta=Math.round(25*Math.sin(n*Math.PI/45));
    for(let i=0;i<pixels;i++)frame[i]=Math.min(235,Math.max(16,base[i]!+delta));
    parts.push(Buffer.from('FRAME\n'),frame);
  }
  await writeFile(fixture,Buffer.concat(parts));
}

try{
  await makeCameraFixture();
  context=await chromium.launchPersistentContext(path.join(temporary,'profile'),{
    channel:'chromium',headless:true,viewport:{width:1440,height:1080},
    args:[`--disable-extensions-except=${path.join(root,'dist')}`,`--load-extension=${path.join(root,'dist')}`,'--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',`--use-file-for-fake-video-capture=${fixture}`,'--autoplay-policy=no-user-gesture-required']
  });
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:20000});
  const id=new URL(worker.url()).hostname;
  assert.ok(id,'The installed extension must have a service worker.');
  pass('Manifest V3 extension loads','The built extension loaded in an isolated fresh Chromium profile, with its real background service worker.');
  const page=await context.newPage();
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`chrome-extension://${id}/studio.html`);
  await page.locator('#toggle-effect').waitFor();
  await page.waitForFunction(()=>!(document.getElementById('toggle-effect') as HTMLButtonElement)?.disabled,{},{timeout:10000});
  assert.match(await page.locator('#session-state').innerText(),/Demo.*camera off/);
  await page.locator('#duration').focus();await page.locator('#duration').press('Home');
  for(const effect of ['dust','pixel','confetti','smoke']){
    await page.locator(`[data-effect="${effect}"]`).click();
    await page.locator('#toggle-effect').click();
    await page.waitForFunction(()=>document.getElementById('visibility-status')?.textContent?.includes('Hidden'),null,{timeout:4000});
    await page.locator('#toggle-effect').click();
    await page.waitForFunction(()=>document.getElementById('visibility-status')?.textContent?.includes('Visible'),null,{timeout:4000});
  }
  pass('React studio and four visual effects','The built React page renders and all four demo effects complete disappear/return cycles. Demo is explicitly labeled and has no microphone capture.');
  assert.deepEqual(await page.locator('#recent-effects button').allTextContents(),['Smoke reveal','Confetti','Pixel scatter','Dust dissolve']);
  await page.locator('#direction').selectOption('up');
  assert.match(await page.locator('#quality-status').innerText(),/Full selected detail|Auto: reduced particle detail/);
  pass('Direction, recent effects and quality feedback','Particle flow can be selected, successful effects form a bounded recent-history list, and the studio exposes the real renderer quality state.');
  const hostile='<img src=x onerror=alert(1)>';
  await page.locator('#scene-name').fill(hostile);await page.getByRole('button',{name:'Save scene',exact:true}).click();
  assert.equal(await page.locator('#scene-list img').count(),0);
  assert.ok((await page.locator('#scene-list').innerText()).includes(hostile));
  await page.reload();await page.waitForFunction(()=>document.getElementById('scene-list')?.textContent?.includes('<img src=x'));
  assert.equal(await page.locator('#scene-list img').count(),0);
  assert.equal(await page.locator('#direction').inputValue(),'up');
  assert.deepEqual(await page.locator('#recent-effects button').allTextContents(),['Smoke reveal','Confetti','Pixel scatter','Dust dissolve']);
  pass('Scenes persist and names stay text','A scene survives reload. A hostile HTML-like name is shown as plain text and does not create an image node.');
  const count=await page.locator('.saved-scene').count();
  await page.locator('#scene-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{broken')});
  await page.waitForFunction(()=>document.getElementById('notice-text')?.textContent?.includes('not valid JSON'));
  assert.equal(await page.locator('.saved-scene').count(),count);
  pass('Malformed scene import rejected','Invalid JSON does not corrupt or replace saved scenes.');
  await Promise.all([page.waitForNavigation({waitUntil:'load',timeout:10000}),page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));})]);
  await page.waitForFunction(()=>!(document.getElementById('toggle-effect') as HTMLButtonElement)?.disabled,null,{timeout:10000});
  assert.match(await page.locator('#session-state').innerText(),/Demo.*camera off/);
  await page.locator('#toggle-effect').click();
  await page.waitForFunction(()=>document.getElementById('visibility-status')?.textContent?.includes('Hidden'),null,{timeout:4000});
  await page.locator('#toggle-effect').click();
  await page.waitForFunction(()=>document.getElementById('visibility-status')?.textContent?.includes('Visible'),null,{timeout:4000});
  pass('Persisted-page lifecycle recovers safely','A persisted pagehide/pageshow event sequence reloads into Demo with camera off and a functioning renderer, rather than leaving closed processing behind a ready-looking UI.');
  await page.getByRole('button',{name:'Clear saved scenes',exact:true}).click();
  await page.locator('#dismiss-notice').click();
  await page.screenshot({path:path.join(evidence,'studio-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile layout must not overflow horizontally.');
  await page.screenshot({path:path.join(evidence,'studio-mobile.png'),fullPage:true});
  pass('Responsive studio','The 390px layout has no horizontal overflow; desktop and mobile screenshots were saved.');
  await page.setViewportSize({width:1440,height:1080});
  await page.locator('#camera-mode').click();
  await page.waitForFunction(()=>document.getElementById('session-state')?.textContent?.includes('Camera · local preview'),null,{timeout:60000});
  await page.locator('#microphone-test').click();
  await page.waitForFunction(()=>document.getElementById('visibility-status')?.textContent?.includes('Mic on locally'),null,{timeout:10000});
  await page.locator('#capture-room').click();
  await page.waitForFunction(()=>document.getElementById('capture-room')?.textContent?.includes('Retake'),null,{timeout:9000});
  await page.locator('#clear-room').click();
  assert.ok(await page.locator('#toggle-effect').isDisabled());
  assert.ok(await page.locator('#clear-room').isDisabled());
  assert.match(await page.locator('#visibility-status').innerText(),/Mic on locally/);
  await page.locator('#capture-room').click();
  await page.waitForFunction(()=>document.getElementById('capture-room')?.textContent?.includes('Retake'),null,{timeout:9000});
  pass('Studio room capture clears independently','Clearing the room disables disappearance without stopping or muting the local camera session; a new clean-room capture enables effects again.');
  await page.locator('#toggle-effect').click();
  await page.waitForFunction(()=>document.getElementById('visibility-status')?.textContent?.includes('Hidden'),null,{timeout:4000});
  assert.match(await page.locator('#visibility-status').innerText(),/Mic off/);
  await page.locator('#microphone-test').click();
  await page.locator('#toggle-effect').click();
  await page.waitForFunction(()=>document.getElementById('visibility-status')?.textContent?.includes('Visible'),null,{timeout:4000});
  assert.match(await page.locator('#visibility-status').innerText(),/Mic off/);
  await page.locator('#stop-camera').click();
  await page.waitForFunction(()=>document.getElementById('session-state')?.textContent?.includes('Demo'));
  assert.equal(await page.locator('#camera-controls').count(),0);
  pass('Studio camera, real processing and mute ownership','A permitted portrait video runs through the actual local vision worker. Camera capture, local mic mute and a keep-muted override work; Stop returns to a hardware-free demo.');
  assert.deepEqual(errors,[],'The studio must not produce uncaught page errors.');
  await page.close();
  results.push(...await runMeetChecks(context));
}catch(error){
  results.push({check:'Browser verification',passed:false,detail:error instanceof Error?`${error.message}\n${error.stack||''}`:String(error)});
}finally{
  await context?.close();
  await writeFile(path.join(evidence,'browser-results.json'),JSON.stringify({timestamp:new Date().toISOString(),checks:results,liveMeetVerified:false},null,2)+'\n');
  await rm(temporary,{recursive:true,force:true});
}
for(const result of results)console.log(`${result.passed?'PASS':'FAIL'} ${result.check}: ${result.detail}`);
if(results.some(result=>!result.passed))process.exitCode=1;
