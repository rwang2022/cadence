/**
 * Cadence — backend
 * Lightweight Express server that uses yt-dlp (+ ffmpeg) to search YouTube and
 * stream audio-only as MP3. For personal use only.
 *
 * Endpoints:
 *   GET /search?q=QUERY     -> top 10 results [{ id, title, artist, duration, thumbnail }]
 *   GET /info/:videoId      -> metadata for a single video
 *   GET /stream/:videoId    -> audio/mpeg stream (cached to disk, supports range/seek)
 *   GET /health             -> { ok: true }
 *
 *   Jam (shared queue via link) - rooms live in memory only, gone on restart:
 *   POST   /jam/create             -> { roomId }
 *   GET    /jam/:roomId            -> { queue, guests: [name, ...] } | 404
 *   POST   /jam/:roomId/add        -> body { track, clientId? } -> { queue }
 *   DELETE /jam/:roomId/entry/:id  -> body { clientId? } -> { queue }
 *                                     (host: no clientId, removes anything;
 *                                      guest: clientId, only their own entry)
 *   DELETE /jam/:roomId            -> host ends the Jam
 *   POST   /jam/:roomId/join       -> body { clientId? } -> { clientId, name }
 *   POST   /jam/:roomId/ping       -> body { clientId } -> { ok } (heartbeat)
 *   POST   /jam/:roomId/leave      -> body { clientId } -> { ok } (sendBeacon on close)
 *   POST   /jam/:roomId/now-playing -> body { track, isPlaying } -> { ok } (host pushes; guests read it via GET)
 */

const express = require('express');
const cors = require('cors');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3001;
const YT_DLP = process.env.YT_DLP_PATH || 'yt-dlp';
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const CACHE_DIR = process.env.CACHE_DIR || path.join(os.tmpdir(), 'cadence-audio-cache');

fs.mkdirSync(CACHE_DIR, { recursive: true });

const app = express();
// CORS enabled for the PWA frontend. Expose range headers so cross-origin audio
// seeking works (the frontend reads them via the service worker).
app.use(cors({ exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'Content-Type'] }));
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function thumbFor(id) {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

// Run yt-dlp and collect stdout. Used for search + info (JSON output).
function runYtdlp(args) {
  return new Promise((resolve, reject) => {
    execFile(
      YT_DLP,
      args,
      { maxBuffer: 1024 * 1024 * 64, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          err.stderr = stderr;
          return reject(err);
        }
        resolve(stdout);
      }
    );
  });
}

// Normalise a yt-dlp JSON entry into the shape the frontend wants.
function toTrack(e) {
  const id = e.id;
  return {
    id,
    title: e.track || e.title || 'Unknown',
    artist: e.artist || e.uploader || e.channel || e.creator || 'Unknown artist',
    duration: Math.round(e.duration || 0),
    thumbnail: thumbFor(id),
    url: `https://www.youtube.com/watch?v=${id}`,
  };
}

// ---------------------------------------------------------------------------
// GET /search?q=
// ---------------------------------------------------------------------------

// Each search spawns a fresh yt-dlp, whose startup dominates the latency. Cache
// results by query so repeated/refined searches return instantly.
const SEARCH_TTL_MS = 10 * 60 * 1000;
const SEARCH_CACHE_MAX = 200;
const searchCache = new Map(); // normalized q -> { at, results }

