import { usePlayer } from '../context/PlayerContext.jsx';
import Scrubber from './Scrubber.jsx';
import {
  PlayIcon, PauseIcon, ChevronDown, Back15, Fwd15, VolumeIcon,
  DownloadIcon, DownloadedIcon,
} from './Icons.jsx';

// Full-screen player overlay.
export default function NowPlaying() {
  const {
    current, isPlaying, currentTime, duration, volume, buffering,
    togglePlay, seek, skip, setVolume, playNext, playPrev,
    setShowNowPlaying, showNowPlaying,
    download, isDownloaded, downloading,
  } = usePlayer();

  if (!current) return null;
  const downloaded = isDownloaded(current.id);
  const isDownloading = !!downloading[current.id];

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-[#1a1320] via-bg to-bg transition-transform duration-300 safe-top safe-bottom ${
        showNowPlaying ? 'translate-y-0' : 'translate-y-full pointer-events-none'
      }`}
    >
      {/* header */}
      <div className="flex items-center justify-between px-5 pt-3 pb-1">
        <button onClick={() => setShowNowPlaying(false)} className="p-2 -ml-2 active:scale-90">
          <ChevronDown size={28} />
        </button>
        <span className="text-[12px] uppercase tracking-widest text-muted">Now Playing</span>
        <button
          onClick={() => download(current)}
          disabled={downloaded || isDownloading}
          className="p-2 -mr-2 active:scale-90"
        >
          {downloaded ? <DownloadedIcon size={24} className="text-accent" /> : <DownloadIcon size={24} />}
        </button>
      </div>

      {/* album art */}
      <div className="flex-1 grid place-items-center px-8">
        <div className="relative w-full max-w-sm aspect-square">
          <img
            src={current.thumbnail}
            alt=""
            className="w-full h-full object-cover rounded-3xl shadow-2xl shadow-black/60"
          />
          {buffering && (
            <span className="absolute inset-0 grid place-items-center bg-black/30 rounded-3xl">
              <span className="w-8 h-8 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            </span>
          )}
        </div>
      </div>

      {/* meta */}
      <div className="px-8">
        <h1 className="text-2xl font-bold truncate">{current.title}</h1>
        <p className="text-muted text-base truncate mt-1">{current.artist}</p>
      </div>

      {/* scrubber */}
      <div className="px-8 mt-5">
        <Scrubber currentTime={currentTime} duration={duration} onSeek={seek} />
      </div>

      {/* transport */}
      <div className="flex items-center justify-center gap-6 px-8 mt-4">
        <button onClick={() => skip(-15)} className="p-2 text-white/90 active:scale-90" title="Back 15s">
          <Back15 size={34} />
        </button>
        <button onClick={playPrev} className="p-2 active:scale-90" title="Previous">
          <PrevNext dir="prev" />
        </button>
        <button
          onClick={togglePlay}
          className="grid place-items-center w-[72px] h-[72px] rounded-full bg-white text-black active:scale-95 transition shadow-lg"
        >
          {isPlaying ? <PauseIcon size={36} /> : <PlayIcon size={36} />}
        </button>
        <button onClick={playNext} className="p-2 active:scale-90" title="Next">
          <PrevNext dir="next" />
        </button>
        <button onClick={() => skip(15)} className="p-2 text-white/90 active:scale-90" title="Forward 15s">
          <Fwd15 size={34} />
        </button>
      </div>

      {/* volume */}
      <div className="flex items-center gap-3 px-10 mt-6 mb-6">
        <VolumeIcon size={18} className="text-muted shrink-0" />
        <input
          type="range"
          min={0}
          max={1}
          step="0.01"
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="flex-1"
          style={{
            background: `linear-gradient(to right,#8b5cf6 ${volume * 100}%,#2a2a38 ${volume * 100}%)`,
            borderRadius: 999,
          }}
        />
      </div>
    </div>
  );
}

function PrevNext({ dir }) {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor">
      {dir === 'prev' ? (
        <path d="M6 6h2v12H6zM20 6 9 12l11 6V6z" />
      ) : (
        <path d="M16 6h2v12h-2zM4 6l11 6L4 18V6z" />
      )}
    </svg>
  );
}
