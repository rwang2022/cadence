/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';

// Precache the app shell (built assets injected here at build time).
precacheAndRoute(self.__WB_MANIFEST || []);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const AUDIO_CACHE = 'cadence-audio';
const IMG_CACHE = 'cadence-images';

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Audio streams: serve from the offline cache when available, with proper
  // HTTP range support so the scrubber can seek even with no connection.
  if (url.pathname.includes('/stream/')) {
    event.respondWith(handleAudio(request));
    return;
  }

  // Thumbnails: cache-first so the library shows artwork offline.
  if (/(\.jpg|\.png|\.webp)$/.test(url.pathname) || url.hostname.includes('ytimg.com')) {
    event.respondWith(cacheFirst(request, IMG_CACHE));
    return;
  }
});

async function handleAudio(request) {
  const cache = await caches.open(AUDIO_CACHE);
  // Cached responses are stored as full 200s (via cache.add); match by URL.
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return buildRangeResponse(request, cached);

  // Not downloaded: go to the network (online streaming).
  try {
    return await fetch(request);
  } catch (e) {
    return new Response('Offline and not downloaded', { status: 504 });
  }
}

// Turn a cached full-body response into a 206 Partial Content response when the
// client asks for a byte range (required for <audio> seeking).
async function buildRangeResponse(request, response) {
  const range = request.headers.get('range');
  if (!range) return response;

  const buf = await response.clone().arrayBuffer();
  const size = buf.byteLength;
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

  const chunk = buf.slice(start, end + 1);
  return new Response(chunk, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': String(chunk.byteLength),
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
