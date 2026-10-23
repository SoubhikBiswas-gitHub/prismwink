import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {crx} from '@crxjs/vite-plugin';
import manifest from './manifest.config.ts';
import {resolve} from 'node:path';
export default defineConfig({
  base:'./',
  plugins:[react(),crx({manifest,contentScripts:{standaloneFiles:['src/hook.ts','src/content.ts']}})],
  build:{outDir:'dist',emptyOutDir:true,target:'chrome122',sourcemap:false,rollupOptions:{input:{engine:resolve(import.meta.dirname,'engine.html')}}},
  server:{host:'127.0.0.1',port:5173,strictPort:true}
});
