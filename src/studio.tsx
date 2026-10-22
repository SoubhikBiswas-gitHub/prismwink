import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EffectRenderer, type EffectName, type EffectOptions, type PersonMask, type RenderState } from './effects';
import { VisionClient } from './vision-client';

const EFFECTS: Record<EffectName, {title: string; description: string; hint: string}> = {
  dust: {title: 'Dust dissolve', description: 'A dramatic exit, in one snap.', hint: 'The signature exit'},
  pixel: {title: 'Pixel scatter', description: 'A little retro magic, one pixel at a time.', hint: 'A little retro magic'},
  confetti: {title: 'Confetti', description: 'Leave with a flourish. Return with a celebration.', hint: 'Leave with a flourish'},
  smoke: {title: 'Smoke reveal', description: 'A softer disappearance, with a little mystery.', hint: 'A softer disappearance'},
};
type Settings = EffectOptions & {gestures: boolean};
type Scene = {id: string; name: string; settings: Settings};
type Notice = {text: string; kind: '' | 'error' | 'success'};
type Mode = 'demo' | 'loading' | 'camera' | 'error';
type View = {mode: Mode; state: RenderState; ready: boolean; hasPlate: boolean; visionReady: boolean; hand: string; countdown: number | null; mic: 'off' | 'on' | 'muted'; restoreMic: boolean; quality: 'full' | 'balanced' | 'light'; devices: MediaDeviceInfo[]; deviceId: string};
const STORAGE_KEY = 'prismwink-studio-v1';
const DEFAULTS: Settings = {effect: 'dust', duration: 2500, density: 4500, palette: 'natural', reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, gestures: true, direction: 'right'};
const initialView: View = {mode: 'demo', state: 'visible', ready: false, hasPlate: false, visionReady: false, hand: 'no-hand', countdown: null, mic: 'off', restoreMic: false, quality: 'full', devices: [], deviceId: ''};
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function validateSettings(value: unknown): Settings {
  const record = asRecord(value);
  const duration = typeof record.duration === 'number' && Number.isFinite(record.duration) ? Math.min(5000, Math.max(1000, Math.round(record.duration / 250) * 250)) : 2500;
  return {effect: typeof record.effect === 'string' && Object.hasOwn(EFFECTS, record.effect) ? record.effect as EffectName : 'dust', duration, density: [1800,4500,7500].includes(Number(record.density)) ? Number(record.density) : 4500, palette: ['natural','stardust','prism'].includes(String(record.palette)) ? record.palette as Settings['palette'] : 'natural', reducedMotion: typeof record.reducedMotion === 'boolean' ? record.reducedMotion : DEFAULTS.reducedMotion, gestures: typeof record.gestures === 'boolean' ? record.gestures : true, direction: ['left','right','up'].includes(String(record.direction)) ? record.direction as Settings['direction'] : 'right'};
}
function validateScenes(value: unknown): Scene[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0,12).map(asRecord).filter(item => typeof item.name === 'string' && item.name.trim()).map(item => ({id: crypto.randomUUID(), name: String(item.name).trim().slice(0,40), settings: validateSettings(item.settings)}));
}
async function readSaved(): Promise<{settings: Settings; favorites: EffectName[]; scenes: Scene[]; recent: EffectName[]}> {
  let value: unknown;
  if (globalThis.chrome?.storage?.local) value = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
  else value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  const data = asRecord(value);
  if (data.version !== 1) return {settings:{...DEFAULTS}, favorites:[], scenes:[], recent:[]};
  return {settings:validateSettings(data.settings), favorites:Array.isArray(data.favorites) ? [...new Set(data.favorites.filter((item): item is EffectName => typeof item === 'string' && Object.hasOwn(EFFECTS,item)))] : [], scenes:validateScenes(data.scenes), recent:Array.isArray(data.recent)?[...new Set(data.recent.filter((item): item is EffectName=>typeof item==='string'&&Object.hasOwn(EFFECTS,item)))].slice(0,4):[]};
}
async function writeSaved(settings: Settings, favorites: EffectName[], scenes: Scene[], recent: EffectName[]) {
  const data = {version:1,settings,favorites,scenes,recent};
  if (globalThis.chrome?.storage?.local) await chrome.storage.local.set({[STORAGE_KEY]:data});
  else localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
}
function loadImage(url: string): Promise<HTMLImageElement> { return new Promise((resolve,reject) => { const image=new Image(); image.onload=()=>resolve(image); image.onerror=()=>reject(new Error('Sample artwork could not be loaded. Reload the studio to try again.')); image.src=url; }); }
function errorText(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback; }
const wait = (ms:number) => new Promise<void>(resolve=>setTimeout(resolve,ms));
function createCanvas() { const canvas=document.createElement('canvas'); canvas.width=640; canvas.height=360; return canvas; }

