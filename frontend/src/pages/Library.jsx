import { useState } from 'react';
import { usePlayer } from '../context/PlayerContext.jsx';
import SongRow from '../components/SongRow.jsx';
import { fmtTime, fmtBytes } from '../lib/format.js';
import { DownloadIcon } from '../components/Icons.jsx';

export default function Library() {
  const { library, downloading, addToQueue } = usePlayer();
  const [filter, setFilter] = useState(null);

  // Tracks mid-download that aren't in the library yet — shown greyed out with
  // a spinner until the file finishes caching.
  const pending = Object.values(downloading).filter(
    (t) => t && typeof t === 'object' && !library.some((l) => l.id === t.id)
  );

  // Tags drawn from the library itself; the active filter is only honoured while
  // it still exists (so removing a tag's last song falls back to "All").
  const allTags = [...new Set(library.flatMap((t) => t.tags || []))].sort();
  const active = filter && allTags.includes(filter) ? filter : null;
  const shown = active ? library.filter((t) => (t.tags || []).includes(active)) : library;

  const isEmpty = library.length === 0 && pending.length === 0;
  const totalBytes = library.reduce((sum, t) => sum + (t.size || 0), 0);

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 pt-2 pb-3">
        <h1 className="text-3xl font-bold">Library</h1>
        <p className="text-muted text-sm mt-1">
          {library.length} downloaded {library.length === 1 ? 'song' : 'songs'}
          {totalBytes > 0 && <> · {fmtBytes(totalBytes)}</>} · plays offline
        </p>
      </div>

      {allTags.length > 0 && (
        <div className="flex items-center gap-2 px-4 pb-3 overflow-x-auto no-scrollbar">
          <Chip on={!active} onClick={() => setFilter(null)}>All</Chip>
          {allTags.map((tag) => (
            <Chip key={tag} on={active === tag} onClick={() => setFilter(tag)}>
              {tag}
            </Chip>
          ))}
          {active && (
            <button
              onClick={() => shown.forEach(addToQueue)}
              className="ml-auto shrink-0 text-[13px] text-accent font-medium active:scale-95"
            >
              Queue all
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto no-scrollbar pb-2">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center text-muted gap-3 pt-24 px-8 text-center">
            <DownloadIcon size={48} className="opacity-40" />
            <p>No downloads yet. Tap the download icon on any song to save it for offline listening.</p>
          </div>
        ) : (
          <>
            {!active && pending.map((t) => (
              <DownloadingRow key={t.id} track={t} />
            ))}
            {shown.map((t) => (
              <SongRow
                key={t.id}
                track={t}
                actions="library"
                trailing={
                  <span className="text-[12px] text-muted tabular-nums shrink-0">
                    {fmtBytes(t.size)}
                  </span>
                }
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function Chip({ on, children, ...p }) {
  return (
    <button
      {...p}
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-[14px] active:scale-95 transition ${
        on ? 'bg-accent text-white' : 'bg-surface2 text-muted'
      }`}
    >
      {children}
    </button>
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
