# Prismwink: Camera Magic Studio

Date: 23 October 2026
Status: APPROVED FOR IMPLEMENTATION, 23 October 2026.
Name: Prismwink
Tagline: Put a little magic on camera.

## Product idea

Turn a webcam into a small stage. People can disappear, return, celebrate, present, and create short camera tricks using deliberate gestures. Google Meet is the first meeting integration. A separate Playground lets people practice and make clips without entering a call.

The signature experience: snap, dissolve into particles, and mute immediately; snap again, return and restore only the microphone state owned by the extension. Everyone receives the processed outgoing camera video without installing anything themselves.

A memorable scene: vanish, change your hat or pose while hidden, then return through a portal. Another: a teacher raises a hand and reveals a celebration around themselves. Another: a presenter switches from a casual camera scene to a polished introduction with a single shortcut.

## Product structure

- Meeting: a small control dock with Vanish/Return, effect picker, actual microphone status, gesture arm/disarm, and emergency recovery.
- Playground: a large preview, effect library, gesture practice, scene builder, and explicit recording/export controls.
- Setup: check the camera, frame your hand, capture the empty room, and rehearse once.
- Library: effect previews, favorites, saved scenes, and import/export of declarative presets.

There is no account requirement for the core local experience. Advanced controls stay in the studio, rather than covering the meeting page.

## Feature inventory

L = first public release candidate. E = planned expansion after the core is verified. X = exploratory; prototype before making public promises. All items below are planned, not implemented.

### Signature magic

1. L: Dust dissolve and reverse reconstruction, sampled from the person's actual image.
2. L: Pixel scatter and reassembly, with a playful retro look.
3. L: Confetti exit and confetti entrance.
4. L: Soft smoke-style reveal made from procedural particles.
5. E: Hologram interruption, scan lines and reconstruction.
6. E: Comic ink dissolve with bold halftone edges.
7. E: Paper-fold exit and unfolding return.
8. X: Portal entrance with convincing foreground occlusion and a moving rim.
9. X: Origami flock: the silhouette breaks into paper birds.
10. E: Independent entrance and exit selection; dust out, confetti back.
11. L: Duration, direction, density and palette controls with sensible presets.
12. E: Shuffle a favorite set of effects; the next effect is visible privately before triggering.

### Gestures and controls

13. L: Visual snap-like pinch/release detection, with clear practice feedback. It detects motion, not snap sound.
14. L: Configurable keyboard shortcut and a large manual toggle.
15. L: Left/right hand support and a practice view that shows whether the gesture was recognized.
16. L: Arm/disarm gestures and a cooldown to avoid repeated accidental toggles.
17. E: Hold an open palm to trigger a deliberately chosen action.
18. E: Peace sign for a celebration; double gesture for a different saved cue.
19. E: Map gestures to scenes, rather than making every gesture toggle visibility.
20. X: Hand-position effects: draw a small spotlight or move a floating sticker with a pinch.

### Useful meeting tools

21. L: Immediate audio gating on vanish; display separately whether Meet's visible mic control was also synchronized.
22. L: Preserve prior mute state. Returning never unmutes someone who was already muted.
23. L: Manual mute takes precedence over automatic restoration.
24. L: Empty-room capture with a countdown and a retake action; warn that the plate is a still image.
25. E: Custom away card: Back shortly, Taking a break, or a short personal message.
26. E: An optional break countdown displayed on the outgoing camera. Expiry prompts a return; it never automatically unmutes.
27. E: Presenter scene: name, role, simple lower third, and an optional camera-frame title.
28. E: Focus scene: subdued background and a clean subject outline.
29. E: Celebration cues for milestones, birthdays, applause and a finished presentation.
30. E: Camera-safe zone preview showing where common meeting crops may cut off an overlay.
31. L: Emergency recovery with an explicit camera choice and microphone kept muted until the user acts.
32. L: Visible notice explaining that the physical camera stays active while hidden so return gestures can still be detected.

### Playground and creation

33. L: Permission-free sample scene to try the effect before granting camera access.
34. L: Camera practice outside a meeting, with a visible camera stop button.
35. E: Sequence builder: entrance, pose time, exit; preview before saving.
36. E: Save named scenes such as Quiet break, Grand entrance and Celebration.
37. E: Explicit short-clip recording of the user's processed camera only; no meeting participants or screen capture.
38. E: Trim and export WebM clips, with MP4 considered only after encoder/browser feasibility is tested.
39. E: Portrait, square and landscape composition guides for clips.
40. E: Before/after reveal templates made from the user's own recording.
41. E: Add a caption, title or optional local sound effect to exported clips.
42. E: Capture a still frame or a transparent subject cutout for a personal sticker.

### Playful discoveries

43. E: Hat-change reveal: a guided vanish/change/return sequence.
44. E: Outfit-change and pose-change templates with a private countdown.
45. E: Personal challenge cards: best dramatic return, fastest costume change, or most surprising entrance.
46. E: Preset exchange through a small local file or encoded link, with a preview before import.
47. E: A matching-cue countdown code friends can enter manually; synchronization is approximate without a shared service.
48. X: Gesture-driven mini games confined to Playground, such as catching particles or popping floating shapes.
49. X: A freeze-frame afterimage that crumbles while the live subject exits.
50. X: Presenter camera props: reveal a product image beside the subject with a deliberate cue.

### Personalization and quality

