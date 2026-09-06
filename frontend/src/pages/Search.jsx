import { useEffect, useRef, useState } from 'react';
import { search, extractPlaylistRef } from '../api.js';
import SongRow from '../components/SongRow.jsx';
import PlaylistView from '../components/PlaylistView.jsx';
import { SearchIcon, MusicIcon, ChevronDown } from '../components/Icons.jsx';

const PAGE_SIZE = 10;

export default function Search() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [shownCount, setShownCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  // A pasted playlist link/id gets its own view instead of a keyword search.
  const playlistRef = extractPlaylistRef(q);

  // debounced search
  useEffect(() => {
    if (!q.trim() || playlistRef) {
      setResults([]);
      setError(null);
      return;
    }
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      setError(null);
      setShownCount(PAGE_SIZE);
      try {
        const r = await search(q, ctrl.signal);
        setResults(r);
      } catch (e) {
        if (e.name !== 'AbortError') setError(e.message);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [q, playlistRef]);

  const visible = results.slice(0, shownCount);
  const hasMore = shownCount < results.length;

  return (
    <div className="h-full flex flex-col">
      {/* search bar */}
      <div className="px-4 pt-2 pb-3">
        <h1 className="text-3xl font-bold mb-3">Search</h1>
        <div className="flex items-center gap-2 bg-surface2 rounded-xl px-3.5 h-11">
          <SearchIcon size={20} className="text-muted shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Songs, artists, or a playlist link..."
            className="flex-1 bg-transparent outline-none text-[16px] placeholder:text-muted"
            autoCapitalize="none"
            autoCorrect="off"
            enterKeyHint="search"
          />
          {q && (
            <button onClick={() => setQ('')} className="text-muted text-sm px-1">✕</button>
          )}
        </div>
      </div>

      {playlistRef ? (
        <PlaylistView playlistRef={playlistRef} />
      ) : (
        <div className="flex-1 overflow-y-auto no-scrollbar pb-2">
          {loading && <Centered>Searching…</Centered>}
          {error && <Centered>⚠️ {error}</Centered>}
          {!loading && !error && q && results.length === 0 && (
            <Centered>No results</Centered>
          )}
          {!q && (
            <div className="flex flex-col items-center justify-center text-muted gap-3 pt-24 px-8 text-center">
              <MusicIcon size={48} className="opacity-40" />
              <p>Search YouTube for any song, or paste a playlist link, and stream it instantly.</p>
            </div>
          )}
          {visible.map((t) => (
            <SongRow key={t.id} track={t} actions="search" />
          ))}
          {hasMore && (
            <button
              onClick={() => setShownCount((c) => c + PAGE_SIZE)}
              className="flex items-center justify-center gap-1.5 w-full py-3.5 text-[14px] text-accent font-medium active:opacity-70"
            >
              Show more <ChevronDown size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Centered({ children }) {
  return <div className="text-center text-muted pt-16">{children}</div>;
}
