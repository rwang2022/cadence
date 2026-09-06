// Backend base URL. Set VITE_API_BASE in .env / deploy env to your backend URL.
// Empty string = same origin (useful when proxying in dev).
export const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

export const streamUrl = (id) => `${API_BASE}/stream/${id}`;

// Skips ngrok's free-tier browser interstitial; harmless on any other host.
export const API_HEADERS = { 'ngrok-skip-browser-warning': 'true' };

export async function search(query, signal) {
  const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`, {
    signal,
    headers: API_HEADERS,
  });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const data = await res.json();
  return data.results || [];
}

export async function info(id, signal) {
  const res = await fetch(`${API_BASE}/info/${id}`, { signal, headers: API_HEADERS });
  if (!res.ok) throw new Error(`Info failed (${res.status})`);
  return res.json(); // includes chapters: [{ start, end, title }]
}

// ---- video (offline download), playlists, channels -------------------------

export const videoFileUrl = (id) => `${API_BASE}/video/${id}/file`;

export async function startVideoDownload(id) {
  const res = await fetch(`${API_BASE}/video/${id}/start`, { method: 'POST', headers: API_HEADERS });
  if (!res.ok) throw new Error(`Couldn't start video download (${res.status})`);
  return res.json(); // { status }
}

export async function getVideoStatus(id, signal) {
  const res = await fetch(`${API_BASE}/video/${id}/status`, { signal, headers: API_HEADERS });
  if (!res.ok) throw new Error(`Video status failed (${res.status})`);
  return res.json(); // { status: 'none'|'downloading'|'ready'|'error', error? }
}

// url can be a full playlist URL or a bare playlist id.
export async function getPlaylist(url, signal) {
  const res = await fetch(`${API_BASE}/playlist?url=${encodeURIComponent(url)}`, { signal, headers: API_HEADERS });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Playlist lookup failed (${res.status})`);
  }
  return res.json(); // { title, results }
}

// url must be a channel/uploader URL (a track's channelUrl field).
export async function getChannel(url, signal) {
  const res = await fetch(`${API_BASE}/channel?url=${encodeURIComponent(url)}`, { signal, headers: API_HEADERS });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Channel lookup failed (${res.status})`);
  }
  return res.json(); // { title, results }
}

// Recognizes a pasted playlist URL/id so Search can offer "view playlist"
// instead of a normal keyword search. Matches a `list=` param or a bare
// playlist-shaped id (YouTube playlist ids are typically 13-40 chars,
// starting PL/UU/OL/RD/LL/FL).
export function extractPlaylistRef(input) {
  const s = input.trim();
  const m = s.match(/[?&]list=([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  if (/^(PL|UU|OL|RD|LL|FL)[A-Za-z0-9_-]{10,}$/.test(s)) return s;
  return null;
}

// ---- Jam: shared queue via link -------------------------------------------

export async function createJam() {
  const res = await fetch(`${API_BASE}/jam/create`, { method: 'POST', headers: API_HEADERS });
  if (!res.ok) throw new Error(`Couldn't start Jam (${res.status})`);
  return res.json(); // { roomId }
}

// Returns null (not thrown) for a 404 so callers can treat "ended" as normal.
export async function getJam(roomId, signal) {
  const res = await fetch(`${API_BASE}/jam/${roomId}`, { signal, headers: API_HEADERS });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Jam lookup failed (${res.status})`);
  return res.json(); // { queue: [{ track, addedAt, clientId }], guests: [name, ...], nowPlaying }
}

// Returns null (not thrown) for a 404 so a dead link can show "ended" cleanly.
export async function joinJam(roomId, clientId) {
  const res = await fetch(`${API_BASE}/jam/${roomId}/join`, {
    method: 'POST',
    headers: { ...API_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId }),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Couldn't join Jam (${res.status})`);
  return res.json(); // { clientId, name }
}

export function pingJam(roomId, clientId) {
  return fetch(`${API_BASE}/jam/${roomId}/ping`, {
    method: 'POST',
    headers: { ...API_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId }),
  }).catch(() => {}); // heartbeat - a dropped one just means the next one is a bit late
}

// Host pushes what's currently loaded/playing; guests read it back via getJam.
export function setJamNowPlaying(roomId, track, isPlaying) {
  return fetch(`${API_BASE}/jam/${roomId}/now-playing`, {
    method: 'POST',
    headers: { ...API_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ track, isPlaying }),
  }).catch(() => {});
}

// Fire-and-forget via sendBeacon so it still fires as the tab is closing.
export function leaveJamBeacon(roomId, clientId) {
  try {
    navigator.sendBeacon(
      `${API_BASE}/jam/${roomId}/leave`,
      new Blob([JSON.stringify({ clientId })], { type: 'application/json' })
    );
  } catch { /* best-effort only */ }
}

// clientId is optional - pass it (as a guest) so you can later remove your
// own addition; the host doesn't need to pass one. Adds straight to the live
// shared queue, no approval step.
export async function addToJam(roomId, track, clientId) {
  const res = await fetch(`${API_BASE}/jam/${roomId}/add`, {
    method: 'POST',
    headers: { ...API_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ track, clientId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Couldn't add song (${res.status})`);
  }
  return res.json(); // { queue }
}

// Moves one song (by video id) to a new index. Anyone can call this - no
// clientId/ownership check, reordering is non-destructive.
export function reorderJam(roomId, id, toIndex) {
  return fetch(`${API_BASE}/jam/${roomId}/reorder`, {
    method: 'POST',
    headers: { ...API_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, toIndex }),
  }).catch(() => {}); // best-effort - next poll reconciles either way
}

// clientId is optional. Omitted (host): removes anything. Passed (guest):
// only succeeds against a song that guest themselves added.
export async function removeJamSong(roomId, videoId, clientId) {
  const res = await fetch(`${API_BASE}/jam/${roomId}/song/${videoId}`, {
    method: 'DELETE',
    headers: { ...API_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Couldn't update the queue (${res.status})`);
  }
  return res.json(); // { queue }
}

export async function endJam(roomId) {
  await fetch(`${API_BASE}/jam/${roomId}`, { method: 'DELETE', headers: API_HEADERS });
}
