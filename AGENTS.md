# Project instructions

All source, plans, assets and tests belong in this project folder. Work on main as requested. Use the SoubhikBiswas-gitHub account and sbiswas773@gmail.com for repository work. Do not add automated authorship or co-author trailers. Use neutral product-specific names. Preserve required technical package identifiers and dependency licenses.

Read DESIGN.md for visual work. Keep core processing local. Never automatically unmute a microphone that was already muted or manually muted. A processing error while hidden must not expose the raw camera. Do not claim a live Google Meet call was verified unless a receiving participant was actually checked.

## Testing

Run `npm run check` for strict TypeScript checks, deterministic tests and the production build. Run `npm run test:browser` after building to verify the installed extension and receiving audio/video in an isolated Chromium profile. Install the test browser with `npx playwright install chromium` once. A local harness pass is not a real Google Meet call.
