# Changelog

## Unreleased

Rebuilt around the one thing Prismwink is for: snap to vanish and mute, snap to come back.

- Works with no setup: the room behind you is learned automatically, and unseen areas are filled in.
- The snap gesture uses 3D hand landmarks, accepts a real snap (middle finger dropping to the palm), tolerates motion blur, and ignores fists, slow openings and long holds.
- The camera is processed frame by frame at full resolution and keeps streaming in a background tab; visible frames pass through untouched.
- A new dust dissolve with an ash-charred edge; return reassembles your live image.
- Mute goes through Meet's own microphone button, with track silencing as a backup. A mic you muted, or changed while hidden, is respected.
- The practice studio, the effect, palette and timing options, saved scenes and room capture were removed. Meet now shows a small status pill with one button, and the popup has a single gesture switch.

## 0.1.0

Initial development version with a TypeScript camera pipeline, a React practice studio, deliberate hand gesture detection, four particle effects, clean-room capture and microphone ownership controls. Verification and real-call limitations are documented in the README.

Release packaging prompts for a major, minor or patch bump, validates the build and browser behavior, and creates a protected versioned ZIP on the Desktop.
