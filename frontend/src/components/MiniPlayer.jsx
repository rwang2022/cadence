import { usePlayer } from '../context/PlayerContext.jsx';
import { PlayIcon, PauseIcon } from './Icons.jsx';

// Compact bar shown above the tab nav whenever something is loaded.
export default function MiniPlayer() {
  const { current, isPlaying, togglePlay, setShowNowPlaying, currentTime, duration } = usePlayer();
  if (!current) return null;
  const pct = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="mx-2 mb-1 rounded-xl bg-surface2/90 backdrop-blur border border-white/5 overflow-hidden"
      onClick={() => setShowNowPlaying(true)}
    >
      <div className="flex items-center gap-3 px-3 py-2">
        <img src={current.thumbnail} alt="" className="w-10 h-10 rounded-md object-cover" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] leading-tight">{current.title}</p>
          <p className="truncate text-[12px] text-muted leading-tight">{current.artist}</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); togglePlay(); }}
          className="grid place-items-center w-10 h-10 active:scale-90 transition"
        >
          {isPlaying ? <PauseIcon size={26} /> : <PlayIcon size={26} />}
        </button>
      </div>
      <div className="h-[2px] bg-white/10">
        <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
