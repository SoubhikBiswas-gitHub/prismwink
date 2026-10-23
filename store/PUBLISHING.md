# Chrome Web Store release preparation

Prepared 24 October 2026. Release candidate: 1.0.0. Packaging and review submission are separate steps; no store approval is claimed.

## Release order

1. Complete the real receiving-side Meet acceptance checks below. Fix any failures before submission.
2. In an interactive terminal, run npm run publish:package. Choose patch, minor or major explicitly. For a first public beta from 0.1.0, patch produces 0.1.1; use major for a validated 1.0.0 release. Never reuse or decrease an already uploaded store version.
3. The command checks, builds and places Prismwink-vX.Y.Z.zip on the Desktop. It restores version files on failure and never overwrites an existing ZIP.
4. Use the current 1280×800 popup capture for the controls screenshot. Label its illustrated effect preview explicitly. Add live-call screenshots only after a receiving-side call has actually been captured. Keep listing claims aligned with the exact ZIP.
5. Push the verified code, version and listing assets to main in the public project repository.
6. In the Chrome profile identified by the owner as Ace Vision seven, verify the signed-in publisher email and existing dashboard. Upload the ZIP to the existing Prismwink item glfhdbijbhlggndimmgfcdkapmkcedod, complete listing.md, reviewer-instructions.md and the privacy form preparation. Use sbiswas773@gmail.com for the publisher account. The owner reports identity verification complete and the dashboard is accessible again. Verify the signed-in email before submission.
7. Check all draft warnings and preview the public listing. Submit only after acceptance is complete and the account/data declarations are confirmed. Deferred publishing can keep an approved item from becoming public immediately; review time and approval are controlled by Google.

## Artwork pack

The 128×128 store icon is in store/graphics/icon-128.png and its source is store/source/store-icon.svg. The previous screenshots and promo tiles show the removed practice studio and must be replaced before submission. The five current screenshots cover the controls, vanish effect, return effect, visual double clap and microphone ownership. The controls screenshots and marquee promotional tile use a capture of the actual installed popup. The small promotional tile uses the product icon and text. Effect frames come from the packaged extension in the local camera test with a sample image; they are explicitly labelled as test captures. They label its illustrated preview accurately; they are not evidence of a live Meet call. Regenerate with npm run test:browser and npm run store:assets. No ratings, user counts or unverified live-call claims.

## Real-call acceptance still pending

- Two-person Google Meet receiving-side disappearance/mute/return and manual mute precedence.
- A 30-minute call, background-tab behavior and stop/restart.
- Denied/revoked permissions, real device changes and interaction with another camera effect extension.
- Sustained frame delivery on two representative computers, and repeated snap attempts under realistic lighting, including false-trigger checks during normal talking and hand movement.
- Meet's microphone button is found and switched in the live Meet interface, in the pre-join screen and in the call.

Automated local checks use real packaged vision processing and a local receiving RTC peer. They do not satisfy these hardware/live-service acceptance checks. Do not mark the release store-ready until actual results are recorded here.

## Official requirements checked

https://developer.chrome.com/docs/webstore/images
https://developer.chrome.com/docs/webstore/cws-dashboard-listing
https://developer.chrome.com/docs/webstore/publish
https://developer.chrome.com/docs/webstore/prepare
https://developer.chrome.com/docs/webstore/program-policies/user-data-faq

No purchased domain or separate application hosting is required. The public repository can provide homepage, support and privacy-policy links.

## 1.0.0 package verification

- Desktop archive: Prismwink-v1.0.0.zip; 13,168,509 bytes; 29 files.
- SHA-256: 39625159829599e170bc1bc2de81eab1ce0196993e4898e49bf6e857c4b7a5d5.
- ZIP integrity passed; every packaged file matches the tested production build. No source maps or unsafe archive paths.
- Typecheck, production build and 37 unit tests passed. Both browser regression tests passed, alongside the local receiving-peer browser workflow.
- These checks do not establish real Google Meet compatibility, background-call reliability or low-powered hardware performance. The real-call acceptance list above remains outstanding.

## Release documents

- [Store listing copy](listing.md)
- [Privacy form preparation](privacy-disclosures.md)
- [Reviewer instructions](reviewer-instructions.md)
- [Changelog](../CHANGELOG.md)

## Owner acceptance

On 24 October 2026, the owner confirmed testing a real receiving-side call for the 1.0.0 submission and approved replacing all old listing images, including the store icon. This is owner-reported acceptance, not an independently observed test. Long-call, alternate hardware and other manual checks listed above have no independently recorded results.
