import './prepare.mjs';
import {build} from 'vite';
import {readFile,access} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
await build({root});
const manifest=JSON.parse(await readFile(path.join(root,'dist/manifest.json'),'utf8'));
const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
if(typeof manifest.description!=='string'||manifest.description.length>132)throw new Error('The store description must be at most 132 characters.');
if(manifest.version!==pkg.version)throw new Error('Manifest/package version mismatch.');
for(const file of ['studio.html','popup.html','engine.html','vision-worker.js','assets/selfie_segmenter_landscape.tflite','assets/hand_landmarker.task',...Object.values(manifest.icons),...manifest.content_scripts.flatMap(item=>item.js)])await access(path.join(root,'dist',file));
const main=manifest.content_scripts.find(item=>item.world==='MAIN');
if(!main||main.run_at!=='document_start')throw new Error('Camera hook must run in MAIN at document_start.');
for(const file of main.js){const code=await readFile(path.join(root,'dist',file),'utf8');if(/import\s*\(/.test(code))throw new Error('The early camera hook cannot use an asynchronous module loader.');}
console.log(`Built Prismwink ${pkg.version} with Vite, React and CRXJS.`);
