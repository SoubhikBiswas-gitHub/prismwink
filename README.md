# Prismwink

Snap your fingers in Google Meet and turn to dust. Your microphone mutes as you vanish. Snap again to come back.

Prismwink is a Chrome extension. Everything runs on your computer: the camera, the hand tracking and the effect. Nothing is uploaded.

## Use it

1. Install Node.js 24 or newer, then run `npm ci` and `npm run check`.
2. Open `chrome://extensions`, turn on Developer mode, choose **Load unpacked** and select the `dist` folder.
3. Join a Google Meet call with your camera on. Reload any Meet tab that was open before you installed.
4. Raise a hand, press your thumb and middle finger together, and snap. You dissolve into dust and your mic mutes.
5. Snap again to come back. Your mic turns back on only if Prismwink muted it.

A small pill in the lower-left corner shows what Prismwink sees. "Hand seen" means your hand is tracked, and "Now snap" means the pinch is armed. The pill also has a Vanish/Return button. The keyboard shortcut is **Alt+Shift+V**; change it at `chrome://extensions/shortcuts`. The popup can turn the hand gesture off.

There is no setup step. Prismwink learns your room from the background around you while you are visible. Any area it has never seen, usually right behind you, is filled in smoothly. For a perfect vanish, step out of view for a moment once and the whole room is learned.

## How it works

- `src/hook.ts` runs in the page before Meet loads. It wraps the camera in a frame-by-frame pipeline (`MediaStreamTrackProcessor` → canvas → `MediaStreamTrackGenerator`). While you are visible, camera frames pass through untouched at full resolution. Frames are driven by the camera, not by timers, so the video keeps flowing when the Meet tab is in the background.
- `src/vision-worker.ts` runs MediaPipe person segmentation and hand tracking in a worker inside the extension's own frame (`engine.html`), so Meet's content policy does not apply. Models and WebAssembly are bundled.
- `src/gesture.ts` detects the snap from 3D hand landmarks: a thumb–middle-finger pinch, then a quick release or a curl of the middle finger. It ignores fists, slow openings, long holds and other hands, and tolerates the motion blur of a real snap.
- `src/room.ts` builds the empty room from background pixels and fills the unseen gaps.
- `src/effects.ts` draws the dust: a grainy front that chars the edges to ash and blows particles away in your own colours. Return plays it in reverse on your live image.
- Mute uses Meet's own microphone button, so everyone sees you as muted. As a backup, the microphone track itself is also silenced. A mic you muted yourself is never turned on, and a mic change you make while hidden wins.

## Commands

- `npm run check`: strict type checks, unit tests and the production build.
- `npm run test:browser`: loads the built extension in Chromium with a fake camera (a real portrait) and a WebRTC receiver. It checks the full vanish/return, mute and shortcut flow. Run `npx playwright install chromium` once first.
- `npm run publish:package`: choose a version bump, validate, build and create a ZIP on your Desktop.

## Limits

- The room behind you is a still image while you are hidden.
- The camera stays on while you are hidden, so it can see your snap to return.
- Automated tests use a fake camera and a local receiver, not a real Meet call or a real hand. Check the gesture and a live call with a second participant before release.

See [PRIVACY.md](PRIVACY.md) and the [visual system](DESIGN.md).
