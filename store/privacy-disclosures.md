# Privacy form preparation

Single purpose: Provide reversible local camera effects and their associated gesture/microphone controls for Google Meet, with a practice studio for the same effects.

## Permission justifications

storage: Save user-selected effect settings and declarative scene presets locally, including studio favorites and recent effects. No camera images are stored in Chrome storage.

https://meet.google.com/*: Insert the meeting control dock, intercept that site's camera capture early, and deliver processed video and immediate microphone gating during Google Meet calls. Access is limited to the supported meeting origin.

The active meeting shortcut uses the existing Meet host permission. No activeTab, tabs, scripting, screen capture or broad all-sites permission is requested.

Camera/microphone device access: Requested by Chrome only when the user opens camera mode, the optional studio microphone test, or uses Meet's own device flow. Used for camera rendering, local gesture recognition and microphone-track gating. No speech analysis or recording.

Remote code: No. The JavaScript, WebAssembly runtime and processing weights are packaged with the extension. Google Meet itself remains a separately operated website.

## User data inventory

Camera images; temporary person masks and hand landmarks; room still; microphone enabled/muted state and the outgoing audio track used in a normal Meet call; local settings, favorites, recent effects and named scene presets. These are used only for the described camera effects and controls.

Local-only handling is still user-data handling. Do not certify that no user data is handled merely because the developer has no server. Map these actual data types to the dashboard's current category definitions before checking boxes; exact webcam/microphone category mapping must be verified in the live form.

No sale, advertising use, unrelated use or credit/lending use. Affirm Limited Use compliance only while the implementation and public policy remain accurate.

Public policy: https://github.com/SoubhikBiswas-gitHub/prismwink/blob/main/PRIVACY.md

Account fields: use the existing verified publisher; verify the signed-in email, 2-Step Verification, contact verification and existing trader status. Do not change trader/legal status or publish private account details automatically.

Official sources: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy ; https://developer.chrome.com/docs/webstore/program-policies/user-data-faq ; https://developer.chrome.com/docs/webstore/program-policies/limited-use
