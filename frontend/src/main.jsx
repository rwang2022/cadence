import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { PlayerProvider } from './context/PlayerContext.jsx';
import './index.css';

// Register the service worker (manual registration; see vite.config injectRegister:false)
//
// Auto-update flow: the SW calls skipWaiting()+clients.claim(), so a freshly
// deployed build takes control of open tabs as soon as it installs. When that
// happens the browser fires `controllerchange` — we reload once so the page
// actually loads the new (content-hashed) JS/CSS instead of the stale bundle
// still running in memory. This is what removes the "refresh twice by hand" /
// "delete and re-add to home screen" dance.
if ('serviceWorker' in navigator) {
  // If the page loaded with no controller, the first controllerchange is just
  // the initial SW taking control on first visit — not a new version — so don't
  // reload for that one.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });

  window.addEventListener('load', async () => {
    try {
      // updateViaCache:'none' => always fetch sw.js fresh when checking for
      // updates, so a new deploy is detected even behind a CDN cache.
      const reg = await navigator.serviceWorker.register('/sw.js', {
        type: 'module',
        updateViaCache: 'none',
      });

      // iOS standalone PWAs resume rather than reload, so they'd otherwise never
      // re-check for a new build. Poke the SW on an interval and every time the
      // app comes back to the foreground.
      const checkForUpdate = () => reg.update().catch(() => {});
      setInterval(checkForUpdate, 60 * 60 * 1000); // hourly while open
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      });
    } catch (err) {
      console.warn('SW registration failed:', err);
    }
  });

  // Ask the browser to keep our library/queue/audio cache from being evicted
  // under storage pressure. (Does not survive deleting the PWA itself.)
  if (navigator.storage?.persist) {
    navigator.storage.persist().catch(() => {});
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PlayerProvider>
      <App />
    </PlayerProvider>
  </React.StrictMode>
);
