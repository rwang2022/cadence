// Backend base URL. Set VITE_API_BASE in .env / deploy env to your Railway/Render URL.
// Empty string = same origin (useful when proxying in dev).
export const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

export const streamUrl = (id) => `${API_BASE}/stream/${id}`;

export async function search(query, signal) {
  const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`, { signal });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const data = await res.json();
  return data.results || [];
}

export async function info(id, signal) {
  const res = await fetch(`${API_BASE}/info/${id}`, { signal });
  if (!res.ok) throw new Error(`Info failed (${res.status})`);
  return res.json();
}
