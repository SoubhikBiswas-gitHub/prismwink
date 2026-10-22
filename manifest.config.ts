import {defineManifest} from '@crxjs/vite-plugin';
import pkg from './package.json' with {type:'json'};
export default defineManifest({
  manifest_version:3,
  name:'Prismwink',
  version:pkg.version,
  description:'Camera magic for Google Meet. Disappear into particles, mute, and return with a deliberate hand gesture.',
  minimum_chrome_version:'122',
  permissions:['storage'],
  host_permissions:['https://meet.google.com/*'],
  action:{default_title:'Prismwink',default_popup:'popup.html'},
  background:{service_worker:'src/background.ts',type:'module'},
  icons:{16:'assets/icons/icon-16.png',32:'assets/icons/icon-32.png',48:'assets/icons/icon-48.png',128:'assets/icons/icon-128.png'},
  commands:{'toggle-vanish':{suggested_key:{default:'Alt+Shift+V',mac:'Alt+Shift+V'},description:'Vanish or return in the active Meet tab'}},
  content_scripts:[
    {matches:['https://meet.google.com/*'],js:['src/hook.ts'],run_at:'document_start',world:'MAIN'},
    {matches:['https://meet.google.com/*'],js:['src/content.ts'],run_at:'document_start'}
  ],
  web_accessible_resources:[{resources:['engine.html','vision-worker.js','assets/wasm/*','assets/*.tflite','assets/*.task','assets/icon.svg','assets/fonts/*'],matches:['https://meet.google.com/*']}],
  content_security_policy:{extension_pages:"script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; object-src 'self';"}
});
