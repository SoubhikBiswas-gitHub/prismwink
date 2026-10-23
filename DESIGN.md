# Prismwink visual system

Date: 23 October 2026
Status: APPROVED FOR IMPLEMENTATION, 23 October 2026.
Name: Prismwink
Theme: Midnight Magic
Tagline: Put a little magic on camera.

## The impression

The feeling of a small spell: one snap and you crumble to dust. The effect is the spectacle; the controls around it stay calm, small and readable.

## Product name

Prismwink combines prism (light, color and transformation) with wink (a small playful gesture). Write it consistently as one word. Search/listing descriptor: Prismwink: Camera Magic for Google Meet.

This is a Chrome extension distributed through the Chrome Web Store and release archives. There is no website, hosted app or dashboard.

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

Meeting: one opaque pill in the lower-left corner, above Meet's control bar. It holds a status dot, a one-line status with an optional detail line, and a single Vanish/Return button (at least 36px tall inside a 48px pill). The dot's colour and the text change together: mint for ready or hand seen, violet for an armed pinch or hidden, stardust while busy, red for a failure. The font follows Meet's own (Google Sans, then Roboto).

Popup: a 340px panel with the promise, three steps, a single Hand gesture switch and the shortcut. No other settings.

## Icon and imagery

Recommended mark: a winking prism. Two bold faceted planes form an open lens/portal with a small disappearing cutout. A small-size version reduces to the prism silhouette and a single escaping shard. This direction ties the name to refraction, a camera and disappearance. No letter monogram, robot face or generic four-point sparkle.

The existing visual board is a theme study, not a final production icon or a measured font rendering. The production mark needs an editable vector, optical adjustment at 16 and 32px, and small-size legibility checks before release.

Use original, realistic camera scenes for promotional art. Effect previews show a person transforming and the room behind them. Show the actual product once implemented. Do not present illustrative mockups as working software or invent ratings and user counts.

## Motion and sound

Controls settle in 120–180ms with ease-out curves. The dust sweeps from the top right with a grainy, ash-charred edge, and particles drift away in the person's own colours. Return plays the same motion in reverse on the live image.

Vanish takes 2.4 seconds and return 1.8 seconds. Reduced motion replaces the dust with a short fade and keeps identical state feedback. Readiness never depends on motion or colour alone. No sound is added to the meeting.

## Words and states

Use plain words: Vanish, Return, Snap to vanish, Hand seen, Now snap, You’re hidden. Magic is the feeling, not a reason for spell names on controls.

Design camera off, getting ready, ready, hand seen, armed, vanishing, hidden, returning and failure states. If the microphone state is uncertain, keep it muted and say so.

## Assets

Editable brand mark and 16/32/48/128 icons are in public/assets. Store screenshots must show the current extension in a real call.
