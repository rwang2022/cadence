# 🎧 Cadence

A personal, mobile-first **music PWA** that searches YouTube, streams audio-only,
and caches songs for **offline playback on the subway**. Installs to your iPhone
home screen and feels like a native iOS music app.

> ⚠️ **Personal use only.** This streams audio from YouTube via `yt-dlp`. Respect
> YouTube's Terms of Service and the rights of content creators.

```
offline-listening/
├── backend/     Node/Express + yt-dlp + ffmpeg  (deploy to Railway/Render)
└── frontend/    React + Tailwind + Workbox PWA  (deploy to Vercel/Netlify)
```

---

## Features

- 🔎 **Search** YouTube — top 10 results with thumbnail, title, artist, duration
- ▶️ **Now Playing** — full-screen player: album art, scrubber, play/pause,
  ±15s skip, previous/next, volume, lock-screen controls (Media Session API)
- ⬇️ **Offline** — download button caches audio via service worker; plays with
  no connection (with seekable scrubbing via Range support in the SW)
- 📋 **Queue** — tap to enqueue, reorder, remove
- 📚 **Library** — your downloaded songs
- 🌙 Dark, minimal, native-feeling UI; installs to the iOS home screen
- ⚡ No play lag — audio is preloaded on tap, before you hit play

---

## 1. Backend setup

### Prerequisites — install `yt-dlp` and `ffmpeg`

The server shells out to **yt-dlp** (search + audio extraction) and **ffmpeg**
(transcode to MP3). Both must be installed and on the `PATH` (or point to them
with `YT_DLP_PATH` / `FFMPEG_PATH`).

**macOS (Homebrew)**
```bash
brew install yt-dlp ffmpeg
```

**Ubuntu / Debian**
```bash
sudo apt update && sudo apt install -y ffmpeg python3
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
  -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

**Windows (winget)**
```powershell
winget install yt-dlp.yt-dlp
winget install Gyan.FFmpeg
```

Verify:
```bash
yt-dlp --version
ffmpeg -version
```

### Run locally
```bash
cd backend
npm install
npm run dev          # http://localhost:3001
```

Quick test:
```bash
curl "http://localhost:3001/search?q=daft%20punk"
curl "http://localhost:3001/info/dQw4w9WgXcQ"
# stream (downloads+converts on first hit, then cached):
curl "http://localhost:3001/stream/dQw4w9WgXcQ" --output test.mp3
```

### API

| Method & path        | Description                                              |
| -------------------- | ------------------------------------------------------- |
| `GET /search?q=`     | Top 10 results: `{ id, title, artist, duration, thumbnail }` |
| `GET /info/:videoId` | Metadata for one video                                  |
| `GET /stream/:videoId` | Audio-only MP3, cached to disk, supports HTTP Range (seek) |
| `GET /health`        | `{ ok: true }`                                          |

Environment variables — see [`backend/.env.example`](backend/.env.example).

---

## 2. Deploy the backend (Railway or Render)

A [`Dockerfile`](backend/Dockerfile) is included that installs `ffmpeg` + `yt-dlp`
for you, so deploys work out of the box.

### Railway
1. Push this repo to GitHub.
2. **New Project → Deploy from GitHub repo**, set the **root directory** to `backend`.
3. Railway auto-detects the `Dockerfile`. No build command needed.
4. `PORT` is provided by Railway automatically. Deploy.
5. Copy your public URL (e.g. `https://cadence-backend.up.railway.app`).

### Render
1. **New → Web Service**, connect the repo, root directory `backend`.
2. Runtime: **Docker** (it finds the `Dockerfile`).
3. Instance type: Free. Deploy and copy the URL.

> 💡 On free tiers the disk is ephemeral and the service sleeps — the audio cache
> is rebuilt on demand, which is fine for personal use.

---

## 3. Frontend setup

```bash
cd frontend
npm install
cp .env.example .env        # then set VITE_API_BASE to your backend URL
npm run dev                 # http://localhost:5173
npm run build               # production build in dist/
```

Set **`VITE_API_BASE`** to your deployed backend URL (no trailing slash).

PWA icons are pre-generated. To regenerate them:
```bash
node scripts/generate-icons.cjs
```

---

## 4. Deploy the frontend (Vercel or Netlify)

Config files for both are included
([`vercel.json`](frontend/vercel.json), [`netlify.toml`](frontend/netlify.toml)).

- **Build command:** `npm run build`
- **Output / publish directory:** `dist`
- **Environment variable:** `VITE_API_BASE = https://your-backend-url`

### Vercel
`Import Project` → set **Root Directory** to `frontend` → add the env var → Deploy.

### Netlify
`Add new site → Import` → base directory `frontend`, publish `frontend/dist`,
build `npm run build` → add the env var → Deploy.

---

## 5. Install on your iPhone

1. Open the deployed frontend URL in **Safari** (must be HTTPS — Vercel/Netlify
   give you that).
2. Tap **Share → Add to Home Screen**.
3. Launch **Cadence** from the home screen — it runs full-screen, no Safari chrome.
4. Search, tap a song, hit **Download** on anything you want for the subway.

### Offline checklist
- Download songs while online → they appear under **Library**.
- Enable Airplane Mode → downloaded songs still play and scrub.

---

## How offline works

- **Download** calls `cache.add(/stream/:id)`, storing the full MP3 in the
  `cadence-audio` Cache Storage bucket. Track metadata is kept in `localStorage`.
- The **service worker** ([`frontend/src/sw.js`](frontend/src/sw.js)) intercepts
  `/stream/` requests: if the file is cached it serves it — translating the
  `<audio>` element's `Range:` requests into `206 Partial Content` responses so
  seeking works offline. If not cached, it falls through to the network.
- Thumbnails are cached-first so artwork shows offline too.

## Notes & limitations

- First play of an un-downloaded song waits for the server to fetch + transcode
  (then it's disk-cached). The frontend preloads on tap to minimize this.
- If YouTube changes its internals, run `yt-dlp -U` (or rebuild the Docker image)
  to update.
- Single-user app — there's no auth. Keep your backend URL to yourself.
