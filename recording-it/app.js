// app.js — Recording It app entry (scaffold).
//
// This boots the worker infrastructure and shows the detected environment. It is deliberately
// minimal: the real recorder UI is a later phase. Its job here is to (a) register the Service
// Worker, (b) surface CAPABILITIES, and (c) prove the WorkerBridge wiring imports cleanly.

import { CAPABILITIES } from './src/capability-check.js';

// --- Service Worker registration -------------------------------------------------------------
// Scoped to /recording-it/ so this worker controls ONLY the Recording It app, never the Kudbee
// marketing site at /. The scope must be a path the worker script can legally control (the script
// lives at /recording-it/sw.js, so /recording-it/ is valid).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/recording-it/sw.js', { scope: '/recording-it/' })
    .then((reg) => {
      console.debug('[App] Service worker registered:', reg.scope);
    })
    .catch((err) => {
      console.warn('[App] Service worker registration failed:', err);
    });
}

// --- Surface capabilities in the page --------------------------------------------------------
const capEl = document.getElementById('capabilities');
if (capEl) {
  capEl.textContent = JSON.stringify(CAPABILITIES, null, 2);
}

// --- Lazy worker boot ------------------------------------------------------------------------
// We do NOT spawn workers on load — each eagerly downloads a large WASM/model payload, which would
// waste bandwidth before the user does anything. Instead we expose a tiny boot hook the (future)
// UI can call when a feature is first used. Imported dynamically so the heavy graph is only parsed
// on demand.
async function bootWorkers(pluginNames = ['opencv']) {
  const statusEl = document.getElementById('worker-status');
  try {
    const { createWorkerBridge } = await import('./src/worker-bridge.js');
    if (statusEl) statusEl.textContent = `Starting workers: ${pluginNames.join(', ')}…`;
    const bridge = await createWorkerBridge(pluginNames);
    if (statusEl) statusEl.textContent = JSON.stringify(bridge.status(), null, 2);
    return bridge;
  } catch (err) {
    if (statusEl) statusEl.textContent = `Worker boot failed: ${err.message}`;
    console.error('[App] Worker boot failed:', err);
    throw err;
  }
}

// Expose for manual verification from the console (e.g. `await KudbeeRecordingIt.bootWorkers()`).
window.KudbeeRecordingIt = { CAPABILITIES, bootWorkers };

console.debug('[App] Recording It scaffold booted.');
