import { usePlayer } from '../context/PlayerContext.jsx';
import SongRow from '../components/SongRow.jsx';
import { fmtTime } from '../lib/format.js';
import { DownloadIcon } from '../components/Icons.jsx';

export default function Library() {
  const { library, downloading } = usePlayer();

  // Tracks mid-download that aren't in the library yet — shown greyed out with
  // a spinner until the file finishes caching.
  const pending = Object.values(downloading).filter(
    (t) => t && typeof t === 'object' && !library.some((l) => l.id === t.id)
  );

  const isEmpty = library.length === 0 && pending.length === 0;

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 pt-2 pb-3">
        <h1 className="text-3xl font-bold">Library</h1>
        <p className="text-muted text-sm mt-1">
          {library.length} downloaded {library.length === 1 ? 'song' : 'songs'} · plays offline
        </p>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-2">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center text-muted gap-3 pt-24 px-8 text-center">
            <DownloadIcon size={48} className="opacity-40" />
            <p>No downloads yet. Tap the download icon on any song to save it for offline listening.</p>
          </div>
        ) : (
          <>
            {pending.map((t) => (
              <DownloadingRow key={t.id} track={t} />
            ))}
            {library.map((t) => (
              <SongRow key={t.id} track={t} actions="library" />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// A non-interactive, greyed-out row for a song that's still downloading.
function DownloadingRow({ track }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 opacity-50">
      <img
        src={track.thumbnail}
        alt=""
        loading="lazy"
        className="w-12 h-12 rounded-lg object-cover bg-surface2 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] text-white">{track.title}</p>
        <p className="truncate text-[13px] text-muted">{track.artist}</p>
      </div>
      <span className="text-[12px] text-muted tabular-nums shrink-0">
        {track.duration ? fmtTime(track.duration) : ''}
      </span>
      <span className="grid place-items-center w-9 h-9 shrink-0">
        <span className="w-4 h-4 rounded-full border-2 border-muted border-t-accent animate-spin" />
      </span>
    </div>
  );
}
