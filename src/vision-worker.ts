import { FilesetResolver, ImageSegmenter, HandLandmarker } from '@mediapipe/tasks-vision';
import { ClapDetector, SnapDetector } from './gesture';

interface FrameRequest { type: 'frame'; id: number; bitmap: ImageBitmap; timestamp: number; hands: boolean; claps: boolean }
type Request = { type: 'init' } | FrameRequest;
const scope = self as unknown as { location: { href: string }; onmessage: ((event: MessageEvent<Request>) => void) | null; postMessage: (message: unknown, transfer?: Transferable[]) => void };

let segmenter: ImageSegmenter | undefined;
let hands: HandLandmarker | undefined;
let loading: Promise<void> | undefined;
let lastTimestamp = 0;
const detector = new SnapDetector();
const clapper = new ClapDetector();

async function load() {
  const root = new URL('assets/', scope.location.href).href;
  const files = await FilesetResolver.forVisionTasks(`${root}wasm`);
  hands = await HandLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: `${root}hand_landmarker.task`, delegate: 'CPU' },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
  // The segmenter needs WebGL even on the CPU delegate; without it the gesture still works and the effect degrades to a fade.
  const probe = new OffscreenCanvas(1, 1);
  if (!probe.getContext('webgl2') && !new OffscreenCanvas(1, 1).getContext('webgl')) return;
  try {
    segmenter = await ImageSegmenter.createFromOptions(files, {
      baseOptions: { modelAssetPath: `${root}selfie_segmenter_landscape.tflite`, delegate: 'CPU' },
      runningMode: 'VIDEO',
      outputCategoryMask: false,
      outputConfidenceMasks: true
    });
  } catch {
    segmenter = undefined;
  }
}

function analyse({ id, bitmap, timestamp, hands: wantSnap, claps: wantClaps }: FrameRequest) {
  const started = performance.now();
  const time = Math.max(Number.isFinite(timestamp) ? timestamp : started, lastTimestamp + 1);
  lastTimestamp = time;
  const segmentation = segmenter?.segmentForVideo(bitmap, time);
  try {
    let mask: { data: Uint8Array; width: number; height: number } | undefined;
    if (segmentation) {
      const masks = segmentation.confidenceMasks;
      if (!masks?.length) throw new Error('No person mask was returned.');
      const confidence = masks[masks.length > 1 ? 1 : 0];
      const values = confidence.getAsFloat32Array();
      const data = new Uint8Array(values.length);
      for (let i = 0; i < values.length; i++) data[i] = Math.round(Math.min(1, Math.max(0, values[i])) * 255);
      mask = { data, width: confidence.width, height: confidence.height };
    }
    let gesture: { snap: boolean; hand: string } = { snap: false, hand: 'none' };
    let clap = { clap: false, pending: false };
    if (wantSnap || wantClaps) {
      const result = hands!.detectForVideo(bitmap, time);
      const frame = { landmarks: result.landmarks, worldLandmarks: result.worldLandmarks };
      gesture = detector.update(frame, time);
      if (!wantSnap) { detector.reset(); gesture = { snap: false, hand: result.landmarks.length ? 'hand' : 'none' }; }
      if (wantClaps) clap = clapper.update(frame, time);
      else clapper.reset();
    } else { detector.reset(); clapper.reset(); }
    scope.postMessage({ type: 'result', id, mask, ...gesture, clap: clap.clap, clapPending: clap.pending, ms: performance.now() - started }, mask ? [mask.data.buffer] : []);
  } finally {
    segmentation?.close();
  }
}

scope.onmessage = async (event) => {
  const message = event.data;
  if (message?.type === 'init') {
    try {
      loading ||= load();
      await loading;
      scope.postMessage({ type: 'ready', segmentation: Boolean(segmenter) });
    } catch (error) {
      scope.postMessage({ type: 'error', message: `Local camera processing could not load: ${error instanceof Error ? error.message : 'unknown error'}` });
    }
    return;
  }
  if (message?.type !== 'frame') return;
  try {
    if (!hands) throw new Error('Camera processing is not ready.');
    analyse(message);
  } catch (error) {
    scope.postMessage({ type: 'result-error', id: message.id, message: error instanceof Error ? error.message : 'Camera frame processing failed.' });
  } finally {
    message.bitmap?.close();
  }
};
