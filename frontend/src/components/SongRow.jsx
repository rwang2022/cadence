import { usePlayer } from '../context/PlayerContext.jsx';
import { fmtTime } from '../lib/format.js';
import {
  PlusIcon, CheckIcon, DownloadIcon, DownloadedIcon, TrashIcon,
} from './Icons.jsx';

/**
 * A single track row. `actions` chooses which buttons appear:
 *   'search'  -> add-to-queue + download
 *   'library' -> remove download
 *   'queue'   -> handled separately in Queue page
 */
export default function SongRow({ track, actions = 'search', trailing }) {
  const {
    current, isPlaying, playTrack, preload,
    addToQueue, queue, download, downloading, isDownloaded, removeDownload,
  } = usePlayer();

  const active = current?.id === track.id;
  const inQueue = queue.some((t) => t.id === track.id);
  const downloaded = isDownloaded(track.id);
  const isDownloading = !!downloading[track.id];

  return (
    <div
      className={`group flex items-center gap-3 px-4 py-2.5 active:bg-surface2 transition-colors ${
        active ? 'bg-surface2' : ''
      }`}
      onPointerDown={() => preload(track)} // preload audio on tap to avoid lag
      onClick={() => playTrack(track)}
      role="button"
    >
      <div className="relative shrink-0">
        <img
          src={track.thumbnail}
          alt=""
          loading="lazy"
          className="w-12 h-12 rounded-lg object-cover bg-surface2"
        />
        {active && isPlaying && (
          <span className="absolute inset-0 grid place-items-center rounded-lg bg-black/40">
            <Equalizer />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className={`truncate text-[15px] ${active ? 'text-accent' : 'text-white'}`}>
          {track.title}
        </p>
        <p className="truncate text-[13px] text-muted">{track.artist}</p>
      </div>

      <span className="text-[12px] text-muted tabular-nums shrink-0">
        {track.duration ? fmtTime(track.duration) : ''}
      </span>

      {trailing}

      {actions === 'search' && (
        <div className="flex items-center gap-1 shrink-0">
          <IconBtn
            onClick={(e) => { e.stopPropagation(); addToQueue(track); }}
            title={inQueue ? 'In queue' : 'Add to queue'}
          >
            {inQueue ? <CheckIcon size={20} className="text-accent" /> : <PlusIcon size={20} />}
          </IconBtn>
          <IconBtn
            onClick={(e) => { e.stopPropagation(); download(track); }}
            title={downloaded ? 'Downloaded' : 'Download for offline'}
            disabled={downloaded || isDownloading}
          >
            {downloaded ? (
              <DownloadedIcon size={20} className="text-accent" />
            ) : isDownloading ? (
              <Spinner />
            ) : (
              <DownloadIcon size={20} />
            )}
          </IconBtn>
        </div>
      )}

      {actions === 'library' && (
        <IconBtn
          onClick={(e) => { e.stopPropagation(); removeDownload(track.id); }}
          title="Remove download"
        >
          <TrashIcon size={20} />
        </IconBtn>
      )}
    </div>
  );
}

function IconBtn({ children, ...p }) {
  return (
    <button
      {...p}
      className="grid place-items-center w-9 h-9 rounded-full text-muted hover:text-white disabled:opacity-100 active:scale-90 transition"
    >
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <span className="w-4 h-4 rounded-full border-2 border-muted border-t-accent animate-spin" />
  );
}

function Equalizer() {
  return (
    <span className="flex items-end gap-[2px] h-4">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-[3px] bg-accent rounded-full"
          style={{
            height: '100%',
            animation: `eq 0.8s ${i * 0.15}s ease-in-out infinite alternate`,
          }}
        />
      ))}
      <style>{`@keyframes eq{from{height:25%}to{height:100%}}`}</style>
    </span>
  );
}