class StudioRuntime {
  canvas: HTMLCanvasElement;
  source=createCanvas();
  room=createCanvas();
  mask: PersonMask | null=null;
  demoMask: PersonMask | null=null;
  roomImage: HTMLImageElement | null=null;
  personImage: HTMLImageElement | null=null;
  renderer: EffectRenderer | null=null;
  vision: VisionClient | null=null;
  stream: MediaStream | null=null;
  microphone: MediaStream | null=null;
  video: HTMLVideoElement | null=null;
  settings: Settings;
  view: View={...initialView};
  onView:(view:View)=>void;
  onNotice:(notice:Notice)=>void;
  onUsed:(effect:EffectName)=>void;
  frame=0;
  generation=0;
  captureGeneration=0;
  micGeneration=0;
  inferenceBusy=false;
  lastInference=0;
  maskTime=0;
  restoreMic=false;
  lastState: RenderState='visible';
  closed=false;
  constructor(canvas:HTMLCanvasElement,settings:Settings,onView:(view:View)=>void,onNotice:(notice:Notice)=>void,onUsed:(effect:EffectName)=>void) { this.canvas=canvas; this.settings=settings; this.onView=onView; this.onNotice=onNotice; this.onUsed=onUsed; }
  notify(text:string,kind:Notice['kind']='') { if(!this.closed)this.onNotice({text,kind}); }
  micTrack() { return this.microphone?.getAudioTracks().find(track=>track.readyState==='live') || null; }
  publish(patch:Partial<View>={}) {
    if(this.closed)return;
    const track=this.micTrack();
    this.view={...this.view,...patch,state:this.renderer?.state||'visible',hasPlate:Boolean(this.renderer?.hasPlate),mic:track?(track.enabled?'on':'muted'):'off',restoreMic:this.restoreMic,quality:this.renderer?.quality||'full'};
    this.onView({...this.view});
  }
  stateChanged=(next:RenderState)=>{
    const track=this.micTrack();
    if(next==='vanishing'){this.restoreMic=Boolean(track?.enabled);if(track)track.enabled=false;}
    else if(next==='visible'&&this.lastState==='returning'){if(this.restoreMic&&track&&this.view.mode==='camera')track.enabled=true;this.restoreMic=false;}
    else if(next==='recovery'){if(track)track.enabled=false;this.restoreMic=false;}
    this.lastState=next;
    this.publish();
  };
  makeRenderer() { this.renderer?.destroy();this.lastState='visible';this.renderer=new EffectRenderer(this.canvas,{onState:this.stateChanged});this.renderer.setOptions(this.settings); }
  setSettings(settings:Settings) { this.settings=settings;this.renderer?.setOptions(settings); }
  drawDemo() { const context=this.source.getContext('2d')!; context.clearRect(0,0,640,360);context.drawImage(this.roomImage!,0,0,640,360);context.drawImage(this.personImage!,0,0,640,360); }
  drawCamera():boolean {
    if(!this.video||this.video.readyState<2||!this.video.videoWidth||!this.video.videoHeight)return false;
    const w=this.video.videoWidth,h=this.video.videoHeight,scale=Math.max(640/w,360/h),sw=640/scale,sh=360/scale;
    this.source.getContext('2d')!.drawImage(this.video,(w-sw)/2,(h-sh)/2,sw,sh,0,0,640,360);return true;
  }
  async init() {
    try {
      [this.roomImage,this.personImage]=await Promise.all([loadImage('assets/sample-room.svg'),loadImage('assets/sample-person.svg')]);
      if(this.closed)return;
      this.room.getContext('2d')!.drawImage(this.roomImage,0,0,640,360);
      const alpha=createCanvas(),context=alpha.getContext('2d',{willReadFrequently:true})!;
      context.drawImage(this.personImage,0,0,640,360);
      const rgba=context.getImageData(0,0,640,360).data,data=new Uint8Array(640*360);
      for(let index=0;index<data.length;index++)data[index]=rgba[index*4+3];
      this.demoMask={data,width:640,height:360};
      this.useDemo();this.publish({ready:true});this.frame=requestAnimationFrame(this.animate);
    }catch(error){this.notify(errorText(error,'The studio could not be prepared.'),'error');this.publish({mode:'error'});}
  }
  thumbnail(canvas:HTMLCanvasElement,effect:EffectName) {
    if(!this.demoMask)return;
    const renderer=new EffectRenderer(canvas);
    try{renderer.setOptions({effect,duration:1000,density:1500,palette:effect==='confetti'?'prism':'natural',reducedMotion:false});renderer.capturePlate(this.room);const source=createCanvas();const context=source.getContext('2d')!;context.drawImage(this.roomImage!,0,0,640,360);context.drawImage(this.personImage!,0,0,640,360);renderer.render(source,this.demoMask,0);renderer.toggle(source,this.demoMask,0);renderer.render(source,this.demoMask,420);}finally{renderer.destroy();}
  }
  animate=(timestamp:number)=>{
    if(this.closed)return;
    this.frame=requestAnimationFrame(this.animate);
    if(!this.renderer||!this.view.ready||this.view.mode==='error')return;
    try{
      if(this.view.mode==='demo'){this.renderer.render(this.source,this.demoMask,timestamp);if(this.renderer.quality!==this.view.quality)this.publish();}
      else if(this.drawCamera()){
        this.renderer.render(this.source,this.mask,timestamp);
        if(this.renderer.quality!==this.view.quality)this.publish();
        if(this.view.mode==='camera'&&this.view.visionReady&&!this.inferenceBusy&&timestamp-this.lastInference>=70){
          this.inferenceBusy=true;this.lastInference=timestamp;const generation=this.generation;
          void this.vision!.process(this.source,timestamp).then(result=>{
            if(this.closed||generation!==this.generation||this.view.mode!=='camera'||!result)return;
            this.mask=result.mask;this.maskTime=performance.now();this.publish({hand:result.handStatus});
            if(result.gesture&&this.settings.gestures&&this.renderer?.hasPlate&&this.view.countdown===null)this.toggle();
          }).catch(error=>{if(generation===this.generation&&!this.closed)this.fail(error);}).finally(()=>{if(generation===this.generation)this.inferenceBusy=false;});
        }
      }
    }catch(error){if(this.view.mode==='camera'||this.view.mode==='loading')this.fail(error);else this.notify(errorText(error,'The effect could not be rendered.'),'error');}
  };
  stopResources(){
    this.generation++;this.captureGeneration++;this.micGeneration++;this.restoreMic=false;this.inferenceBusy=false;this.mask=null;this.vision?.close();this.vision=null;
    for(const stream of [this.stream,this.microphone])stream?.getTracks().forEach(track=>{track.enabled=false;track.stop();});
    this.stream=null;this.microphone=null;if(this.video){this.video.pause();this.video.srcObject=null;this.video=null;}
  }
  useDemo(message?:string){
    this.stopResources();
    if(this.demoMask){this.makeRenderer();this.renderer!.capturePlate(this.room);this.drawDemo();this.mask=this.demoMask;}
    this.publish({mode:'demo',visionReady:false,countdown:null,hand:'no-hand',devices:[],deviceId:''});
    if(message)this.notify(message);
  }
  fail(error:unknown){
    this.stopResources();
    this.publish({mode:'error',visionReady:false,countdown:null,hand:'no-hand'});
    const name=error instanceof Error?error.name:'';
    this.notify(name==='NotAllowedError'?'Camera permission was not granted. Allow camera access in your browser and try again, or choose Demo.':name==='NotFoundError'?'No camera was found. Connect a camera and try again, or choose Demo.':name==='NotReadableError'?'The camera could not be opened. Close another app using it and try again.':errorText(error,'Camera processing stopped. Your camera and microphone are now off.'),'error');
  }
  async refreshDevices(){
    try{const devices=(await navigator.mediaDevices.enumerateDevices()).filter(item=>item.kind==='videoinput');if(!this.closed)this.publish({devices,deviceId:this.stream?.getVideoTracks()[0]?.getSettings().deviceId||''});}catch{this.notify('Camera selection could not be loaded. The current camera can still be used.');}
  }
  async startCamera(deviceId=''){
    if(!navigator.mediaDevices?.getUserMedia){this.notify('Camera access is unavailable here. Open the installed extension or a localhost preview.','error');return;}
    if(this.view.mode==='camera'&&this.renderer?.state!=='visible'){this.notify('Return to the camera before changing the camera source.');return;}
    this.stopResources();const generation=this.generation;this.publish({mode:'loading',visionReady:false,countdown:null,hand:'no-hand'});
    try{
      const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:360},frameRate:{ideal:30,max:30},...(deviceId?{deviceId:{exact:deviceId}}:{})},audio:false});
      if(this.closed||generation!==this.generation){stream.getTracks().forEach(track=>track.stop());return;}
      this.stream=stream;this.video=document.createElement('video');this.video.muted=true;this.video.playsInline=true;this.video.srcObject=stream;await this.video.play();
      if(this.closed||generation!==this.generation)return;
      this.makeRenderer();this.drawCamera();this.renderer!.render(this.source,null,performance.now());
      const client=new VisionClient();this.vision=client;await client.init();
      if(this.closed||generation!==this.generation){client.close();return;}
      this.publish({mode:'camera',visionReady:true});
      stream.getVideoTracks()[0]?.addEventListener('ended',()=>{if(generation===this.generation&&!this.closed)this.fail(new Error('The camera disconnected. Reconnect it and start the camera again.'));},{once:true});
      await this.refreshDevices();if(generation!==this.generation||this.closed)return;
      this.notify('Camera ready. Start the empty-room countdown, then step completely out of frame.');
    }catch(error){if(!this.closed&&generation===this.generation)this.fail(error);}
  }
  async capture(){
    if(this.view.mode!=='camera'||this.renderer?.state!=='visible'||this.view.countdown!==null)return;
    const generation=++this.captureGeneration;this.notify('Step completely out of the frame. Capturing your empty room in 5 seconds.');
    for(let count=5;count>0;count--){if(this.closed||generation!==this.captureGeneration||this.view.mode!=='camera')return;this.publish({countdown:count});await wait(1000);}
    if(this.closed||generation!==this.captureGeneration||this.view.mode!=='camera')return;
    try{if(!this.drawCamera())throw new Error('No camera frame was available. Please try capturing the room again.');this.renderer.capturePlate(this.source);this.notify('Room captured. Step back in and try a slow thumb–middle-finger pinch and release.','success');}catch(error){this.notify(errorText(error,'The room could not be captured.'),'error');}
    this.publish({countdown:null});
  }
  clearRoom(){
    if(this.view.mode!=='camera'||this.renderer?.state!=='visible'||this.view.countdown!==null)return;
    this.renderer.clearPlate();this.publish();this.notify('Empty-room capture cleared. Capture the room again before disappearing.');
  }
  toggle(){
    if(!this.renderer||this.view.countdown!==null||!['demo','camera'].includes(this.view.mode)||['vanishing','returning'].includes(this.renderer.state))return;
    if(this.view.mode==='camera'&&(!this.view.visionReady||!this.mask||performance.now()-this.maskTime>1500)){this.notify('Waiting for a fresh camera outline. Stay in frame and try again.');return;}
    try{const changed=this.renderer.toggle(this.source,this.view.mode==='demo'?this.demoMask:this.mask,performance.now());if(changed)this.onUsed(this.settings.effect);else this.notify(!this.renderer.hasPlate?'Capture your empty room before you disappear.':'Keep yourself in the camera frame before triggering the effect.');this.publish();}catch(error){this.notify(errorText(error,'The effect could not start.'),'error');}
  }
  recover(){
    if(this.view.mode==='error'){this.useDemo('Camera stopped safely. You can start it again when you are ready.');return;}
    this.restoreMic=false;const track=this.micTrack();if(track)track.enabled=false;this.renderer?.recover();this.publish();this.notify(this.view.mode==='camera'?'You are visible again. The microphone stays muted until you choose to unmute.':'Demo reset. Try another disappearing act.');
  }
  async toggleMic(){
    const track=this.micTrack();
    if(this.renderer?.state!=='visible'){this.restoreMic=false;if(track)track.enabled=false;this.publish();return;}
    if(track){track.enabled=!track.enabled;this.restoreMic=false;this.publish();return;}
    if(this.view.mode!=='camera')return;
    const generation=++this.micGeneration;
    try{const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});if(this.closed||generation!==this.micGeneration||this.view.mode!=='camera'){stream.getTracks().forEach(item=>item.stop());return;}this.microphone=stream;const audio=this.micTrack();if(this.renderer?.state!=='visible'&&audio)audio.enabled=false;audio?.addEventListener('ended',()=>{this.restoreMic=false;this.publish();},{once:true});this.notify('Microphone active locally. Audio is not played, recorded or sent.');}catch(error){this.notify(error instanceof Error&&error.name==='NotAllowedError'?'Microphone permission was not granted. Camera practice still works.':'The microphone could not be opened. Camera practice still works.','error');}
    this.publish();
  }
  close(){this.closed=true;cancelAnimationFrame(this.frame);this.stopResources();this.renderer?.destroy();}
}

