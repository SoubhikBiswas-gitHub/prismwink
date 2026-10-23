# Privacy form preparation

Single purpose: let a Google Meet user vanish from their camera with a dust effect and mute, then return, using a finger snap, double clap, a button or a shortcut.

## Permission justifications

storage: Saves snap and double-clap preferences, popup theme, and the meeting pill position/collapsed state locally. No images are stored.

https://meet.google.com/*: Runs the camera effect and the on-screen pill inside Google Meet, before Meet requests the camera, and switches Meet's microphone button. No other sites are accessed.

Camera and microphone: Requested by Google Meet through Chrome's normal prompt. Prismwink processes camera frames locally for the effect, room learning and gesture recognition (including visual double clap), and changes only the microphone's on/muted state. No recording or speech analysis.

Remote code: No. All JavaScript, WebAssembly and model files are packaged.

## User data inventory

Camera frames, temporary person outlines and hand landmarks, a learned room image held in memory, the microphone on/muted state, and local gesture, theme and pill-placement preferences. Used only for the feature above, never sent anywhere by the extension. Map these to the dashboard's current categories in the live form; local-only handling is still handling.

No sale, advertising or unrelated use. Public policy: https://github.com/SoubhikBiswas-gitHub/prismwink/blob/main/PRIVACY.md

Account fields: use the existing verified publisher account and check its details in the dashboard. Do not change trader or legal status automatically.