51. L: Favorites, recently used effects and a reset-to-default action.
52. L: Compact and expanded dock layouts, keyboard navigation and visible focus states.
53. L: Reduced-motion mode and text labels alongside color status indicators.
54. E: Original celebration packs, seasonal palettes and custom accent colors.
55. E: User-uploaded backgrounds and overlay stickers, processed locally.
56. L: Automatic quality reduction with an honest indicator when frame processing is too slow.
57. L: Diagnostics for camera permission, capture readiness, gesture readiness and outgoing processing health.
58. L: Delete local presets, clear the room capture, and stop processing from one settings screen.
59. E: Other browser meeting integrations, each with separate compatibility tests and explicit support labels.
60. X: Desktop virtual-camera companion for applications outside the browser; this is a separate product component.

## Behavior that must be correct

- On a valid vanish action, mute the outgoing microphone tracks synchronously before the first transition frame. Meet button synchronization is a secondary step; never claim success from the button label alone.
- Record restoration ownership per track and session. If muted beforehand, manually muted afterward, host-muted, permission-revoked or disconnected, do not auto-unmute. If ownership or actual state is uncertain, stay muted and show a recovery action.
- Do not interpret microphone capture or a disabled track as proof of transport silence. Verify the receiving side in a real two-person call.
- Disallow overlapping transitions. No new camera content appears once fully hidden, including after a camera switch or processing restart.
- If the pipeline fails while hidden, keep a locally available safe plate or neutral card and keep audio muted. Do not silently fall back to the raw camera. Offer an explicit return-to-camera action.
- The room plate is captured before use, stored in session memory and invalidated on camera or resolution change. It cannot reveal a real room that was never captured. Background movement will not continue in a still plate.
- Person cutouts and fast gesture detection have edge cases. Teach a slower pinch/release motion and always offer a manual control. Gesture recognition does not depend on listening to the microphone.
- Local sound effects are for private previews or exported clips initially. Sending sounds into a live call requires separate audio routing and is deferred.
- Core camera and gesture processing uses bundled resources. No camera frames, recordings or room captures are uploaded. Optional future connected features need their own clear opt-in.

## Visual identity and assets

Name: Prismwink. A camera magic studio built around light, transformation and playful gestures.

Proposed identity: Midnight Magic, with a faceted winking-prism mark. The earlier letter and portal concepts are discarded. The updated visual-direction proposal in this folder defines exact colors, typography, composition and motion. The visual direction was accepted with the implementation instruction.

Asset deliverables after design approval: editable vector icon, optically adjusted 16/32/48/128 PNG icons, wordmark, light/dark marks, original effect thumbnails, empty-room sample, onboarding illustrations, custom gesture illustrations, cursor/focus states, original export sound cues, launch video storyboard, store screenshots and listing artwork. Store image dimensions must be verified against current submission requirements before export. No borrowed characters, branded superhero effects or unlicensed soundtrack material.

## Implementation approach to validate later

Use one state machine for visible, vanishing, hidden, returning and recovery states. Use a shared renderer for Playground and the intercepted outgoing meeting camera. An early page-world hook handles camera capture, an isolated adapter handles meeting controls, and an extension-origin processing context runs locally bundled person segmentation and hand tracking. Keep audio gating independent of renderer health. Version scene presets and allow only declarative values and approved local assets; imported presets cannot execute scripts or load remote code.

This architecture is a proposal, not validated implementation. The first prototype must prove that meeting capture interception, extension content policy, background-tab scheduling, stream cleanup and camera switching work together. An effect appearing in the self-preview alone is insufficient.

## Release sequence and acceptance criteria

1. Proof: outgoing camera processing, visual pinch/release, dust effect, empty-room capture and audio ownership. No larger effects library until this passes a two-person Meet test.
2. Public candidate: the L features above, four visual styles, accessible setup, useful diagnostics and an installable archive. Require a 30-minute call with no unintended camera reveal or unmute, successful stop/restart and device-change tests, correct behavior with denied/revoked permissions and other camera effects, and sustained usable frame delivery on two representative computers. Target at least 24 outgoing frames per second at 640x360 on a supported baseline device; reduce detail rather than silently freezing. Benchmark gesture recognition with repeated attempts and normal conversation movements; publish limitations instead of inventing accuracy claims.
3. Expansion: prioritize saved scenes, portal prototype, away cards, presenter overlays and local clip export. Release additional effects only after receiving-side visual checks and performance checks.
4. Experiments: advanced hand interactions, cooperative timing, mini games, and desktop camera support. Keep these out of supported-feature claims until validated.

No purchased domain or separate hosted application is required or planned. The practice studio ships inside the extension.

Distribution: a public repository, reproducible release archives, installation guide, privacy policy and a store submission. Build/test/archive in repository automation; publishing remains a separate owner-authorized action. The core local experience stays free for launch; pricing for optional packs is an open question. No forced watermark in meeting video. A branded end card in exported clips is optional and removable.

## Decisions and open points

Decided product scope: camera magic studio, Google Meet first, Meeting plus Playground, immediate mute on vanish, prior-state restoration, Prismwink branding, a prism icon direction under review, local core processing, implementation authorized.

The smaller meeting-only direction would not meet the requested breadth. A recording-first creator suite would delay the core meeting experience; recording is an expansion within Playground instead.

Open: tested browser baseline, best-performing processing runtime, and whether the portal/clip experiments are worth promoting to the supported library.

## Next step

Review this design, then make the first visual board and a proof of outgoing camera processing under the approved implementation instruction. Start with one complete disappear/mute/return cycle before building the library.

## What shaped this plan

- The request for a public release makes the name, icon, install experience and receiving-side behavior part of the product.
- The repeated request for useful, playful, interesting features leads to separate Meeting and Playground modes, rather than a crowded meeting toolbar.
- The requirement to mute at the same moment makes microphone ownership and failure behavior central acceptance criteria.