function Icon({kind}:{kind:'wand'|'shield'|'star'}) {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">{kind==='wand'?<><path d="m5 19 8-8m-6-5V3m11 7h3M5 11H2m13-7 2-2m0 14 2 2"/><path d="m11 9 4 4"/></>:kind==='shield'?<><path d="M12 3 4 6v5c0 5 8 10 8 10s8-5 8-10V6l-8-3Z"/><path d="m8.5 11 2.5 2.5 4.5-5"/></>:<path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3L12 17.4l-5.6 3 1.1-6.3L3 9.6l6.2-.9L12 3Z"/>}</svg>;
}
function EffectTile({effect,selected,ready,runtime,onSelect}:{effect:EffectName;selected:boolean;ready:boolean;runtime:StudioRuntime|null;onSelect:()=>void}){
  const canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{if(ready&&runtime&&canvas.current){try{runtime.thumbnail(canvas.current,effect);}catch{ /* The main stage reports unavailable sample assets. */ }}},[ready,runtime,effect]);
  return <button className={`effect-tile ${selected?'selected':''}`} type="button" data-effect={effect} aria-pressed={selected} onClick={onSelect}><canvas className="effect-thumb" ref={canvas} width={160} height={90} aria-hidden="true"/><span>{EFFECTS[effect].title}</span><span className="effect-hint">{EFFECTS[effect].hint}</span></button>;
}
function App(){
  const preview=useRef<HTMLCanvasElement>(null);
  const runtime=useRef<StudioRuntime|null>(null);
  const fileInput=useRef<HTMLInputElement>(null);
  const sceneInput=useRef<HTMLInputElement>(null);
  const guideRef=useRef<HTMLElement>(null);
  const [settings,setSettings]=useState<Settings>({...DEFAULTS});
  const [favorites,setFavorites]=useState<EffectName[]>([]);
  const [scenes,setScenes]=useState<Scene[]>([]);
  const [recent,setRecent]=useState<EffectName[]>([]);
  const [view,setView]=useState<View>({...initialView});
  const [notice,setNotice]=useState<Notice|null>({text:'Try an illustrated demo. Your camera and microphone are off.',kind:''});
  const [guide,setGuide]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [micLoading,setMicLoading]=useState(false);
  const settingsRef=useRef(settings);
  settingsRef.current=settings;
  const transitioning=['vanishing','returning'].includes(view.state);
  const live=view.mode==='camera';
  const hidden=view.state!=='visible';
  const demo=view.mode==='demo';
  useEffect(()=>{
    let mounted=true;
    void readSaved().then(data=>{if(mounted){setSettings(data.settings);setFavorites(data.favorites);setScenes(data.scenes);setRecent(data.recent);setLoaded(true);}}).catch(()=>{if(mounted){setLoaded(true);setNotice({text:'Saved preferences could not be loaded. Default settings are ready.',kind:'error'});}});
    return()=>{mounted=false;};
  },[]);
  useEffect(()=>{
    if(!loaded||!preview.current)return;
    const engine=new StudioRuntime(preview.current,settingsRef.current,setView,setNotice,effect=>setRecent(current=>[effect,...current.filter(item=>item!==effect)].slice(0,4)));runtime.current=engine;void engine.init();
    const pagehide=()=>engine.close();
    const pageshow=(event:PageTransitionEvent)=>{if(event.persisted)location.reload();};
    const keydown=(event:KeyboardEvent)=>{const target=event.target as HTMLElement|null;if(event.ctrlKey||event.metaKey||event.altKey||event.repeat||target?.isContentEditable||/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(target?.tagName||''))return;if(event.key.toLowerCase()==='v'){event.preventDefault();engine.toggle();}};
    const devices=()=>{if(engine.view.mode==='camera')void engine.refreshDevices();};
    window.addEventListener('pagehide',pagehide);window.addEventListener('pageshow',pageshow);document.addEventListener('keydown',keydown);navigator.mediaDevices?.addEventListener('devicechange',devices);
    return()=>{engine.close();runtime.current=null;window.removeEventListener('pagehide',pagehide);window.removeEventListener('pageshow',pageshow);document.removeEventListener('keydown',keydown);navigator.mediaDevices?.removeEventListener('devicechange',devices);};
  },[loaded]);
  useEffect(()=>{runtime.current?.setSettings(settings);if(loaded)void writeSaved(settings,favorites,scenes,recent).catch(()=>setNotice({text:'These changes work for this session, but could not be saved.',kind:'error'}));},[settings,favorites,scenes,recent,loaded]);
  const update=(patch:Partial<Settings>)=>{if(transitioning){setNotice({text:'Let this transformation finish before changing the effect.',kind:''});return;}setSettings(current=>validateSettings({...current,...patch}));};
  const localMicLabel=view.mic==='off'?'Enable local microphone test':hidden?(view.restoreMic?'Keep mic muted on return':'Mic muted while hidden'):view.mic==='on'?'Mute local microphone':'Unmute local microphone';
  const gestureText=demo?'Try the button below':!settings.gestures?'Gestures paused':view.hand==='pinched'?'Release to trigger':view.hand==='ready'?'Hand ready':'Looking for your hand';
  const exportScenes=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,scenes},null,2)],{type:'application/json'}));const anchor=document.createElement('a');anchor.href=url;anchor.download='prismwink-scenes.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const importScenes=async(file:File)=>{if(file.size>65536){setNotice({text:'Scene files must be smaller than 64 KB.',kind:'error'});return;}try{const data=asRecord(JSON.parse(await file.text()));if(data.version!==1||!Array.isArray(data.scenes))throw new Error('Choose a version 1 Prismwink scenes file.');const imported=validateScenes(data.scenes);if(!imported.length)throw new Error('No valid scenes were found.');const available=12-scenes.length;if(available<1)throw new Error('Your 12 scene slots are full. Delete a scene before importing.');const added=imported.slice(0,available);setScenes(current=>[...current,...added]);setNotice({text:`Imported ${added.length} scene${added.length===1?'':'s'}.`,kind:'success'});}catch(error){setNotice({text:error instanceof SyntaxError?'That file is not valid JSON. Choose a Prismwink scenes export.':errorText(error,'The scenes file could not be imported.'),kind:'error'});}};
  return <>
    <header className="topbar"><a className="brand" href="studio.html" aria-label="Prismwink Studio"><img src="assets/icon.svg" width={35} height={35} alt=""/><span>Prismwink</span></a><nav aria-label="Studio navigation"><a className="nav-link active" href="#studio">Studio</a><a className="nav-link" href="#scenes">My scenes</a><button className="nav-link" id="show-guide" type="button" onClick={()=>{setGuide(current=>!current);if(!guide)setTimeout(()=>guideRef.current?.scrollIntoView({behavior:settings.reducedMotion?'instant':'smooth',block:'start'}),0);}}>How it works</button></nav><span className={`session-state ${live?'live':''}`} id="session-state"><span className="status-dot"/>{view.mode==='loading'?'Preparing camera…':live?'Camera · local preview':view.mode==='error'?'Camera stopped':'Demo · camera off'}</span></header>
    <main id="studio"><section className="heading-row" aria-labelledby="studio-title"><div><h1 id="studio-title">Make a little magic.</h1><p>Disappear. Return. Make an entrance.</p></div><button className="button secondary" id="open-meet" type="button" onClick={()=>window.open('https://meet.google.com/','_blank','noopener')}><span>Open Google Meet</span><span aria-hidden="true">↗</span></button></section>
      {notice&&<div className={`notice ${notice.kind}`} id="notice" role="status" aria-live="polite"><span className="notice-icon" aria-hidden="true">i</span><span id="notice-text">{notice.text}</span><button id="dismiss-notice" type="button" aria-label="Dismiss message" onClick={()=>setNotice(null)}>×</button></div>}
      <div className="workspace"><section className="stage-column" aria-label="Camera preview and effects"><div className={`preview-frame ${live||view.mode==='loading'||view.mode==='error'?'camera':''}`}><canvas id="preview" ref={preview} width={640} height={360} aria-label="Processed camera preview"/><div className="preview-top"><span className="preview-badge" id="preview-mode">{live?'Your camera · mirrored preview':view.mode==='loading'?'Preparing camera':view.mode==='error'?'Preview stopped':'Illustrated demo'}</span><span className="preview-badge quiet">Local only</span></div><div className="preview-bottom"><span className="preview-badge" id="visibility-status">{demo?`${view.state==='visible'?'Visible':view.state==='hidden'?'Hidden':'Transforming'} · demo`:view.mode==='error'?'Camera stopped · mic off':`${view.state==='visible'?'Visible':view.state==='hidden'?'Hidden':'Transforming'} · ${view.mic==='on'?'Mic on locally':'Mic off'}`}</span><span className="preview-badge quiet" id="gesture-status">{gestureText}</span></div>{view.countdown!==null&&<div className="countdown" id="countdown" aria-live="assertive">{view.countdown}</div>}{(!view.ready||view.mode==='loading')&&view.mode!=='error'&&<div className="preview-loading" id="preview-loading"><span className="spinner" aria-hidden="true"/><span>{view.mode==='loading'?'Preparing camera and local processing…':'Preparing your stage…'}</span></div>}</div>
        <div className="effect-strip" role="group" aria-label="Choose an effect">{(Object.keys(EFFECTS) as EffectName[]).map(effect=><EffectTile key={effect} effect={effect} selected={settings.effect===effect} ready={view.ready} runtime={runtime.current} onSelect={()=>update({effect})}/>)}</div>
        {favorites.length>0&&<div className="favorite-shortcuts" role="group" aria-label="Favorite effects"><span>Favorites</span>{favorites.map(effect=><button key={effect} type="button" aria-pressed={settings.effect===effect} onClick={()=>update({effect})}>{EFFECTS[effect].title}</button>)}</div>}
        {recent.length>0&&<div className="favorite-shortcuts recent-shortcuts" id="recent-effects" role="group" aria-label="Recently used effects"><span>Recently used</span>{recent.map(effect=><button key={effect} type="button" aria-pressed={settings.effect===effect} onClick={()=>update({effect})}>{EFFECTS[effect].title}</button>)}</div>}
        <div className="stage-actions"><button className="button primary vanish-action" id="toggle-effect" type="button" disabled={!view.ready||!view.hasPlate||transitioning||view.countdown!==null||!['demo','camera'].includes(view.mode)||(!demo&&!view.visionReady)} onClick={()=>runtime.current?.toggle()}><Icon kind="wand"/><span id="toggle-label">{view.state==='vanishing'?'Disappearing…':view.state==='returning'?'Returning…':view.state==='hidden'?'Return to camera':live&&view.mic==='on'?'Vanish & mute':'Vanish'}</span></button><button className="button secondary" id="recover" type="button" disabled={view.state==='visible'&&view.mode!=='error'} onClick={()=>runtime.current?.recover()}>Return safely</button><span className="shortcut-hint">Press <kbd>V</kbd> to toggle</span></div>
        <p className="stage-caption">{demo?'This demo is an illustration. Camera effects use your own live image.':live?'Local preview only. In Meet, the separate Prismwink dock controls your outgoing camera.':view.mode==='loading'?'Preparing local camera and gesture processing…':'Your camera and microphone are stopped. No raw camera fallback is shown.'}</p>
        <section className="scenes-section" id="scenes" aria-labelledby="scenes-title"><div className="section-header"><div><h2 id="scenes-title">Your next disappearing act</h2><p>Keep a favorite combination ready.</p></div><button className="icon-button" id="favorite-effect" type="button" aria-pressed={favorites.includes(settings.effect)} aria-label={`${favorites.includes(settings.effect)?'Unfavorite':'Favorite'} ${EFFECTS[settings.effect].title}`} onClick={()=>setFavorites(current=>current.includes(settings.effect)?current.filter(effect=>effect!==settings.effect):[...current,settings.effect])}><Icon kind="star"/></button></div>
          <form className="save-scene" onSubmit={event=>{event.preventDefault();const name=sceneInput.current?.value.trim().slice(0,40)||'';if(!name){sceneInput.current?.focus();setNotice({text:'Give your scene a short name before saving.',kind:''});return;}if(scenes.length>=12){setNotice({text:'You have 12 scenes. Delete one to make room.',kind:''});return;}setScenes(current=>[...current,{id:crypto.randomUUID(),name,settings:{...settings}}]);if(sceneInput.current)sceneInput.current.value='';setNotice({text:`Saved scene: ${name}`,kind:'success'});}}><label className="sr-only" htmlFor="scene-name">Scene name</label><input ref={sceneInput} id="scene-name" maxLength={40} placeholder="Name this scene" autoComplete="off"/><button className="button secondary" type="submit">Save scene</button></form>
          <div className="scene-list" id="scene-list">{!scenes.length?<p className="empty-state">Your saved scenes will appear here. Start with an effect you like.</p>:scenes.map(scene=><div className="saved-scene" key={scene.id}><button className="scene-apply" type="button" onClick={()=>{if(transitioning){setNotice({text:'Let this transformation finish before changing scenes.',kind:''});return;}setSettings(scene.settings);setNotice({text:`Scene ready: ${scene.name}`,kind:''});}}><strong>{scene.name}</strong><span>{EFFECTS[scene.settings.effect].title} · {scene.settings.duration/1000} s · {scene.settings.palette}</span></button><button className="scene-delete" type="button" aria-label={`Delete ${scene.name}`} onClick={()=>setScenes(current=>current.filter(item=>item.id!==scene.id))}>×</button></div>)}</div>
          <div className="scene-tools"><button className="text-button" id="export-scenes" type="button" disabled={!scenes.length} onClick={exportScenes}>Export scenes</button><button className="text-button" id="import-scenes" type="button" onClick={()=>fileInput.current?.click()}>Import scenes</button><input ref={fileInput} id="scene-file" type="file" accept=".json,application/json" hidden onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void importScenes(file);}}/><button className="text-button danger-text" type="button" disabled={!scenes.length} onClick={()=>{setScenes([]);setNotice({text:'Saved scenes cleared. The current effect is unchanged.',kind:''});}}>Clear saved scenes</button></div></section>
      </section>
      <aside className="inspector" aria-labelledby="effect-title"><div className="inspector-heading"><span className="small-label">Your effect</span><h2 id="effect-title">{EFFECTS[settings.effect].title}</h2><p>{EFFECTS[settings.effect].description}</p></div><div className="control-section"><div className="control-heading"><label htmlFor="duration">Duration</label><output id="duration-value" htmlFor="duration">{Number((settings.duration/1000).toFixed(2))} s</output></div><input id="duration" type="range" min={1000} max={5000} step={250} value={settings.duration} onChange={event=>update({duration:Number(event.target.value)})} disabled={transitioning}/><label className="field-label" htmlFor="density">Particle detail</label><select id="density" value={settings.density} onChange={event=>update({density:Number(event.target.value)})} disabled={transitioning}><option value={1800}>Light · less processing</option><option value={4500}>Balanced</option><option value={7500}>Rich · more detail</option></select><p className="control-note" id="quality-status" role="status">{view.quality==='full'?'Full selected detail':`Auto: reduced particle detail (${view.quality})`}</p><label className="field-label" htmlFor="direction">Particle flow</label><select id="direction" value={settings.direction} onChange={event=>update({direction:event.target.value as Settings['direction']})} disabled={transitioning}><option value="right">To the right</option><option value="left">To the left</option><option value="up">Upward</option></select><label className="field-label" htmlFor="palette">Particle color</label><select id="palette" value={settings.palette} onChange={event=>update({palette:event.target.value as Settings['palette']})} disabled={transitioning}><option value="natural">From your image</option><option value="stardust">Champagne stardust</option><option value="prism">Prism mint & violet</option></select><label className="switch-row" htmlFor="reduced-motion"><span>Reduced motion<span className="control-note">A brief fade, with the same controls</span></span><input type="checkbox" id="reduced-motion" role="switch" checked={settings.reducedMotion} onChange={event=>update({reducedMotion:event.target.checked})} disabled={transitioning}/></label></div>
        <div className="control-section source-section"><h3>Make it yours</h3><div className="mode-picker" role="group" aria-label="Preview source"><button id="demo-mode" type="button" className={demo?'active':''} aria-pressed={demo} onClick={()=>runtime.current?.useDemo('Demo ready. Your camera and microphone are off.')}>Demo</button><button id="camera-mode" type="button" className={live||view.mode==='loading'?'active':''} aria-pressed={live||view.mode==='loading'} disabled={view.mode==='loading'||live} onClick={()=>{void runtime.current?.startCamera();}}>My camera</button></div><p className="control-note">{live?'Your camera is a local preview, not a live call.':view.mode==='loading'?'Allow camera access to start. You can switch back to Demo at any time.':view.mode==='error'?'Processing stopped safely. Start the camera again or choose Demo.':'The demo works without camera access.'}</p>
          {(live||view.mode==='loading'||view.mode==='error')&&<div id="camera-controls"><label className="field-label" htmlFor="camera-device">Camera</label><select id="camera-device" value={view.deviceId} disabled={!live||hidden||view.countdown!==null} onChange={event=>{void runtime.current?.startCamera(event.target.value);}}>{!view.devices.length?<option value="">Default camera</option>:view.devices.map((device,index)=><option value={device.deviceId} key={device.deviceId}>{device.label||`Camera ${index+1}`}</option>)}</select><button className="button secondary full-width" id="capture-room" type="button" disabled={!live||!view.visionReady||hidden||view.countdown!==null} onClick={()=>{void runtime.current?.capture();}}>{view.countdown!==null?'Capturing…':view.hasPlate?'Retake empty room':'Capture empty room'}</button><button className="text-button" id="clear-room" type="button" disabled={!live||!view.hasPlate||hidden||view.countdown!==null} onClick={()=>runtime.current?.clearRoom()}>Clear room capture</button><p className="control-note">{view.hasPlate?'Empty-room still captured for this camera session. Retake it if the camera moves.':'Step out of frame during the countdown. Your room is saved as a still image.'}</p><label className="switch-row" htmlFor="gestures"><span>Gesture control<span className="control-note">Touch thumb to middle finger, then release</span></span><input type="checkbox" id="gestures" role="switch" checked={settings.gestures} onChange={event=>update({gestures:event.target.checked})}/></label><div className={`readiness ${view.hand!=='no-hand'?'ready':''}`}><span className="status-dot"/><span>{view.hand==='pinched'?'Pinch held · release to trigger':view.hand==='ready'?'Hand ready · try a slow snap':'Keep your hand inside the frame'}</span></div><button className="button secondary full-width" id="microphone-test" type="button" disabled={micLoading||!live||(hidden&&!view.restoreMic)} onClick={()=>{setMicLoading(true);void runtime.current?.toggleMic().finally(()=>setMicLoading(false));}}>{micLoading?'Opening microphone…':localMicLabel}</button><p className="control-note">{view.mic==='off'?'Microphone off. The studio never plays or sends your audio.':hidden?(view.restoreMic?'Muted now. It returns to its prior state when you are visible.':'Muted now. It will stay muted when you return.'):view.mic==='on'?'Microphone active locally. Audio is not played, saved or sent.':'Microphone muted. Returning will preserve this choice.'}</p><button className="text-button danger-text" id="stop-camera" type="button" onClick={()=>runtime.current?.useDemo('Camera and microphone stopped. The illustrated demo is ready.')}>Stop camera & microphone</button></div>}
        </div><div className="control-section final-section"><p className="privacy-note"><Icon kind="shield"/><span>Camera frames stay on this device. While hidden, the camera stays active to detect your return.</span></p><button className="text-button" type="button" onClick={()=>{if(!transitioning){setSettings({...DEFAULTS});setNotice({text:'Effect settings reset. Your scenes are unchanged.',kind:''});}}}>Reset effect settings</button></div></aside></div>
      {guide&&<section ref={guideRef} className="guide" aria-labelledby="guide-title"><div className="section-header"><h2 id="guide-title">Your first disappearing act</h2><button className="icon-button" type="button" aria-label="Close guide" onClick={()=>setGuide(false)}>×</button></div><ol><li><strong>Try the demo.</strong> Choose an effect and press Vanish. No permission needed.</li><li><strong>Use your camera.</strong> Allow camera access, then capture the room while you step out of the frame.</li><li><strong>Practice a slow snap.</strong> Touch thumb to middle fingertip, hold briefly, then release. Keep your hand inside the frame.</li><li><strong>Use it in Meet.</strong> Refresh your Meet tab after installing the extension and use the Prismwink dock. The effect is added to your outgoing camera.</li></ol><p>Fast snaps and poor lighting can be missed. The button and keyboard shortcut remain available. Keep the camera still after capturing the room.</p></section>}
    </main><footer><span>Prismwink · Put a little magic on camera.</span><span>Practice locally. Perform in Meet.</span></footer>
  </>;
}
const app=document.getElementById('app');
if(!app)throw new Error('The studio mount is missing.');
createRoot(app).render(<App/>);
