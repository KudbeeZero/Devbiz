// vite.config.js — build/dev config for the Recording It sub-app ONLY.
//
// The rest of the Kudbee site is a zero-build static site; this config is scoped to
// /recording-it/ and does not affect it. Vite is used here purely because the WASM/ML libraries
// (ffmpeg.wasm, Transformers.js, MediaPipe, Tesseract) ship as bare-specifier ES modules that
// need a bundler to resolve.

import { defineConfig } from 'vite';

export default defineConfig({
  // The app is served under /recording-it/ in production, so asset URLs must be prefixed to match.
  base: '/recording-it/',

  server: {
    // Mirror the production COOP/COEP/CORP headers locally so cross-origin isolation
    // (SharedArrayBuffer, multi-threaded ffmpeg.wasm) works in `vite dev` exactly as it will in
    // production. Without these, crossOriginIsolated is false and threads silently degrade.
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    },
  },

  build: {
    // ffmpeg.wasm and friends rely on modern JS (top-level await, dynamic import); target the
    // latest so Vite doesn't down-level and break them.
    target: 'esnext',
    rollupOptions: {
      input: {
        main: 'index.html',
      },
    },
  },

  worker: {
    // Emit our ES-module workers as ESM so their `import` statements survive the build. The
    // classic opencv worker uses importScripts and is unaffected by this setting.
    format: 'es',
  },

  optimizeDeps: {
    // CRITICAL: Vite's dependency pre-bundler rewrites ffmpeg.wasm's internal dynamic imports and
    // breaks its core loading. Excluding it forces Vite to serve it as-is.
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
});
