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

// Turn a cached full-body response into a 206 Partial Content response when the
// client asks for a byte range (required for <audio>/<video> seeking).
//
// This reads the cached body as a STREAM and only passes through the bytes in
// [start, end] - it never materializes the whole file at once. That used to be
// done with response.clone().blob() + Blob.slice(), which is fine for a few-MB
// audio file, but breaks down once cached files reach hundreds of MB to 1GB+ (a
// downloaded video): a video element fires many range requests while
// playing/seeking (Safari in particular probes with small ranges up front),
// and .blob()'ing the ENTIRE cached response from scratch on every single one
// means repeatedly reading the whole file off disk before returning even a
// few bytes - slow enough to look like the video is stuck loading forever, and
// on a phone's tighter memory budget, risky enough to crash the tab outright.
async function buildRangeResponse(request, response, defaultType) {
  const range = request.headers.get('range');
  if (!range) return response;

  const size = Number(response.headers.get('content-length'));
  const m = /bytes=(\d+)-(\d*)/.exec(range);
  if (!m || !size) return response;

  const start = parseInt(m[1], 10);
  const end = m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
  if (start >= size) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${size}` },
    });
  }

  const length = end - start + 1;
  const reader = response.body.getReader();
  let position = 0;    // bytes of the source stream consumed so far
  let emitted = 0;      // bytes handed to the client so far

  const stream = new ReadableStream({
    async pull(controller) {
      while (emitted < length) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunkStart = position;
        const chunkEnd = position + value.length; // exclusive
        position = chunkEnd;
        if (chunkEnd <= start) continue; // entirely before the requested range - skip
        const from = Math.max(0, start - chunkStart);
        const to = Math.min(value.length, end + 1 - chunkStart);
        if (to > from) {
          const piece = value.subarray(from, to);
          controller.enqueue(piece);
          emitted += piece.length;
        }
        if (chunkEnd > end) break; // read past the end of the range - done
        return; // yield back to the stream consumer, pull() is called again
      }
      controller.close();
      reader.cancel().catch(() => {});
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });

  return new Response(stream, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': response.headers.get('Content-Type') || defaultType,
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': String(length),
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
