import { useEffect, useRef, useState } from 'react';
import { usePlayer } from '../context/PlayerContext.jsx';
import { videoFileUrl, info } from '../api.js';
import { VIDEO_CACHE } from '../lib/storage.js';
import ChapterList from './ChapterList.jsx';
import {
  ChevronDown, DownloadIcon, DownloadedIcon, ChannelIcon,
} from './Icons.jsx';

// Full-screen video player overlay - opened via usePlayer().openVideo(track).
// Uses a native <video controls> element (play/pause/seek/fullscreen/volume
// all come for free and are already well-designed) rather than custom
// transport controls; chapters are a small addition below it.
export default function VideoPlayer() {
  const {
    videoTrack, closeVideo, openChannel,
    downloadVideo, isVideoDownloaded, downloadingVideo,
  } = usePlayer();
  const videoRef = useRef(null);
  const [chapters, setChapters] = useState([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoSrc, setVideoSrc] = useState(null);

  useEffect(() => {
    if (!videoTrack) return;
    let cancelled = false;
    setChapters([]);
    info(videoTrack.id).then((d) => {
      if (!cancelled) setChapters(d.chapters || []);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [videoTrack?.id]);

  // Downloaded videos are only ever opened after they're fully cached, so
  // grab the blob straight from Cache Storage here on the main page and hand
  // the <video> element a plain Blob URL, rather than pointing it at the
  // network URL and letting the Service Worker intercept + range-slice it.
  // A Service Worker has a much tighter memory ceiling than the page on iOS
  // Safari, and even a "materialize once" ~1GB Blob there is enough to get it
  // killed mid-request - which shows up as the video failing to load at all.
  // The main page has far more headroom, and a Blob URL lets the browser's
  // own media pipeline handle seeking natively with no Range/SW involved.
  useEffect(() => {
    if (!videoTrack) { setVideoSrc(null); return; }
    let objectUrl = null;
    let cancelled = false;
    setVideoSrc(null);
    (async () => {
      const networkUrl = videoFileUrl(videoTrack.id);
      try {
        const cache = await caches.open(VIDEO_CACHE);
        const cached = await cache.match(networkUrl);
        if (cancelled) return;
        if (cached) {
          const blob = await cached.blob();
          if (cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          setVideoSrc(objectUrl);
          return;
        }
      } catch (e) {
        console.error('reading cached video failed, falling back to network:', videoTrack.id, e);
      }
      if (!cancelled) setVideoSrc(networkUrl);
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [videoTrack?.id]);

  if (!videoTrack) return null;
  const downloaded = isVideoDownloaded(videoTrack.id);
  const busy = !!downloadingVideo[videoTrack.id];

  return (
    <div className="fixed inset-0 sm:left-1/2 sm:right-auto sm:-ml-[220px] sm:w-[440px] z-[70] flex flex-col bg-black safe-top safe-bottom sm:rounded-[28px] sm:border sm:border-white/10 sm:shadow-2xl sm:shadow-black/60 overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <button onClick={closeVideo} className="p-2 -ml-2 active:scale-90 text-white">
          <ChevronDown size={28} />
        </button>
        <span className="text-[12px] uppercase tracking-widest text-muted">Video</span>
        <button
          onClick={() => downloadVideo(videoTrack)}
          disabled={downloaded || busy}
          className="p-2 -mr-2 active:scale-90 text-white disabled:opacity-70"
          title={downloaded ? 'Downloaded' : 'Download for offline'}
        >
          {downloaded ? (
            <DownloadedIcon size={22} className="text-accent" />
          ) : busy ? (
            <span className="block w-[22px] h-[22px] rounded-full border-2 border-muted border-t-accent animate-spin" />
          ) : (
            <DownloadIcon size={22} />
          )}
        </button>
      </div>

      <div className="bg-black grid place-items-center relative w-full max-h-[45vh] sm:max-h-[280px] min-h-[160px]">
        {videoSrc ? (
          <video
            ref={videoRef}
            key={videoTrack.id}
            src={videoSrc}
            poster={videoTrack.thumbnail}
            controls
            playsInline
            autoPlay
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            className="w-full max-h-[45vh] sm:max-h-[280px] bg-black"
          />
        ) : (
          <>
            <img src={videoTrack.thumbnail} alt="" className="w-full max-h-[45vh] sm:max-h-[280px] object-cover opacity-40" />
            <span className="absolute w-8 h-8 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          </>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-4 pt-4">
        <h1 className="text-xl font-bold text-white truncate">{videoTrack.title}</h1>
        <button
          onClick={() => { if (videoTrack.channelUrl) { closeVideo(); openChannel(videoTrack); } }}
          disabled={!videoTrack.channelUrl}
          className="flex items-center gap-1.5 mt-1 text-muted active:opacity-70 disabled:active:opacity-100"
        >
          <ChannelIcon size={14} />
          <span className="text-[14px] truncate">{videoTrack.artist}</span>
        </button>

        {chapters.length > 0 && (
          <div className="mt-4">
            <p className="text-[11px] text-muted uppercase tracking-wide mb-2">Sections</p>
            <ChapterList
              chapters={chapters}
              currentTime={currentTime}
              onSeek={(t) => { if (videoRef.current) videoRef.current.currentTime = t; }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
