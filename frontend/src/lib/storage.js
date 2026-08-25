// Tiny localStorage-backed persistence for library + queue metadata.
const KEYS = {
  library: 'cadence.library',
  queue: 'cadence.queue',
  jamRoom: 'cadence.jamRoom',
  jamGuestId: 'cadence.jamGuestId',
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('storage write failed', e);
  }
}

export const loadLibrary = () => read(KEYS.library, []);
export const saveLibrary = (lib) => write(KEYS.library, lib);
export const loadQueue = () => read(KEYS.queue, []);
export const saveQueue = (q) => write(KEYS.queue, q);

// Active Jam room id, so it survives a page reload. null = no active Jam.
export const loadJamRoom = () => read(KEYS.jamRoom, null);
export const saveJamRoom = (roomId) => write(KEYS.jamRoom, roomId);

// A random, persistent anonymous id for this browser, reused across every
// Jam it joins (the server assigns a fresh animal name per room per id, so
// the same browser can be "Otter" in one Jam and "Bear" in another).
export function getOrCreateGuestId() {
  let id = read(KEYS.jamGuestId, null);
  if (!id) {
    id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '')
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
    write(KEYS.jamGuestId, id);
  }
  return id;
}

export const AUDIO_CACHE = 'cadence-audio';
