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
  return res.json();
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
  return res.json(); // { queue: [{ entryId, track, addedAt }], guests: [name, ...] }
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

// Fire-and-forget via sendBeacon so it still fires as the tab is closing.
export function leaveJamBeacon(roomId, clientId) {
  try {
    navigator.sendBeacon(
      `${API_BASE}/jam/${roomId}/leave`,
      new Blob([JSON.stringify({ clientId })], { type: 'application/json' })
    );
  } catch { /* best-effort only */ }
}

export async function addToJam(roomId, track) {
  const res = await fetch(`${API_BASE}/jam/${roomId}/add`, {
    method: 'POST',
    headers: { ...API_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ track }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Couldn't add song (${res.status})`);
  }
  return res.json(); // { queue }
}

export async function removeJamEntry(roomId, entryId) {
  const res = await fetch(`${API_BASE}/jam/${roomId}/entry/${entryId}`, {
    method: 'DELETE',
    headers: API_HEADERS,
  });
  if (!res.ok) throw new Error(`Couldn't update Jam (${res.status})`);
  return res.json(); // { queue }
}

export async function endJam(roomId) {
  await fetch(`${API_BASE}/jam/${roomId}`, { method: 'DELETE', headers: API_HEADERS });
}
