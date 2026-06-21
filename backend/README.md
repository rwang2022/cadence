# Cadence — backend

Lightweight Express server: searches YouTube and streams audio-only MP3 using
`yt-dlp` + `ffmpeg`. See the [root README](../README.md) for the full guide.

## Requirements
- Node.js ≥ 18
- `yt-dlp` and `ffmpeg` on `PATH` (or set `YT_DLP_PATH` / `FFMPEG_PATH`)

## Run
```bash
npm install
npm run dev      # or: npm start
```

## Endpoints
- `GET /search?q=QUERY` → `{ results: [{ id, title, artist, duration, thumbnail, url }] }`
- `GET /info/:videoId` → single track metadata
- `GET /stream/:videoId` → `audio/mpeg`, disk-cached, Range/seek supported
- `GET /health` → `{ ok: true }`

## Config
See [`.env.example`](.env.example): `PORT`, `YT_DLP_PATH`, `FFMPEG_PATH`, `CACHE_DIR`.

## Deploy
The included [`Dockerfile`](Dockerfile) bundles `ffmpeg` + `yt-dlp`. Point Railway
or Render at this `backend/` directory; the container builds and runs `node server.js`.
