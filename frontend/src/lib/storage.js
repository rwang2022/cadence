// Tiny localStorage-backed persistence for library + queue metadata.
const KEYS = {
  library: 'cadence.library',
  queue: 'cadence.queue',
  jamRoom: 'cadence.jamRoom',
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

export const AUDIO_CACHE = 'cadence-audio';
