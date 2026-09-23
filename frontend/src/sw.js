/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';

// Precache the app shell (built assets injected here at build time).
precacheAndRoute(self.__WB_MANIFEST || []);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const AUDIO_CACHE = 'cadence-audio';
const VIDEO_CACHE = 'cadence-video';
const IMG_CACHE = 'cadence-images';

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Audio streams: serve from the offline cache when available, with proper
  // HTTP range support so the scrubber can seek even with no connection.
  if (url.pathname.includes('/stream/')) {
    event.respondWith(handleMedia(request, AUDIO_CACHE, 'audio/mpeg'));
    return;
  }

  // Downloaded videos: same idea, cache-first with range support for seeking.
  if (/\/video\/[^/]+\/file$/.test(url.pathname)) {
    event.respondWith(handleMedia(request, VIDEO_CACHE, 'video/mp4'));
    return;
  }

  // Thumbnails: cache-first so the library shows artwork offline.
  if (/(\.jpg|\.png|\.webp)$/.test(url.pathname) || url.hostname.includes('ytimg.com')) {
    event.respondWith(cacheFirst(request, IMG_CACHE));
    return;
  }
});

async function handleMedia(request, cacheName, defaultType) {
  const cache = await caches.open(cacheName);
  // Cached responses are stored as full 200s; match by URL.
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return buildRangeResponse(request, cached, defaultType);

  // Not downloaded: stream from the network. Re-issue the request with the
  // ngrok-skip header (the <audio>/<video> element can't set it itself) while
  // preserving the Range header so seeking still works online.
  const headers = new Headers();
  const range = request.headers.get('range');
  if (range) headers.set('Range', range);
  headers.set('ngrok-skip-browser-warning', 'true');
  try {
    return await fetch(request.url, { method: 'GET', headers, redirect: 'follow' });
  } catch (e) {
    return new Response('Offline and not downloaded', { status: 504 });
  }
}

// Per-Service-Worker-lifetime cache of each cached file's full Blob, keyed by
// URL, used by buildRangeResponse below. Capped and cleared wholesale if it
// grows past a handful of entries - this only needs to survive one active
// playback session, not accumulate forever.
const fullBlobCache = new Map(); // url -> Promise<Blob>

// Turn a cached full-body response into a 206 Partial Content response when the
// client asks for a byte range (required for <audio>/<video> seeking).
//
// This has to stay Blob-backed, not stream-backed: iOS Safari's <audio>/
// <video> pipeline does not reliably handle a ReadableStream-bodied Response
// returned from a Service Worker for a range request - it can fail to decode
// outright (shown as a broken-media icon) even though the exact same response
// shape works fine in Chromium. (An earlier version of this function used a
// stream specifically to avoid re-reading the whole file per request, which
// fixed a real slow-loading problem on Chromium but broke iOS Safari
// entirely - worse than the problem it fixed.)
//
// So: Blob.slice() (cheap and lazy regardless of file size) is still what
// actually serves each range, but the underlying full Blob is materialized at
// most ONCE per cached file per Service Worker lifetime instead of once per
// range request - a video/audio element fires many range requests while
// playing/seeking (Safari especially probes with small ranges up front), and
// .blob()'ing the entire cached response from scratch on every single one is
// what made a ~1GB downloaded video look like it was stuck loading forever.
async function buildRangeResponse(request, response, defaultType) {
  const range = request.headers.get('range');
  if (!range) return response;

  const url = request.url;
  if (!fullBlobCache.has(url)) {
    if (fullBlobCache.size > 8) fullBlobCache.clear(); // defensive cap, not expected to matter in practice
    fullBlobCache.set(url, response.clone().blob());
  }
  const blob = await fullBlobCache.get(url);
  const size = blob.size;

  const m = /bytes=(\d+)-(\d*)/.exec(range);
  if (!m) return response;

  const start = parseInt(m[1], 10);
  const end = m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
  if (start >= size) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${size}` },
    });
  }

  const chunk = blob.slice(start, end + 1);
  return new Response(chunk, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': response.headers.get('Content-Type') || defaultType,
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': String(chunk.size),
    },
  });
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
    return res;
  } catch (e) {
    return hit || Response.error();
  }
}
