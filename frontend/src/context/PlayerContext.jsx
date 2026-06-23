import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { streamUrl, API_HEADERS } from '../api.js';
import {
  loadLibrary,
  saveLibrary,
  loadQueue,
  saveQueue,
  AUDIO_CACHE,
} from '../lib/storage.js';

const PlayerCtx = createContext(null);
export const usePlayer = () => useContext(PlayerCtx);

// How many songs to download at once. The free ngrok tunnel + on-demand
// yt-dlp/ffmpeg conversion can't handle a big parallel burst, so we cap it.
const MAX_CONCURRENT_DOWNLOADS = 2;

export function PlayerProvider({ children }) {
  const audioRef = useRef(null);
  if (!audioRef.current && typeof Audio !== 'undefined') {
    audioRef.current = new Audio();
    audioRef.current.preload = 'auto';
  }
  const audio = audioRef.current;

  // Dedicated element used only to warm up the next track's buffer/cache.
  // Kept separate so preloading can NEVER interrupt what's currently playing.
  const preloadRef = useRef(null);
  if (!preloadRef.current && typeof Audio !== 'undefined') {
    preloadRef.current = new Audio();
    preloadRef.current.preload = 'auto';
  }

  const [current, setCurrent] = useState(null); // track currently loaded
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [buffering, setBuffering] = useState(false);

  const [queue, setQueue] = useState(() => loadQueue());
  const [library, setLibrary] = useState(() => loadLibrary());
  const [downloading, setDownloading] = useState({}); // id -> true while caching
  const [showNowPlaying, setShowNowPlaying] = useState(false);

  // keep a ref to queue/current so audio "ended" handler isn't stale
  const queueRef = useRef(queue);
  const currentRef = useRef(current);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { currentRef.current = current; }, [current]);

  useEffect(() => saveQueue(queue), [queue]);
  useEffect(() => saveLibrary(library), [library]);

  // ---- audio element wiring -------------------------------------------------
  useEffect(() => {
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onDur = () => setDuration(audio.duration || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    const onEnded = () => playNextRef.current();

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('durationchange', onDur);
    audio.addEventListener('loadedmetadata', onDur);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('canplay', onPlaying);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('durationchange', onDur);
      audio.removeEventListener('loadedmetadata', onDur);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('canplay', onPlaying);
      audio.removeEventListener('ended', onEnded);
    };
  }, [audio]);

  // ---- preload (call on tap, before play, to kill startup lag) -------------
  const preload = useCallback((track) => {
    const pre = preloadRef.current;
    if (!pre || !track) return;
    const tail = `/stream/${track.id}`;
    // Already playing or already warming this track — nothing to do.
    if (audio && audio.src.endsWith(tail)) return;
    if (pre.src.endsWith(tail)) return;
    // Warm the backend conversion + browser cache WITHOUT touching playback.
    pre.src = streamUrl(track.id);
    pre.load();
  }, [audio]);

  // ---- core play ------------------------------------------------------------
  const load = useCallback((track, autoplay = true) => {
    if (!audio || !track) return;
    const url = streamUrl(track.id);
    if (!audio.src.endsWith(`/stream/${track.id}`)) {
      audio.src = url;
      audio.dataset.preloaded = track.id;
    }
    setCurrent(track);
    setCurrentTime(0);
    if (autoplay) {
      audio.play().catch(() => {});
    }
    updateMediaSession(track);
  }, [audio]);

  // Play a track immediately. Does NOT touch the queue — the queue is only what
  // the user explicitly adds with the + button. (playNext/playPrev still walk
  // the queue; if the current song isn't in it, "next" starts at the top.)
  const playTrack = useCallback((track) => {
    load(track, true);
  }, [load]);

  const playNext = useCallback(() => {
    const q = queueRef.current;
    const cur = currentRef.current;
    if (!q.length) return;
    const idx = cur ? q.findIndex((t) => t.id === cur.id) : -1;
    const next = q[idx + 1];
    if (next) load(next, true);
    else setIsPlaying(false);
  }, [load]);

  const playPrev = useCallback(() => {
    // If we're more than 3s in, restart current track instead.
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    const q = queueRef.current;
    const cur = currentRef.current;
    const idx = cur ? q.findIndex((t) => t.id === cur.id) : -1;
    const prev = q[idx - 1];
    if (prev) load(prev, true);
    else if (audio) audio.currentTime = 0;
  }, [audio, load]);

  const playNextRef = useRef(playNext);
  useEffect(() => { playNextRef.current = playNext; }, [playNext]);

  // ---- transport ------------------------------------------------------------
  const togglePlay = useCallback(() => {
    if (!audio || !current) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }, [audio, current]);

  const seek = useCallback((t) => {
    if (audio) audio.currentTime = t;
    setCurrentTime(t);
  }, [audio]);

  const skip = useCallback((delta) => {
    if (!audio) return;
    audio.currentTime = Math.min(
      Math.max(0, audio.currentTime + delta),
      audio.duration || Infinity
    );
  }, [audio]);

  const setVolume = useCallback((v) => {
    if (audio) audio.volume = v;
    setVolumeState(v);
  }, [audio]);

  // ---- queue management -----------------------------------------------------
  const addToQueue = useCallback((track) => {
    setQueue((q) => (q.find((t) => t.id === track.id) ? q : [...q, track]));
  }, []);

  const removeFromQueue = useCallback((id) => {
    setQueue((q) => q.filter((t) => t.id !== id));
  }, []);

  const reorderQueue = useCallback((from, to) => {
    setQueue((q) => {
      const next = [...q];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const clearQueue = useCallback(() => setQueue([]), []);

  // ---- offline downloads ----------------------------------------------------
  const isDownloaded = useCallback(
    (id) => library.some((t) => t.id === id),
    [library]
  );

  // Downloads run through a small concurrency-limited queue. Tapping download
  // on many songs at once used to fire every request in parallel, which
  // overwhelmed the laptop (one yt-dlp+ffmpeg per song) and the free ngrok
  // tunnel — so some requests got dropped and failed. We now run at most
  // MAX_CONCURRENT_DOWNLOADS at a time and queue the rest.
  const dlPendingRef = useRef([]);     // tracks waiting their turn
  const dlActiveRef = useRef(0);       // number currently downloading
  const dlSeenRef = useRef(new Set()); // ids queued or in-flight (dedupes taps)
  // id -> tags to stamp onto a song once its download lands. Used when a song is
  // tagged from search (Option A): tagging triggers a download, and the tag is
  // applied here when the file finishes caching.
  const pendingTagsRef = useRef({});

  const runDownload = useCallback(async (track) => {
    try {
      const cache = await caches.open(AUDIO_CACHE);
      // Fetch the full file (200) with the ngrok-skip header, then cache it for
      // offline use. (cache.add can't set headers, so we do it manually.)
      const res = await fetch(streamUrl(track.id), { headers: API_HEADERS });
      if (!res.ok) throw new Error(`server returned HTTP ${res.status}`);
      // Record the file size (bytes) for the Library storage display.
      const cl = Number(res.headers.get('content-length'));
      const size = cl > 0 ? cl : (await res.clone().blob()).size;
      await cache.put(streamUrl(track.id), res);
      // Apply any tags queued while this song was still downloading (Option A).
      const tags = pendingTagsRef.current[track.id] || [];
      delete pendingTagsRef.current[track.id];
      setLibrary((lib) => (lib.find((t) => t.id === track.id) ? lib : [{ ...track, downloadedAt: Date.now(), size, tags }, ...lib]));
    } catch (e) {
      console.error('download failed:', track.id, e);
      // A fetch that can't reach the server throws TypeError; everything else
      // (incl. the SW's synthetic 504 when a connection drops) carries a message.
      const reason =
        e?.name === 'TypeError'
          ? 'could not reach the backend (tunnel down or connection dropped)'
          : e?.message || 'unknown error';
      alert(`Couldn't download "${track.title}":\n${reason}`);
    } finally {
      dlSeenRef.current.delete(track.id);
      setDownloading((d) => {
        const n = { ...d };
        delete n[track.id];
        return n;
      });
    }
  }, []);

  const pumpDownloads = useCallback(() => {
    while (dlActiveRef.current < MAX_CONCURRENT_DOWNLOADS && dlPendingRef.current.length) {
      const track = dlPendingRef.current.shift();
      dlActiveRef.current += 1;
      runDownload(track).finally(() => {
        dlActiveRef.current -= 1;
        pumpDownloads();
      });
    }
  }, [runDownload]);

  const download = useCallback((track) => {
    // Skip if already downloaded, or already queued / in-flight. dlSeenRef is a
    // synchronous guard so a burst of taps can't enqueue the same song twice.
    if (isDownloaded(track.id) || dlSeenRef.current.has(track.id)) return;
    dlSeenRef.current.add(track.id);
    setDownloading((d) => ({ ...d, [track.id]: track })); // spinner shows immediately
    dlPendingRef.current.push(track);
    pumpDownloads();
  }, [isDownloaded, pumpDownloads]);

  // Backfill byte sizes for songs downloaded before sizes were tracked, by
  // reading them out of the audio cache. Runs only while something is missing.
  useEffect(() => {
    if (!library.some((t) => t.size == null)) return;
    let cancelled = false;
    (async () => {
      try {
        const cache = await caches.open(AUDIO_CACHE);
        const updated = await Promise.all(
          library.map(async (t) => {
            if (t.size != null) return t;
            const resp = await cache.match(streamUrl(t.id));
            if (!resp) return { ...t, size: 0 };
            const cl = Number(resp.headers.get('content-length'));
            const size = cl > 0 ? cl : (await resp.clone().blob()).size;
            return { ...t, size };
          })
        );
        if (!cancelled) setLibrary(updated);
      } catch {
        /* ignore — sizes will just show as unknown */
      }
    })();
    return () => { cancelled = true; };
  }, [library]);

  const removeDownload = useCallback(async (id) => {
    try {
      const cache = await caches.open(AUDIO_CACHE);
      await cache.delete(streamUrl(id));
    } catch (e) {
      console.warn('cache delete failed', e);
    }
    setLibrary((lib) => lib.filter((t) => t.id !== id));
  }, []);

  // Add/remove a tag on a track. If the track is already in the library we just
  // flip the label. If it isn't (tagged straight from search — Option A), we
  // remember the tag and kick off a download; runDownload stamps it on arrival.
  const toggleTag = useCallback((track, tag) => {
    const t = tag.trim();
    if (!t) return;
    if (library.some((x) => x.id === track.id)) {
      setLibrary((lib) =>
        lib.map((x) =>
          x.id !== track.id
            ? x
            : {
                ...x,
                tags: (x.tags || []).includes(t)
                  ? x.tags.filter((y) => y !== t)
                  : [...(x.tags || []), t],
              }
        )
      );
      return;
    }
    const pend = pendingTagsRef.current[track.id] || [];
    pendingTagsRef.current[track.id] = pend.includes(t)
      ? pend.filter((y) => y !== t)
      : [...pend, t];
    download(track);
  }, [library, download]);

  // ---- Media Session (lock screen / control center) ------------------------
  function updateMediaSession(track) {
    if (!('mediaSession' in navigator) || !track) return;
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: track.title,
      artist: track.artist,
      artwork: [
        { src: track.thumbnail, sizes: '480x360', type: 'image/jpeg' },
      ],
    });
  }

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    ms.setActionHandler('play', () => audio && audio.play());
    ms.setActionHandler('pause', () => audio && audio.pause());
    ms.setActionHandler('nexttrack', () => playNextRef.current());
    ms.setActionHandler('previoustrack', () => playPrev());
    ms.setActionHandler('seekforward', () => skip(15));
    ms.setActionHandler('seekbackward', () => skip(-15));
    ms.setActionHandler('seekto', (d) => d.seekTime != null && seek(d.seekTime));
  }, [audio, playPrev, skip, seek]);

  const value = useMemo(
    () => ({
      current, isPlaying, currentTime, duration, volume, buffering,
      queue, library, downloading, showNowPlaying,
      setShowNowPlaying,
      preload, playTrack, togglePlay, playNext, playPrev, seek, skip, setVolume,
      addToQueue, removeFromQueue, reorderQueue, clearQueue,
      download, removeDownload, isDownloaded, toggleTag,
    }),
    [
      current, isPlaying, currentTime, duration, volume, buffering,
      queue, library, downloading, showNowPlaying,
      preload, playTrack, togglePlay, playNext, playPrev, seek, skip, setVolume,
      addToQueue, removeFromQueue, reorderQueue, clearQueue,
      download, removeDownload, isDownloaded,
    ]
  );

  return <PlayerCtx.Provider value={value}>{children}</PlayerCtx.Provider>;
}
