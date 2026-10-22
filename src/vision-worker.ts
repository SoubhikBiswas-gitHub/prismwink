import { FilesetResolver, ImageSegmenter, HandLandmarker } from '@mediapipe/tasks-vision';
import { SnapGestureDetector } from './gesture';

interface WorkerRequest { type: 'init' | 'frame'; id: number; bitmap: ImageBitmap; timestamp?: number }
const workerScope = self as unknown as { location: { href: string }; onmessage: ((event: MessageEvent<WorkerRequest>) => Promise<void>) | null; postMessage: (message: unknown, transfer?: Transferable[]) => void };

let segmenter: ImageSegmenter | undefined;
let handTracker: HandLandmarker | undefined;
let initialization: Promise<void> | undefined;
let lastTimestamp = -1;
const gestures = new SnapGestureDetector();

async function initialize() {
  const root = new URL('assets/', workerScope.location.href).href;
  const vision = await FilesetResolver.forVisionTasks(`${root}wasm`);
  segmenter = await ImageSegmenter.createFromOptions(vision, {
    baseOptions: { modelAssetPath: `${root}selfie_segmenter_landscape.tflite`, delegate: 'CPU' },
    runningMode: 'VIDEO',
    outputCategoryMask: false,
    outputConfidenceMasks: true,
  });
  try {
    handTracker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: `${root}hand_landmarker.task`, delegate: 'CPU' },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });
  } catch (error) {
    segmenter.close();
    segmenter = undefined;
    throw error;
  }
}

workerScope.onmessage = async event => {
  const message = event.data;
  if (!message || !['init', 'frame'].includes(message.type)) return;
  if (message.type === 'init') {
    try {
      initialization ||= initialize();
      await initialization;
      workerScope.postMessage({ type: 'ready' });
    } catch {
      workerScope.postMessage({ type: 'error', message: 'Could not load local camera processing assets. Check the extension installation.' });
    }
    return;
  }
  const { bitmap, id } = message;
  let result: ReturnType<ImageSegmenter['segmentForVideo']> | undefined;
  try {
    if (!segmenter || !handTracker) throw new Error('Camera processing is not ready.');
    const requested = message.timestamp;
    const timestamp = Math.max(typeof requested === 'number' && Number.isFinite(requested) ? requested : performance.now(), lastTimestamp + 0.01);
    lastTimestamp = timestamp;
    result = segmenter.segmentForVideo(bitmap, timestamp);
    const masks = result.confidenceMasks;
    if (!masks?.length) throw new Error('No person mask was returned.');
    const labels = segmenter.getLabels();
    let personIndex = labels.findIndex(label => /person|foreground/i.test(label));
    if (personIndex < 0 || personIndex >= masks.length) personIndex = masks.length > 1 ? 1 : 0;
    const confidence = masks[personIndex];
    const floats = confidence.getAsFloat32Array();
    const data = new Uint8Array(floats.length);
    for (let i = 0; i < floats.length; i++) data[i] = Math.round(Math.max(0, Math.min(1, floats[i])) * 255);
    const mask = { data, width: confidence.width, height: confidence.height };
    const hands = handTracker.detectForVideo(bitmap, timestamp);
    const gesture = gestures.update(hands, timestamp);
    workerScope.postMessage({ type: 'result', id, mask, ...gesture }, [data.buffer]);
  } catch (error) {
    workerScope.postMessage({ type: 'error', id, message: error instanceof Error ? error.message : 'Camera frame processing failed.' });
  } finally {
    result?.close();
    bitmap?.close();
  }
};