app.get('/search', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.status(400).json({ error: 'Missing query param "q"' });

  const key = q.toLowerCase();
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.at < SEARCH_TTL_MS) {
    return res.json({ results: hit.results });
  }

  try {
    // --flat-playlist keeps search fast (no per-video extraction).
    const out = await runYtdlp([
      `ytsearch10:${q}`,
      '--flat-playlist',
      '--dump-json',
      '--no-warnings',
      '--ignore-errors',
    ]);

    const results = out
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter((e) => e && e.id && VIDEO_ID_RE.test(e.id))
      .map(toTrack);

    // Cache and evict the oldest entry if we're over the cap (Map keeps
    // insertion order, so the first key is the oldest).
    searchCache.set(key, { at: Date.now(), results });
    if (searchCache.size > SEARCH_CACHE_MAX) {
      searchCache.delete(searchCache.keys().next().value);
    }

    res.json({ results });
  } catch (err) {
    console.error('search failed:', err.stderr || err.message);
    res.status(500).json({ error: 'Search failed', detail: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /info/:videoId
// ---------------------------------------------------------------------------
app.get('/info/:videoId', async (req, res) => {
  const { videoId } = req.params;
  if (!VIDEO_ID_RE.test(videoId)) {
    return res.status(400).json({ error: 'Invalid video id' });
  }

  try {
    const out = await runYtdlp([
      `https://www.youtube.com/watch?v=${videoId}`,
      '--dump-single-json',
      '--skip-download',
      '--no-warnings',
    ]);
    const e = JSON.parse(out);
    res.json(toTrack(e));
  } catch (err) {
    console.error('info failed:', err.stderr || err.message);
    res.status(500).json({ error: 'Info lookup failed', detail: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /stream/:videoId
// Downloads + converts to MP3 once, caches on disk, then serves with range
// support so the client scrubber can seek. Concurrent requests for the same id
// wait on a single conversion.
// ---------------------------------------------------------------------------
const inflight = new Map(); // videoId -> Promise<filePath>

function convert(videoId) {
  if (inflight.has(videoId)) return inflight.get(videoId);

  const finalPath = path.join(CACHE_DIR, `${videoId}.mp3`);
  const tmpPath = path.join(CACHE_DIR, `${videoId}.part.mp3`);

  const p = new Promise((resolve, reject) => {
    if (fs.existsSync(finalPath)) return resolve(finalPath);

    // yt-dlp pulls best audio to stdout; ffmpeg transcodes to mp3 on stdout.
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const ytdlp = spawn(
      YT_DLP,
      ['-f', 'bestaudio/best', '-o', '-', '--no-warnings', '--quiet', url],
      { windowsHide: true }
    );
    const ffmpeg = spawn(
      FFMPEG,
      ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vn', '-acodec', 'libmp3lame', '-b:a', '192k', '-f', 'mp3', tmpPath],
      { windowsHide: true }
    );

    let err = '';
    ytdlp.stdout.pipe(ffmpeg.stdin);
    ytdlp.stderr.on('data', (d) => (err += d));
    ffmpeg.stderr.on('data', (d) => (err += d));

    // If yt-dlp dies, don't leave ffmpeg hanging on stdin.
    ytdlp.on('error', (e) => reject(new Error(`yt-dlp spawn failed: ${e.message}`)));
    ffmpeg.on('error', (e) => reject(new Error(`ffmpeg spawn failed: ${e.message}`)));
    ytdlp.stdout.on('error', () => {}); // ignore EPIPE if ffmpeg exits first

    ffmpeg.on('close', (code) => {
      if (code === 0 && fs.existsSync(tmpPath)) {
        fs.renameSync(tmpPath, finalPath);
        resolve(finalPath);
      } else {
        try { fs.existsSync(tmpPath) && fs.unlinkSync(tmpPath); } catch {}
        reject(new Error(`Conversion failed (code ${code}): ${err.slice(-500)}`));
      }
    });
  }).finally(() => inflight.delete(videoId));

  inflight.set(videoId, p);
  return p;
}

app.get('/stream/:videoId', async (req, res) => {
  const { videoId } = req.params;
  if (!VIDEO_ID_RE.test(videoId)) {
    return res.status(400).json({ error: 'Invalid video id' });
  }

  try {
    const filePath = await convert(videoId);
    // res.sendFile handles Range / Content-Length / Accept-Ranges automatically.
    res.sendFile(filePath, {
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=31536000' },
    });
  } catch (err) {
    console.error('stream failed:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Stream failed', detail: err.message });
  }
});

// ---------------------------------------------------------------------------
// Jam: a shareable link that lets other people queue songs into a room, which
// the host reviews on the Queue page and pulls into their real queue. Rooms
// are in-memory only (fine for a personal, single-instance app) and expire
// after ROOM_TTL_MS so a stale link/room can't grow forever.
// ---------------------------------------------------------------------------
const ROOM_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const ROOM_MAX_QUEUE = 100; // cap pending (not-yet-reviewed) entries per room
const GUEST_TIMEOUT_MS = 15 * 1000; // no heartbeat in this long = considered gone
// Keep in sync with frontend/src/lib/animals.js (name -> emoji map).
const JAM_ANIMALS = [
  'Otter', 'Bear', 'Cat', 'Dog', 'Fox', 'Owl', 'Wolf', 'Panda', 'Koala', 'Tiger',
  'Lion', 'Rabbit', 'Deer', 'Eagle', 'Dolphin', 'Whale', 'Seal', 'Penguin',
  'Squirrel', 'Beaver', 'Badger', 'Hedgehog', 'Raccoon', 'Elephant', 'Giraffe',
  'Zebra', 'Monkey', 'Frog', 'Turtle',
];
const jamRooms = new Map(); // roomId -> { queue, guests: Map<clientId,{name,lastSeen}>, createdAt }

function newId(len) {
  return Array.from({ length: len }, () => Math.floor(Math.random() * 36).toString(36)).join('');
}

function pruneGuests(room) {
  const cutoff = Date.now() - GUEST_TIMEOUT_MS;
  for (const [id, g] of room.guests) {
    if (g.lastSeen < cutoff) room.guests.delete(id);
  }
}

// Pick an animal not currently in use in this room where possible, so two
// people at once look distinct (falls back to a numbered repeat once the
// list is exhausted, which only matters for a large group).
function pickAnimalName(room) {
  const used = new Set([...room.guests.values()].map((g) => g.name));
  const free = JAM_ANIMALS.filter((a) => !used.has(a));
  if (free.length) return free[Math.floor(Math.random() * free.length)];
  const base = JAM_ANIMALS[Math.floor(Math.random() * JAM_ANIMALS.length)];
  return `${base} ${used.size + 1}`;
}

setInterval(() => {
  const cutoff = Date.now() - ROOM_TTL_MS;
  for (const [id, room] of jamRooms) {
    if (room.createdAt < cutoff) jamRooms.delete(id);
  }
}, 30 * 60 * 1000).unref();

// A guest-submitted track only needs to carry enough to show + queue it -
// re-derive a clean object rather than trusting the request body verbatim.
function sanitizeTrack(track) {
  if (!track || typeof track !== 'object') return null;
  const id = String(track.id || '');
  if (!VIDEO_ID_RE.test(id)) return null;
  const clip = (s, max) => String(s || '').slice(0, max);
  return {
    id,
    title: clip(track.title, 200) || 'Unknown',
    artist: clip(track.artist, 200) || 'Unknown artist',
    duration: Number.isFinite(track.duration) ? Math.max(0, Math.round(track.duration)) : 0,
    thumbnail: thumbFor(id),
  };
}

app.post('/jam/create', (_req, res) => {
  const roomId = newId(6);
  jamRooms.set(roomId, { queue: [], guests: new Map(), nowPlaying: null, createdAt: Date.now() });
  res.json({ roomId });
});

app.get('/jam/:roomId', (req, res) => {
  const room = jamRooms.get(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Jam not found (it may have ended)' });
  pruneGuests(room);
  res.json({
    queue: room.queue,
    guests: [...room.guests.values()].map((g) => g.name),
    nowPlaying: room.nowPlaying,
  });
});

// Host pushes what's currently loaded/playing so guests can show a live
// "Now Playing" readout. No position/seek tracking - just track + play state.
app.post('/jam/:roomId/now-playing', (req, res) => {
  const room = jamRooms.get(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Jam not found (it may have ended)' });
  const track = sanitizeTrack(req.body?.track);
  room.nowPlaying = track ? { track, isPlaying: !!req.body?.isPlaying, updatedAt: Date.now() } : null;
  res.json({ ok: true });
});

// A guest calls this once on opening the link. clientId is a random id the
// guest generates and persists in localStorage, so reopening the link (or a
// stray extra heartbeat) reuses the same animal name instead of minting a
// new one every time.
app.post('/jam/:roomId/join', (req, res) => {
  const room = jamRooms.get(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Jam not found (it may have ended)' });
  pruneGuests(room);

  let clientId = String(req.body?.clientId || '');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(clientId)) clientId = newId(16);

  let guest = room.guests.get(clientId);
  if (!guest) {
    guest = { name: pickAnimalName(room), lastSeen: Date.now() };
    room.guests.set(clientId, guest);
  } else {
    guest.lastSeen = Date.now();
  }
  res.json({ clientId, name: guest.name });
});

app.post('/jam/:roomId/ping', (req, res) => {
  const room = jamRooms.get(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Jam not found (it may have ended)' });
  const guest = room.guests.get(String(req.body?.clientId || ''));
  if (guest) guest.lastSeen = Date.now();
  pruneGuests(room);
  res.json({ ok: true });
});

// Best-effort immediate removal on tab close (sent via sendBeacon); if it
// never arrives, pruneGuests drops the guest after GUEST_TIMEOUT_MS anyway.
app.post('/jam/:roomId/leave', (req, res) => {
  const room = jamRooms.get(req.params.roomId);
  if (room) room.guests.delete(String(req.body?.clientId || ''));
  res.json({ ok: true });
});

app.post('/jam/:roomId/add', (req, res) => {
  const room = jamRooms.get(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Jam not found (it may have ended)' });

  const track = sanitizeTrack(req.body?.track);
  if (!track) return res.status(400).json({ error: 'Invalid track' });
  if (room.queue.length >= ROOM_MAX_QUEUE) {
    return res.status(429).json({ error: 'This Jam queue is full for now' });
  }

  // clientId is optional and only used so a guest can later remove their own
  // submission (see DELETE below) - it doesn't gate adding.
  const clientId = String(req.body?.clientId || '') || null;
  const entry = { entryId: newId(8), track, addedAt: Date.now(), clientId };
  room.queue.push(entry);
  res.json({ queue: room.queue });
});

// The host calls this with no clientId (can remove/accept anything). A guest
// calls it with their own clientId, which only succeeds against an entry
// they themselves added - so one guest can't clear another's suggestions.
app.delete('/jam/:roomId/entry/:entryId', (req, res) => {
  const room = jamRooms.get(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Jam not found (it may have ended)' });

  const requesterClientId = req.body?.clientId || null;
  if (requesterClientId) {
    const entry = room.queue.find((e) => e.entryId === req.params.entryId);
    if (entry && entry.clientId !== requesterClientId) {
      return res.status(403).json({ error: 'You can only remove songs you added' });
    }
  }
  room.queue = room.queue.filter((e) => e.entryId !== req.params.entryId);
  res.json({ queue: room.queue });
});

app.delete('/jam/:roomId', (req, res) => {
  jamRooms.delete(req.params.roomId);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => res.json({ ok: true }));

const server = app.listen(PORT, () => {
  console.log(`Cadence backend listening on :${PORT}`);
  console.log(`Audio cache: ${CACHE_DIR}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\nPort ${PORT} is already in use. Start Cadence on a different port, e.g.:\n` +
        `  PORT=3999 npm run dev            (macOS/Linux)\n` +
        `  $env:PORT=3999; npm run dev      (Windows PowerShell)\n`
    );
    process.exit(1);
  }
  throw err;
});
