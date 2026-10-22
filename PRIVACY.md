# Prismwink privacy policy

Effective date: 23 October 2026

Prismwink provides local camera effects, gesture controls and microphone-state controls for Google Meet, with a separate practice studio. It has no analytics, advertising tracker, account system or developer-operated frame-upload service.

## Data used for the features

Camera frames are processed locally to render the outgoing camera image. Local processing derives a person mask and temporary hand landmarks/gesture state to recognize a deliberate thumb–middle-finger pinch and release. This processing does not identify people or create an identity profile. The required processing runtime and weights are packaged with the extension.

An empty-room still is captured only when you choose the capture action. Frames, masks, landmarks and the room still remain in session memory and are discarded when the camera session stops, the page closes or the relevant capture is cleared. The room still is not a live reconstruction.

Microphone controls use the enabled/muted state of the outgoing microphone tracks. The extension gates those tracks on disappearance and restores only a previous state it still owns. It does not analyze speech, transcribe audio, record calls or send audio to the developer. The optional studio microphone test is local and does not play or save audio.

Studio effect settings, favorites, recently used effects and named scene presets may persist in Chrome's local extension storage. The Meet dock stores its preferences separately. These settings do not contain camera frames or room captures. Scene import/export handles declarative preset files chosen by the user; it cannot execute code or load remote effects.

## Sharing and transmission

During a meeting, Google Meet receives and transmits the outgoing processed camera stream and microphone audio as part of the normal call. Other participants can see the processed video without installing Prismwink. Google Meet and other participants handle that call data under their own policies and choices.

Prismwink does not sell data, use it for advertising, send it to a developer service, or collect other participants' video, meeting chat or screen sharing. Exported scene files stay on the device unless you choose to share them.

## Camera access and deletion

The physical camera remains active while you are hidden so a return gesture can still be detected. Hidden camera output does not mean the camera hardware is off. Controls show this behavior and provide stop and safe recovery actions.

Use Clear room capture to discard the studio capture, Clear in the Meet dock to discard its room capture, Clear saved scenes to delete studio presets, and Reset effect settings to restore studio defaults. Stop camera and microphone ends the studio's hardware capture. Use Stop processing in the Meet dock to stop its camera processing, or turn off the camera and microphone in Meet. Chrome controls camera/microphone permissions; you can revoke them through Chrome. Removing the extension clears its stored preferences. Chrome may independently retain downloaded preset files until you delete them.

## Limited Use

Prismwink uses the data described here only for its camera effects and controls, in accordance with the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), including its [Limited Use requirements](https://developer.chrome.com/docs/webstore/program-policies/limited-use).

## Contact and changes

Questions and privacy requests can be raised through the [project support issues](https://github.com/SoubhikBiswas-gitHub/prismwink/issues). Updates to this policy will be published here with a revised effective date.
