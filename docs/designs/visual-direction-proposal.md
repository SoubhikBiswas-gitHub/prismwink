# Camera Magic Studio: Visual Direction Proposal

Date: 23 October 2026
Status: APPROVED FOR IMPLEMENTATION, 23 October 2026.
Name: Prismwink
Theme: Midnight Magic
Tagline: Put a little magic on camera.

## The impression

A futuristic camera studio with the feeling of casting a spell. A calm dark work surface surrounds a vivid camera image. Light, dust, portals and dramatic transitions happen in the preview; microphone controls remain steady and readable.

## Product name

Prismwink combines prism (light, color and transformation) with wink (a small playful gesture). Write it consistently as one word. Search/listing descriptor: Prismwink: Camera Magic for Google Meet.

This is a Chrome extension. A purchased domain, separate hosted application, and domain setup are not part of the plan. The built-in studio ships with the extension; distribution is through the Chrome Web Store and release archives. Public supporting documentation can live with the repository.

## Palette and use

| Role | Value | Use |
|---|---|---|
| Midnight | #090D19 | Main canvas; visually recedes around the camera image |
| Stage | #151C2E | Opaque inspector, menus and compact meeting dock |
| Spell violet | #B6A0FF | Primary action, selection and keyboard focus |
| Prism mint | #79E8D0 | Light effects and deliberate readiness feedback |
| Stardust | #F4CC81 | Particle highlights and selected celebration effects |
| Moonlight | #F4F5FC | Main text and monochrome icons |
| Secondary text | #A6B1CA | Supporting labels and instructions |
| Error | #FF8D90 | Genuine failure, paired with an icon and text |

Use roughly 80 percent dark neutral surfaces, 15 percent content/text and 5 percent interface accents. Colorful camera effects do not count against that balance. No giant colored gradient background, glowing border on every panel or glass blur behind small text. A muted microphone is a normal intentional state; do not style it as an error.

Calculated contrast ratios: main text against Midnight 17.83:1; secondary text against Stage 7.89:1; Midnight button text against Spell violet 8.73:1; Prism mint against Stage 11.53:1. These values describe the flat color pairs, not arbitrary text placed over video or animated effects.

## Typography

- Display: Bricolage Grotesque, weight 600–700. Short titles and the wordmark have personality without becoming a difficult-to-read fantasy font.
- Controls and instructions: Manrope, weight 400–650. Use 16px for primary instructions and 14px for compact labels; avoid less than 13px in the meeting dock.
- Type scale: 14, 16, 20, 28, 40 and 56px, with responsive display sizing.
- Package verified font files locally for the eventual extension and include their licenses. Avoid a network dependency for runtime typography.

Verified sources:
- https://fonts.google.com/specimen/Bricolage+Grotesque
- https://github.com/google/fonts/blob/main/ofl/bricolagegrotesque/OFL.txt
- https://fonts.google.com/specimen/Manrope
- https://github.com/google/fonts/blob/main/ofl/manrope/OFL.txt

## Layout

Studio: one dominant 16:9 preview using about 70 percent of the working width, a 280–320px inspector at right, and a horizontal effect filmstrip beneath the preview. Keep the active visibility action and actual microphone status near the preview. Studio, Effects and My scenes form the small primary navigation.

Meeting: an opaque compact dock, approximately 300px wide, with an explicit Vanish/Return action, visible mic state, effect picker and gesture arm/disarm. The dock can collapse without hiding recovery access.

Settings: an inline inspector rather than a succession of modals. Dense controls use 8px corners; the preview uses 16px corners. Use an 8px spacing grid, 24px between groups and 32px between major regions. Interactive targets should be at least 44px when space permits.

## Icon and imagery

Recommended mark: a winking prism. Two bold faceted planes form an open lens/portal with a small disappearing cutout. A small-size version reduces to the prism silhouette and a single escaping shard. This direction ties the name to refraction, a camera and disappearance. No letter monogram, robot face or generic four-point sparkle.

The existing visual board is a theme study, not a final production icon or a measured font rendering. The production mark needs an editable vector, optical adjustment at 16 and 32px, and small-size legibility checks before release.

Use original, realistic camera scenes for promotional art. Effect previews show a person transforming and the room behind them. Show the actual product once implemented. Do not present illustrative mockups as working software or invent ratings and user counts.

## Motion and sound

Controls settle in 120–180ms. Effect thumbnails animate on deliberate hover or selection. Dust uses directional flow; return reconstructs the silhouette. Portals get a coherent arc and occlusion, not random glow scattered around the page. Calm controls make the spectacle easier to read.

Default effect duration is 2.5 seconds, adjustable in the studio. Reduced motion replaces complex dispersal with a brief fade while preserving identical state feedback. Readiness never depends on a blinking light or motion alone. Local preview/clip sounds are optional; no live meeting audio injection by default.

## Words and states

Use plain, useful controls: Vanish & mute, Return to camera, Capture empty room, Practice a gesture, Save scene, Export clip. Magic is the feeling, not a reason to call basic controls incomprehensible spell names.

Design visible, hidden, transitioning, setup, permission denied, loading and recovery states. Examples: Visible · Mic on; Hidden · Mic muted; Camera processing unavailable. If a restoration state is uncertain, keep the microphone muted and provide an explicit user action.

## Assets to produce after the direction is accepted

Editable brand mark and wordmark; 16/32/48/128 icons; real effect thumbnails; camera setup and gesture illustrations; original room/subject sample scenes; light/dark marks; clip end card; store screenshots and listing art; and an original optional preview/clip sound set. The first approved visual board becomes the reference for these assets.

## Product scope stays broad

The existing feature plan covers 60 proposed capabilities across signature effects, deliberate gestures, practical meeting tools, a practice/clip studio, playful sequences, personalization and quality. Features remain labeled for launch, expansion or experiment. No visual mockup is evidence that these features have been implemented.

## Visual concept

See prismwink-theme-concept.png in this folder. This is a visual mockup, not functioning extension software or a production icon.
