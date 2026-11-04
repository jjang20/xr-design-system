import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev`          desktop browser, http://localhost:5173
// `npm run dev:headset`  https on your network, so a headset browser can open it
//                        (WebXR only runs on https or localhost)
export default defineConfig(({ mode }) => ({
  root: 'demo',
  base: './',
  plugins: mode === 'headset' ? [basicSsl()] : [],
  server: { host: mode === 'headset' },
  build: {
    outDir: '../site', emptyOutDir: true, chunkSizeWarningLimit: 1000, target: 'es2022',
    rollupOptions: { input: { main: 'demo/index.html', bench: 'demo/bench.html' } },
  },
}));
