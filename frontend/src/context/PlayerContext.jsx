import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { streamUrl } from '../api.js';
import {
  loadLibrary,
  saveLibrary,
  loadQueue,
  saveQueue,
  AUDIO_CACHE,
} from '../lib/storage.js';

const PlayerCtx = createContext(null);
export const usePlayer = () => useContext(PlayerCtx);

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

  // Play a track and (optionally) replace the queue with its surrounding list.
  const playTrack = useCallback((track, list) => {
    if (Array.isArray(list)) {
      setQueue(list);
    } else if (!queueRef.current.find((t) => t.id === track.id)) {
      setQueue((q) => [...q, track]);
    }
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

  const download = useCallback(async (track) => {
    if (isDownloaded(track.id) || downloading[track.id]) return;
    setDownloading((d) => ({ ...d, [track.id]: true }));
    try {
      const cache = await caches.open(AUDIO_CACHE);
      // cache.add fetches the full file (200) and stores it for offline use.
      await cache.add(streamUrl(track.id));
      setLibrary((lib) => (lib.find((t) => t.id === track.id) ? lib : [{ ...track, downloadedAt: Date.now() }, ...lib]));
    } catch (e) {
      console.error('download failed', e);
      alert('Download failed. Is the backend reachable?');
    } finally {
      setDownloading((d) => {
        const n = { ...d };
        delete n[track.id];
        return n;
      });
    }
  }, [downloading, isDownloaded]);

  const removeDownload = useCallback(async (id) => {
    try {
      const cache = await caches.open(AUDIO_CACHE);
      await cache.delete(streamUrl(id));
    } catch (e) {
      console.warn('cache delete failed', e);
    }
    setLibrary((lib) => lib.filter((t) => t.id !== id));
  }, []);

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
      download, removeDownload, isDownloaded,
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
