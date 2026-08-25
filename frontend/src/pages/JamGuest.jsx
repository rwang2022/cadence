import { useEffect, useRef, useState } from 'react';
import { search, getJam, addToJam } from '../api.js';
import { SearchIcon, MusicIcon, PlusIcon, CheckIcon } from '../components/Icons.jsx';
import { fmtTime } from '../lib/format.js';

// Minimal, standalone page opened via a Jam share link. Deliberately has no
// player, library, or download UI - just search + add to the host's Jam
// queue. Does not use PlayerContext at all.
export default function JamGuest({ roomId }) {
  const [roomState, setRoomState] = useState('checking'); // checking | ok | gone
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [addedIds, setAddedIds] = useState(() => new Set());
  const abortRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    getJam(roomId)
      .then((room) => { if (!cancelled) setRoomState(room ? 'ok' : 'gone'); })
      .catch(() => { if (!cancelled) setRoomState('gone'); });
    return () => { cancelled = true; };
  }, [roomId]);

  useEffect(() => {
    if (!q.trim()) { setResults([]); setError(null); return; }
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      setError(null);
      try {
        setResults(await search(q, ctrl.signal));
      } catch (e) {
        if (e.name !== 'AbortError') setError(e.message);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [q]);

  async function handleAdd(track) {
    setAddedIds((s) => new Set(s).add(track.id));
    try {
      await addToJam(roomId, track);
    } catch (e) {
      // Roll back so the user can retry.
      setAddedIds((s) => { const n = new Set(s); n.delete(track.id); return n; });
      alert(`Couldn't add "${track.title}":\n${e.message}`);
    }
  }

  if (roomState === 'checking') {
    return <Centered>Loading…</Centered>;
  }
  if (roomState === 'gone') {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted gap-3 px-8 text-center safe-top">
        <MusicIcon size={48} className="opacity-40" />
        <p className="text-white text-lg font-semibold">This Jam has ended</p>
        <p>Ask for a fresh link to keep adding songs.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bg text-white safe-top">
      <div className="px-4 pt-3 pb-3">
        <p className="text-xs text-accent font-semibold tracking-wide uppercase mb-1">Cadence Jam</p>
        <h1 className="text-2xl font-bold mb-3">Add a song to the queue</h1>
        <div className="flex items-center gap-2 bg-surface2 rounded-xl px-3.5 h-11">
          <SearchIcon size={20} className="text-muted shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Songs, artists..."
            className="flex-1 bg-transparent outline-none text-[16px] placeholder:text-muted"
            autoCapitalize="none"
            autoCorrect="off"
            enterKeyHint="search"
            autoFocus
          />
          {q && <button onClick={() => setQ('')} className="text-muted text-sm px-1">✕</button>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-6">
        {loading && <Centered>Searching…</Centered>}
        {error && <Centered>⚠️ {error}</Centered>}
        {!loading && !error && q && results.length === 0 && <Centered>No results</Centered>}
        {!q && (
          <div className="flex flex-col items-center justify-center text-muted gap-3 pt-24 px-8 text-center">
            <MusicIcon size={48} className="opacity-40" />
            <p>Search for a song and tap + to add it to the queue.</p>
          </div>
        )}
        {results.map((t) => {
          const added = addedIds.has(t.id);
          return (
            <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
              <img src={t.thumbnail} alt="" loading="lazy" className="w-12 h-12 rounded-lg object-cover bg-surface2 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px]">{t.title}</p>
                <p className="truncate text-[13px] text-muted">{t.artist}</p>
              </div>
              <span className="text-[12px] text-muted tabular-nums shrink-0">
                {t.duration ? fmtTime(t.duration) : ''}
              </span>
              <button
                onClick={() => handleAdd(t)}
                disabled={added}
                title={added ? 'Added' : 'Add to queue'}
                className="grid place-items-center w-9 h-9 rounded-full text-muted active:scale-90 transition shrink-0"
              >
                {added ? <CheckIcon size={20} className="text-accent" /> : <PlusIcon size={20} />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Centered({ children }) {
  return <div className="text-center text-muted pt-16 px-8 safe-top">{children}</div>;
}
