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
app.use(cors()); // CORS enabled for the PWA frontend
app.disable('x-powered-by');

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
app.get('/search', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.status(400).json({ error: 'Missing query param "q"' });

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
