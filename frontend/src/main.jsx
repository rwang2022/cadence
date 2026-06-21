import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { PlayerProvider } from './context/PlayerContext.jsx';
import './index.css';

// Register the service worker (manual registration; see vite.config injectRegister:false)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { type: 'module' }).catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PlayerProvider>
      <App />
    </PlayerProvider>
  </React.StrictMode>
);
