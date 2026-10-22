import {build} from 'esbuild';
import {cp,mkdir} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
await build({entryPoints:[path.join(root,'src/vision-worker.ts')],outfile:path.join(root,'public/vision-worker.js'),bundle:true,format:'iife',target:'chrome122',define:{'process.env.NODE_ENV':'"production"'},legalComments:'eof',minify:true});
await mkdir(path.join(root,'public/assets/wasm'),{recursive:true});
await cp(path.join(root,'node_modules/@mediapipe/tasks-vision/wasm'),path.join(root,'public/assets/wasm'),{recursive:true});
