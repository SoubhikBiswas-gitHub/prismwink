# Chrome Web Store release preparation

Prepared 23 October 2026. Current source version: 0.1.0 (development candidate). No store submission or approval is claimed.

## Release order

1. Complete the real receiving-side Meet acceptance checks below. Fix any failures before submission.
2. In an interactive terminal, run npm run publish:package. Choose patch, minor or major explicitly. For a first public beta from 0.1.0, patch produces 0.1.1; use major for a validated 1.0.0 release. Never reuse or decrease an already uploaded store version.
3. The command checks, builds and places Prismwink-vX.Y.Z.zip on the Desktop. It restores version files on failure and never overwrites an existing ZIP.
4. Capture new 1280×800 screenshots from the final build in a real Meet call (ready pill, mid-vanish, hidden room). Keep the listing claims aligned with the exact ZIP.
5. Push the verified code, version and listing assets to main in the public project repository.
6. In the Chrome profile identified by the owner as Ace Vision seven, verify the signed-in publisher email and existing dashboard. Upload the ZIP as a new item, complete listing.md, reviewer-instructions.md and the privacy form preparation. Account access is not yet verified for that profile.
7. Check all draft warnings and preview the public listing. Submit only after acceptance is complete and the account/data declarations are confirmed. Deferred publishing can keep an approved item from becoming public immediately; review time and approval are controlled by Google.

## Artwork pack

The 128×128 store icon is in store/graphics/icon-128.png and its source is store/source/store-icon.svg. The previous screenshots and promo tiles showed the removed practice studio and were deleted. At least one new screenshot of the current extension is required before upload; promo tiles are optional. No ratings, user counts or unverified live-call claims.

## Required acceptance still pending

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
