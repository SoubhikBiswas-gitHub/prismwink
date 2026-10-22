import assert from 'node:assert/strict';
import type { BrowserContext, Route } from '@playwright/test';

export interface MeetCheck { check: string; passed: boolean; detail: string }
interface CameraStatus { state: string; hasPlate: boolean; visionReady: boolean; streamActive: boolean; micGated: boolean; cameraCaptureEnabled?: boolean; error?: string }
interface Harness {
  earlyHookInstalled: boolean;
  status: CameraStatus | null;
  statusHistory: Array<{ state: string; audioEnabled: boolean[]; at: number }>;
  visionFrames: number;
  foregroundPixels: number;
  visionPixels: number;
  stream: MediaStream | null;
  extraStreams: MediaStream[];
  clone: MediaStreamTrack | null;
  receiverFrames: number;
  loopError: string;
  muteOnNextVanish: boolean;
  startCamera: (muted?: boolean) => Promise<void>;
  replaceCamera: () => Promise<void>;
  startLoopback: () => Promise<void>;
  command: (command: string, options?: unknown) => void;
  rms: () => number;
  frame: () => number[];
  stopAll: () => void;
}
type HarnessWindow = Window & { harness: Harness };

const harnessHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Prismwink integration harness</title><style>body{font:16px sans-serif;background:#ddd;padding:24px}video{width:320px;height:180px;background:#000}button{min-height:44px;padding:10px;margin:4px}#receiver{display:block}</style></head><body><h1>Local extension integration harness</h1><p>No meeting account or external meeting service is used.</p><button id="start">Start camera</button><button id="mic" aria-label="Turn off microphone" data-is-muted="false">Mute microphone</button><button id="meter">Resume audio meter</button><video id="preview" autoplay muted playsinline></video><video id="receiver" autoplay muted playsinline></video><script>
(() => {
  let micOn = true;
  let sender;
  let receiver;
  let audio;
  let analyser;
  let samples;
  let remoteStream = new MediaStream();
  const preview = document.getElementById('preview');
  const remoteVideo = document.getElementById('receiver');
  const mic = document.getElementById('mic');
  const updateMic = () => {
    mic.setAttribute('data-is-muted', String(!micOn));
    mic.setAttribute('aria-label', micOn ? 'Turn off microphone' : 'Turn on microphone');
    mic.textContent = micOn ? 'Mute microphone' : 'Unmute microphone';
  };
  const harness = window.harness = {
    earlyHookInstalled: Boolean(window.__prismwinkCameraHook), status: null, statusHistory: [], visionFrames: 0, foregroundPixels: 0, visionPixels: 0,
    stream: null, extraStreams: [], clone: null, receiverFrames: 0, loopError: '', muteOnNextVanish: false,
    command(command, options) { window.postMessage({source:'prismwink-content',type:'command',command,options},location.origin); },
    async startCamera(muted = false) {
      harness.stream = await navigator.mediaDevices.getUserMedia({video:{width:640,height:360},audio:true});
      micOn = !muted;
      harness.stream.getAudioTracks().forEach(track => { track.enabled = micOn; });
      preview.srcObject = harness.stream;
      await preview.play();
      updateMic();
    },
    async replaceCamera() {
      const replacement = await navigator.mediaDevices.getUserMedia({video:{width:640,height:360},audio:false});
      harness.extraStreams.push(replacement);
      preview.srcObject = replacement;
      await preview.play();
    },
    async startLoopback() {
      sender = new RTCPeerConnection({iceServers:[]});
      receiver = new RTCPeerConnection({iceServers:[]});
      sender.onicecandidate = event => { if(event.candidate) receiver.addIceCandidate(event.candidate).catch(error => {harness.loopError=error.message;}); };
      receiver.onicecandidate = event => { if(event.candidate) sender.addIceCandidate(event.candidate).catch(error => {harness.loopError=error.message;}); };
      receiver.ontrack = event => {
        remoteStream.addTrack(event.track);
        remoteVideo.srcObject = remoteStream;
        remoteVideo.play().catch(()=>{});
        if(event.track.kind === 'audio') {
          audio = new AudioContext();
          analyser = audio.createAnalyser();
          analyser.fftSize = 2048;
          samples = new Float32Array(analyser.fftSize);
          audio.createMediaStreamSource(new MediaStream([event.track])).connect(analyser);
        }
      };
      harness.stream.getTracks().forEach(track => sender.addTrack(track,harness.stream));
      await sender.setLocalDescription(await sender.createOffer());
      await receiver.setRemoteDescription(sender.localDescription);
      await receiver.setLocalDescription(await receiver.createAnswer());
      await sender.setRemoteDescription(receiver.localDescription);
    },
    rms() {
      if(!analyser) return -1;
      analyser.getFloatTimeDomainData(samples);
      return Math.sqrt(samples.reduce((sum,value)=>sum+value*value,0)/samples.length);
    },
    frame() {
      if(remoteVideo.readyState<2) return [];
      const canvas=document.createElement('canvas');canvas.width=64;canvas.height=36;
      const context=canvas.getContext('2d');context.drawImage(remoteVideo,0,0,64,36);
      return Array.from(context.getImageData(0,0,64,36).data);
    },
    stopAll() {
      [harness.stream,...harness.extraStreams].filter(Boolean).forEach(stream=>stream.getTracks().forEach(track=>track.stop()));
      harness.clone?.stop(); sender?.close(); receiver?.close(); audio?.close();
    }
  };
  mic.addEventListener('click', () => {micOn=!micOn;harness.stream?.getAudioTracks().forEach(track=>{track.enabled=micOn;});updateMic();});
  document.getElementById('start').addEventListener('click',()=>harness.startCamera().catch(error=>{harness.loopError=error.message;}));
  document.getElementById('meter').addEventListener('click',()=>audio?.resume());
  function countFrame() {harness.receiverFrames+=1;remoteVideo.requestVideoFrameCallback(countFrame);}
  remoteVideo.requestVideoFrameCallback(countFrame);
  window.addEventListener('message',event=>{
    if(event.source === window && event.origin === location.origin && event.data?.source === 'prismwink-hook' && event.data.type === 'status') {
      harness.status=event.data;
      harness.statusHistory.push({state:event.data.state,audioEnabled:harness.stream?.getAudioTracks().map(track=>track.enabled)||[],at:performance.now()});
      if(harness.statusHistory.length>500)harness.statusHistory.shift();
      if(harness.muteOnNextVanish && event.data.state === 'vanishing') {
        harness.muteOnNextVanish=false;
        harness.stream?.getAudioTracks().forEach(track=>{track.enabled=false;});
      }
    }
    if(event.data?.source === 'prismwink-engine' && event.data.type === 'result' && event.data.mask?.data) {
      harness.visionFrames+=1;
      harness.foregroundPixels=event.data.mask.data.reduce((sum,value)=>sum+(value>100?1:0),0);
      harness.visionPixels=event.data.mask.data.length;
    }
  });
})();
</script></body></html>`;

export async function runMeetChecks(context: BrowserContext): Promise<MeetCheck[]> {
  const checks: MeetCheck[] = [];
  const page = await context.newPage();
  const routePattern = 'https://meet.google.com/**';
  const routeHandler = async (route: Route) => {
    if (new URL(route.request().url()).pathname === '/prismwink-test') await route.fulfill({ status: 200, contentType: 'text/html', body: harnessHtml });
    else await route.fulfill({ status: 404, body: 'Local test route only.' });
  };
  await context.route(routePattern, routeHandler);
  const passed = (check: string, detail: string) => checks.push({ check, passed: true, detail });
  try {
    await page.goto('https://meet.google.com/prismwink-test', { waitUntil: 'domcontentloaded' });
    await page.locator('#prismwink-dock').waitFor({ timeout: 20_000 });
    assert.equal(await page.evaluate(() => (window as unknown as HarnessWindow).harness.earlyHookInstalled), true, 'The camera hook must already exist before the first host-page script runs.');
    await page.getByRole('button', { name: 'Start camera', exact: true }).click();
    await page.waitForFunction(() => (window as unknown as HarnessWindow).harness.status?.streamActive, null, { timeout: 20_000 });
    passed('Meet hook and control dock', 'Real extension intercepts native fake-camera capture on an intercepted secure Meet origin. No meeting account or network call is involved.');
    await page.waitForFunction(() => (window as unknown as HarnessWindow).harness.status?.visionReady && (window as unknown as HarnessWindow).harness.visionFrames > 0, null, { timeout: 90_000 });
    const vision = await page.evaluate(() => {
      const h = (window as unknown as HarnessWindow).harness;
      return { frames: h.visionFrames, foreground: h.foregroundPixels, total: h.visionPixels };
    });
    passed('Bundled vision processing', `Actual extension-origin worker produced ${vision.frames} mask frame(s), ${vision.foreground}/${vision.total} foreground pixels. No mask or gesture result was injected.`);

    await page.evaluate(() => (window as unknown as HarnessWindow).harness.startLoopback());
    await page.waitForFunction(() => (window as unknown as HarnessWindow).harness.receiverFrames > 3 && (window as unknown as HarnessWindow).harness.rms() >= 0, null, { timeout: 20_000 });
    await page.getByRole('button', { name: 'Resume audio meter' }).click();
    await page.waitForFunction(() => (window as unknown as HarnessWindow).harness.rms() > 0.002, null, { timeout: 15_000 });
    const baseline = await page.evaluate(() => (window as unknown as HarnessWindow).harness.rms());
    passed('Receiving peer has camera and microphone', `Local RTCPeerConnection loopback decodes processed camera frames and measures nonzero audio RMS ${baseline.toFixed(5)} before hiding.`);

    if (!vision.foreground) {
      checks.push({ check: 'Actual person cutout required for transitions', passed: false, detail: 'The browser fake-camera scene contains no detected person. Vision ran correctly, but vanish/mute/return checks cannot honestly pass without a real person fixture. Supply a permitted person video fixture with the browser fake-video-capture flag; do not fabricate a foreground mask.' });
      return checks;
    }

    await page.evaluate(() => (window as unknown as HarnessWindow).harness.command('configure', { duration: 600, density: 500, gestures: false }));
    for (const failureMode of ['context', 'output'] as const) {
      const failure = await page.evaluate(async (mode: 'context' | 'output') => {
        const global = window as Window & typeof globalThis;
        const previousConstructor = global.MediaStream;
        const previousDefine = Object.defineProperty;
        const previousContext = HTMLCanvasElement.prototype.getContext;
        const previousCapture = HTMLCanvasElement.prototype.captureStream;
        const captured = new Set<MediaStreamTrack>();
        let rejected = false;
        let reason = '';
        Object.defineProperty = ((target: object, key: PropertyKey, descriptor: PropertyDescriptor) => {
          if (target instanceof MediaStreamTrack && key === 'enabled' && target.kind === 'audio') captured.add(target);
          return previousDefine(target, key, descriptor);
        }) as typeof Object.defineProperty;
        global.MediaStream = new Proxy(previousConstructor, { construct(target, args) {
          if (Array.isArray(args[0])) for (const track of args[0]) if (track instanceof MediaStreamTrack) captured.add(track);
          return Reflect.construct(target, args);
        } });
        if (mode === 'context') {
          HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId: string, ...options: unknown[]) {
            if (this.width === 640 && contextId === '2d') throw new Error('Injected camera context failure before active replacement.');
            return Reflect.apply(previousContext, this, [contextId, ...options]);
          } as typeof HTMLCanvasElement.prototype.getContext;
        } else {
          HTMLCanvasElement.prototype.captureStream = function (this: HTMLCanvasElement, frameRate?: number) {
            const output = previousCapture.call(this, frameRate);
            output.getTracks().forEach(track => captured.add(track));
            output.getVideoTracks = () => { throw new Error('Injected output track failure after canvas capture creation.'); };
            return output;
          };
        }
        try {
          const unexpected = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360 }, audio: true });
          unexpected.getTracks().forEach(track => track.stop());
        } catch (error) { rejected = true; reason = error instanceof Error ? error.message : String(error); }
        finally {
          Object.defineProperty = previousDefine;
          global.MediaStream = previousConstructor;
          HTMLCanvasElement.prototype.getContext = previousContext;
          HTMLCanvasElement.prototype.captureStream = previousCapture;
        }
        return { rejected, reason, tracks: [...captured].map(track => ({ kind: track.kind, state: track.readyState })), previous: (window as unknown as HarnessWindow).harness.stream?.getVideoTracks()[0]?.readyState };
      }, failureMode);
      assert.equal(failure.rejected, true, `A ${failureMode} processing failure must reject instead of returning an untracked raw camera.`);
      assert.ok(failure.tracks.length >= 2, `Observe the actual failed request camera/audio tracks in the ${failureMode} case.`);
      assert.ok(failure.tracks.every(track => track.state === 'ended'), `Every failed-request track must stop: ${JSON.stringify(failure.tracks)}`);
      assert.equal(failure.previous, 'live', 'An earlier processed camera must survive failed replacement capture.');
      passed(`Failed ${failureMode} capture rejects and cleans up`, `Observed ${failure.tracks.length} actual native/processed request track(s) ended; the existing processed camera stays live. Failure: ${failure.reason}`);
    }
    await page.getByRole('button', { name: 'Capture empty room', exact: true }).click();
    await page.waitForFunction(() => (window as unknown as HarnessWindow).harness.status?.hasPlate, null, { timeout: 9_000 });
    passed('Empty-room countdown', 'Real control dock captured a session-memory plate after its five-second step-away countdown. The fixture is synthetic, so this checks capture behavior rather than room removal quality.');

    await page.getByRole('button', { name: 'Vanish & mute', exact: true }).click();
    await page.waitForFunction(() => (window as unknown as HarnessWindow).harness.status?.state === 'vanishing', null, { timeout: 3_000 });
    const first = await page.evaluate(() => (window as unknown as HarnessWindow).harness.statusHistory.find(item => item.state === 'vanishing'));
    assert.ok(first && first.audioEnabled.length > 0 && first.audioEnabled.every(value => !value), 'Audio must already be disabled in the first vanishing state notification.');
    passed('Immediate audio gate', 'The first vanishing state notification already observes every original outgoing microphone track disabled.');
    await page.evaluate(() => { const h = (window as unknown as HarnessWindow).harness; h.command('toggle'); h.command('toggle'); });
    await page.waitForFunction(() => (window as unknown as HarnessWindow).harness.status?.state === 'hidden', null, { timeout: 4_000 });
    passed('Transition lock', 'Repeated commands during disappearance do not restart or reverse the active transition.');
    await page.waitForFunction(() => (window as unknown as HarnessWindow).harness.rms() < 0.0005, null, { timeout: 5_000 });
    const silent = await page.evaluate(() => (window as unknown as HarnessWindow).harness.rms());
    const firstHiddenFrame = await page.evaluate(() => ({ pixels: (window as unknown as HarnessWindow).harness.frame(), count: (window as unknown as HarnessWindow).harness.receiverFrames }));
    await page.waitForTimeout(1200);
    const nextHiddenFrame = await page.evaluate(() => ({ pixels: (window as unknown as HarnessWindow).harness.frame(), count: (window as unknown as HarnessWindow).harness.receiverFrames }));
    assert.ok(nextHiddenFrame.count > firstHiddenFrame.count, 'Receiving peer must continue receiving video while hidden.');
    assert.equal(nextHiddenFrame.pixels.length, firstHiddenFrame.pixels.length);
    const meanDelta = nextHiddenFrame.pixels.reduce((sum, value, index) => sum + Math.abs(value - firstHiddenFrame.pixels[index]!), 0) / Math.max(1, firstHiddenFrame.pixels.length);
    assert.ok(meanDelta < 3, `Hidden receiving frames should remain a stable plate, average pixel difference was ${meanDelta}.`);
    passed('Receiving peer is silent and remains live', `After hiding, received audio RMS ${silent.toFixed(6)}; ${nextHiddenFrame.count - firstHiddenFrame.count} further frames arrived with mean plate pixel delta ${meanDelta.toFixed(3)}. This is a local RTC receiving test, not a live Google Meet call.`);

    await page.getByRole('button', { name: 'Return to camera', exact: true }).click();
    await page.waitForFunction(() => { const h = (window as unknown as HarnessWindow).harness; return h.status?.state === 'visible' && !h.status.micGated && h.stream?.getAudioTracks().every(track => track.enabled); }, null, { timeout: 5_000 });
    await page.waitForFunction(() => (window as unknown as HarnessWindow).harness.rms() > 0.002, null, { timeout: 5_000 });
    passed('Owned prior microphone state restored', 'A microphone that was on before the extension muted it is restored on return, including nonzero receiving-peer audio.');

    await page.evaluate(() => { (window as unknown as HarnessWindow).harness.muteOnNextVanish = true; });
    await page.getByRole('button', { name: 'Vanish & mute', exact: true }).click();
    await page.waitForFunction(() => (window as unknown as HarnessWindow).harness.status?.state === 'hidden', null, { timeout: 4_000 });
    await page.getByRole('button', { name: 'Return to camera', exact: true }).click();
    await page.waitForFunction(() => (window as unknown as HarnessWindow).harness.status?.state === 'visible', null, { timeout: 4_000 });
    assert.equal(await page.evaluate(() => (window as unknown as HarnessWindow).harness.stream?.getAudioTracks()[0]?.enabled), false);
    passed('Application mute during own mute acknowledgement window', 'A direct application false write from the first vanishing status event, before the 220ms own-mute acknowledgement, cancels ownership rather than being mistaken for another extension mute.');
    await page.locator('button#mic').click();
    await page.waitForFunction(() => !(window as unknown as HarnessWindow).harness.status?.micGated && (window as unknown as HarnessWindow).harness.stream?.getAudioTracks()[0]?.enabled, null, { timeout: 3_000 });

    await page.getByRole('button', { name: 'Vanish & mute', exact: true }).click();
    await page.waitForFunction(() => (window as unknown as HarnessWindow).harness.status?.state === 'hidden', null, { timeout: 4_000 });
    await page.evaluate(() => { (window as unknown as HarnessWindow).harness.stream!.getAudioTracks()[0]!.enabled = false; });
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Return to camera', exact: true }).click();
    await page.waitForFunction(() => (window as unknown as HarnessWindow).harness.status?.state === 'visible', null, { timeout: 4_000 });
    assert.equal(await page.evaluate(() => (window as unknown as HarnessWindow).harness.stream?.getAudioTracks()[0]?.enabled), false);
    passed('Application microphone write overrides ownership', 'A direct track.enabled=false write after Prismwink mute acknowledgement invalidates restoration ownership and is not overwritten on return.');
    await page.locator('button#mic').click();
    await page.waitForFunction(() => !(window as unknown as HarnessWindow).harness.status?.micGated && (window as unknown as HarnessWindow).harness.stream?.getAudioTracks()[0]?.enabled, null, { timeout: 3_000 });

    await page.getByRole('button', { name: 'Vanish & mute', exact: true }).click();
    await page.waitForFunction(() => (window as unknown as HarnessWindow).harness.status?.state === 'hidden', null, { timeout: 4_000 });
    await page.locator('button#mic').click();
    await page.waitForTimeout(300);
    await page.locator('button#mic').click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Return to camera', exact: true }).click();
    await page.waitForFunction(() => (window as unknown as HarnessWindow).harness.status?.state === 'visible', null, { timeout: 4_000 });
    assert.equal(await page.evaluate(() => (window as unknown as HarnessWindow).harness.stream?.getAudioTracks()[0]?.enabled), false);
    passed('Manual microphone change wins', 'A trusted user change to the Meet microphone control while hidden prevents automatic unmute on return.');

    await page.getByRole('button', { name: 'Vanish & mute', exact: true }).click();
    await page.waitForFunction(() => (window as unknown as HarnessWindow).harness.status?.state === 'hidden', null, { timeout: 4_000 });
    await page.getByRole('button', { name: 'Return to camera', exact: true }).click();
    await page.waitForFunction(() => (window as unknown as HarnessWindow).harness.status?.state === 'visible', null, { timeout: 4_000 });
    assert.equal(await page.evaluate(() => (window as unknown as HarnessWindow).harness.stream?.getAudioTracks()[0]?.enabled), false);
    passed('Previously muted microphone remains muted', 'A subsequent cycle starting muted remains muted after return.');

    await page.locator('button#mic').click();
    await page.waitForFunction(() => !(window as unknown as HarnessWindow).harness.status?.micGated && (window as unknown as HarnessWindow).harness.stream?.getAudioTracks()[0]?.enabled, null, { timeout: 3_000 });
    passed('Explicit user unmute after return', 'A trusted Meet button click releases the conservative audio gate only after the camera has returned.');

    await page.getByRole('button', { name: 'Vanish & mute', exact: true }).click();
    await page.waitForFunction(() => (window as unknown as HarnessWindow).harness.status?.state === 'hidden', null, { timeout: 4_000 });
    await page.evaluate(() => (window as unknown as HarnessWindow).harness.replaceCamera());
    await page.waitForFunction(() => (window as unknown as HarnessWindow).harness.status?.state === 'recovery', null, { timeout: 5_000 });
    assert.equal(await page.evaluate(() => (window as unknown as HarnessWindow).harness.stream?.getAudioTracks()[0]?.enabled), false);
    passed('New camera while hidden stays hidden', 'A second native camera request while hidden returns a neutral recovery stream and keeps microphone gating.');
    await page.getByRole('button', { name: 'Collapse', exact: true }).click();
    const compact = page.locator('#prismwink-dock #compact-actions');
    assert.equal(await compact.isVisible(), true, 'Collapsed controls must retain an action row.');
    assert.equal(await compact.getByRole('button', { name: 'Return to camera', exact: true }).isDisabled(), true, 'The compact toggle must use the same recovery-state guard as the full controls.');
    assert.equal(await compact.getByRole('button', { name: 'Return safely · keep muted', exact: true }).isEnabled(), true);
    await compact.getByRole('button', { name: 'Return safely · keep muted', exact: true }).click();
    await page.waitForFunction(() => (window as unknown as HarnessWindow).harness.status?.state === 'visible', null, { timeout: 3_000 });
    assert.equal(await page.evaluate(() => (window as unknown as HarnessWindow).harness.stream?.getAudioTracks()[0]?.enabled), false);
    passed('Compact recovery keeps microphone muted', 'The collapsed dock retains Return safely with the same enabled-state checks. Its recovery action restores camera visibility while keeping audio muted.');
    await page.getByRole('button', { name: 'Show controls', exact: true }).click();
    assert.equal(await compact.isVisible(), false, 'The compact action row is visible only while the dock is collapsed.');

    const beforeRecoveryVision = await page.evaluate(() => {
      const h = (window as unknown as HarnessWindow).harness;
      h.command('configure', { duration: 1200 });
      h.command('capture');
      return h.visionFrames;
    });
    await page.waitForFunction((before: number) => {
      const h = (window as unknown as HarnessWindow).harness;
      return Boolean(h.status?.hasPlate && h.status.visionReady && h.visionFrames > before);
    }, beforeRecoveryVision, { timeout: 10_000 });
    await page.getByRole('button', { name: 'Vanish & mute', exact: true }).click();
    await page.waitForFunction(() => (window as unknown as HarnessWindow).harness.status?.state === 'hidden', null, { timeout: 4_000 });
    await page.getByRole('button', { name: 'Return to camera', exact: true }).click();
    await page.waitForFunction(() => (window as unknown as HarnessWindow).harness.status?.state === 'returning', null, { timeout: 3_000 });
    await page.evaluate(() => (window as unknown as HarnessWindow).harness.extraStreams.at(-1)!.getVideoTracks()[0]!.applyConstraints({ frameRate: { ideal: 24 } }));
    await page.waitForFunction(() => (window as unknown as HarnessWindow).harness.status?.state === 'recovery', null, { timeout: 4_000 });
    const recoveryFrames = await page.evaluate(() => (window as unknown as HarnessWindow).harness.receiverFrames);
    await page.waitForFunction((before: number) => (window as unknown as HarnessWindow).harness.receiverFrames >= before + 3, recoveryFrames, { timeout: 5_000 });
    const recoveredSibling = await page.evaluate(() => {
      const h = (window as unknown as HarnessWindow).harness;
      const pixels = h.frame();
      const rgb = pixels.filter((_value, index) => index % 4 !== 3);
      return { mean: rgb.reduce((sum, value) => sum + value, 0) / Math.max(1, rgb.length), length: pixels.length, muted: h.stream!.getAudioTracks().every(track => !track.enabled) };
    });
    assert.ok(recoveredSibling.length > 0, 'The earlier receiving stream must still provide frames after active-session recovery.');
    assert.ok(recoveredSibling.mean < 40, `An older camera stream must be forced back to the dark recovery frame, received RGB mean was ${recoveredSibling.mean}.`);
    assert.equal(recoveredSibling.muted, true);
    passed('Recovery hides every camera session', `Changing the active camera constraints during return triggers recovery. The earlier receiving stream remains live but becomes the neutral hidden frame (RGB mean ${recoveredSibling.mean.toFixed(2)}); microphone remains muted.`);
    await page.getByRole('button', { name: 'Return safely · keep muted', exact: true }).click();
    await page.waitForFunction(() => (window as unknown as HarnessWindow).harness.status?.state === 'visible', null, { timeout: 3_000 });

    await page.evaluate(() => {
      const track = (window as unknown as HarnessWindow).harness.extraStreams.at(-1)!.getVideoTracks()[0]!;
      track.enabled = false;
    });
    await page.waitForFunction(() => (window as unknown as HarnessWindow).harness.status?.cameraCaptureEnabled === false, null, { timeout: 3_000 });
    await page.evaluate(() => {
      const h = (window as unknown as HarnessWindow).harness;
      const track = h.extraStreams.at(-1)!.getVideoTracks()[0]!;
      h.clone = track.clone();
      h.clone.enabled = true;
    });
    await page.waitForFunction(() => (window as unknown as HarnessWindow).harness.status?.cameraCaptureEnabled === true, null, { timeout: 3_000 });
    passed('Camera disable follows live output clones', 'Disabling the only outgoing camera track disables the underlying native capture track; explicitly enabling a live clone restores native capture. Vanish keeps the outgoing track enabled and therefore keeps return-gesture capture active.');
    await page.evaluate(() => {
      const h = (window as unknown as HarnessWindow).harness;
      h.extraStreams.at(-1)!.getVideoTracks()[0]!.stop();
    });
    assert.equal(await page.evaluate(() => (window as unknown as HarnessWindow).harness.clone?.readyState), 'live');
    await page.evaluate(() => (window as unknown as HarnessWindow).harness.clone?.stop());
    await page.evaluate(() => (window as unknown as HarnessWindow).harness.stopAll());
    await page.waitForFunction(() => !(window as unknown as HarnessWindow).harness.status?.streamActive, null, { timeout: 5_000 });
    passed('Processed clones and session cleanup', 'A clone survives stopping its original. Stopping all returned video tracks/clones closes adapter sessions; the status reports no active camera pipeline.');
    return checks;
  } catch (error) {
    checks.push({ check: 'Meet integration suite', passed: false, detail: error instanceof Error ? error.message : String(error) });
    return checks;
  } finally {
    await page.evaluate(() => (window as unknown as HarnessWindow).harness?.stopAll()).catch(() => {});
    await page.close();
    await context.unroute(routePattern, routeHandler);
  }
}
