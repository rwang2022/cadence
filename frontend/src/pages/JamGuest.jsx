import { useEffect, useRef, useState } from 'react';
import { search, addToJam, removeJamSong, reorderJam, joinJam, pingJam, leaveJamBeacon, getJam } from '../api.js';
import { SearchIcon, MusicIcon, PlusIcon, CheckIcon, TrashIcon, DragIcon } from '../components/Icons.jsx';
import { fmtTime } from '../lib/format.js';
import { getOrCreateGuestId } from '../lib/storage.js';
import { emojiFor } from '../lib/animals.js';

const HEARTBEAT_MS = 5000;
const POLL_MS = 4000;

// Minimal, standalone page opened via a Jam share link. Deliberately has no
// player, library, or download UI - search + add straight to the live
// shared queue (no approval step), see + reorder that queue, and a
// read-only "Now Playing" readout. Does not use PlayerContext at all - no
// audio ever plays on this page.
export default function JamGuest({ roomId }) {
  const [roomState, setRoomState] = useState('checking'); // checking | ok | gone
  const [myName, setMyName] = useState(null);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [queueList, setQueueList] = useState([]); // [{ track, addedAt, clientId }]
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  const clientIdRef = useRef(getOrCreateGuestId());

  const queueListRef = useRef(queueList);
  useEffect(() => { queueListRef.current = queueList; }, [queueList]);
  const listElRef = useRef(null);
  const [dragId, setDragId] = useState(null);
  const dragRef = useRef(null); // { id, moved }

  // Join once on open (registers presence + gets our animal name), then send
  // a heartbeat so the host's guest list keeps showing us as active, and let
  // the room know if we close the tab.
  useEffect(() => {
    let cancelled = false;
    const clientId = clientIdRef.current;

    joinJam(roomId, clientId)
      .then((res) => {
        if (cancelled) return;
        if (!res) { setRoomState('gone'); return; }
        setMyName(res.name);
        setRoomState('ok');
      })
      .catch(() => { if (!cancelled) setRoomState('gone'); });

    const heartbeat = setInterval(() => pingJam(roomId, clientId), HEARTBEAT_MS);
    const onLeave = () => leaveJamBeacon(roomId, clientId);
    window.addEventListener('pagehide', onLeave);

    return () => {
      cancelled = true;
      clearInterval(heartbeat);
      window.removeEventListener('pagehide', onLeave);
    };
  }, [roomId]);

  // Poll for what the host is currently playing (read-only - no audio here)
  // and the live shared queue.
  useEffect(() => {
    if (roomState !== 'ok') return;
    let cancelled = false;
    const poll = async () => {
      try {
        const room = await getJam(roomId);
        if (cancelled) return;
        if (!room) { setRoomState('gone'); return; }
        setNowPlaying(room.nowPlaying || null);
        // Don't stomp an in-progress local drag with a stale snapshot.
        if (!dragRef.current) setQueueList(room.queue);
      } catch { /* transient - next poll retries */ }
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [roomId, roomState]);

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
    // Optimistic, so the checkmark shows immediately.
    setQueueList((ql) => (ql.some((e) => e.track.id === track.id)
      ? ql
      : [...ql, { track, addedAt: Date.now(), clientId: clientIdRef.current }]));
    try {
      const { queue } = await addToJam(roomId, track, clientIdRef.current);
      setQueueList(queue);
    } catch (e) {
      setQueueList((ql) => ql.filter((e) => e.track.id !== track.id));
      alert(`Couldn't add "${track.title}":\n${e.message}`);
    }
  }

  async function handleRemove(entry) {
    setQueueList((ql) => ql.filter((e) => e.track.id !== entry.track.id));
    try {
      await removeJamSong(roomId, entry.track.id, clientIdRef.current);
    } catch { /* it'll reappear on the next poll if this actually failed */ }
  }

  // Same pointer-based swap-with-neighbour reorder as the host's Queue page,
  // just talking straight to the API instead of going through PlayerContext.
  function startDrag(e, id) {
    e.stopPropagation();
    dragRef.current = { id, moved: false };
    setDragId(id);

    const onMove = (ev) => {
      const d = dragRef.current;
      if (!d) return;
      d.moved = true;
      const rows = [...(listElRef.current?.querySelectorAll('[data-row]') || [])];
      const idx = queueListRef.current.findIndex((e) => e.track.id === d.id);
      if (idx === -1) return;
      const y = ev.clientY;
      let toIdx = null;
      if (idx > 0) {
        const r = rows[idx - 1].getBoundingClientRect();
        if (y < r.top + r.height / 2) toIdx = idx - 1;
      }
      if (toIdx === null && idx < rows.length - 1) {
        const r = rows[idx + 1].getBoundingClientRect();
        if (y > r.top + r.height / 2) toIdx = idx + 1;
      }
      if (toIdx !== null) {
        setQueueList((ql) => {
          const next = [...ql];
          const [moved] = next.splice(idx, 1);
          next.splice(toIdx, 0, moved);
          return next;
        });
        reorderJam(roomId, d.id, toIdx);
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      dragRef.current = null;
      setDragId(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  let content;
  if (roomState === 'checking') {
    content = <Centered>Loading…</Centered>;
  } else if (roomState === 'gone') {
    content = (
      <div className="h-full flex flex-col items-center justify-center text-muted gap-3 px-8 text-center safe-top">
        <MusicIcon size={48} className="opacity-40" />
        <p className="text-white text-lg font-semibold">This Jam has ended</p>
        <p>Ask for a fresh link to keep adding songs.</p>
      </div>
    );
  } else {
    content = (
    <div className="h-full flex flex-col bg-bg text-white safe-top">
      <div className="px-4 pt-3 pb-3">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-xs text-accent font-semibold tracking-wide uppercase">Cadence Jam</p>
          {myName && (
            <p className="text-xs text-muted shrink-0">
              You're {emojiFor(myName)} <span className="text-white font-medium">{myName}</span>
            </p>
          )}
        </div>
        <h1 className="text-2xl font-bold mb-3">Add a song to the queue</h1>

        {nowPlaying && (
          <div className="flex items-center gap-3 bg-surface2 rounded-xl px-3.5 py-2.5 mb-3">
            <img src={nowPlaying.track.thumbnail} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-white">{nowPlaying.track.title}</p>
              <p className="truncate text-[12px] text-muted">{nowPlaying.track.artist}</p>
            </div>
            {nowPlaying.isPlaying ? (
              <span className="flex items-center gap-1.5 text-[11px] text-accent shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" /> Now playing
              </span>
            ) : (
              <span className="text-[11px] text-muted shrink-0">Paused</span>
            )}
          </div>
        )}

        {queueList.length > 0 && (
          <div className="mb-3">
            <p className="text-[11px] text-muted uppercase tracking-wide mb-1.5">
              Queue · {queueList.length} {queueList.length === 1 ? 'song' : 'songs'} · drag to reorder
            </p>
            <div ref={listElRef} className="flex flex-col gap-1.5 max-h-[38vh] overflow-y-auto no-scrollbar">
              {queueList.map((entry) => {
                const mine = entry.clientId === clientIdRef.current;
                const dragging = dragId === entry.track.id;
                return (
                  <div
                    key={entry.track.id}
                    data-row
                    className={`flex items-center gap-2 bg-surface2 rounded-xl px-2.5 py-2 transition-shadow ${
                      dragging ? 'shadow-lg shadow-black/50 scale-[1.01] relative z-10' : ''
                    }`}
                  >
                    <div
                      onPointerDown={(e) => startDrag(e, entry.track.id)}
                      className="grid place-items-center w-7 h-9 -ml-1 text-muted active:text-white cursor-grab touch-none select-none shrink-0"
                      style={{ touchAction: 'none' }}
                      aria-label="Drag to reorder"
                    >
                      <DragIcon size={16} />
                    </div>
                    <img src={entry.track.thumbnail} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-white">{entry.track.title}</p>
                      <p className="truncate text-[12px] text-muted">{entry.track.artist}</p>
                    </div>
                    {mine && (
                      <button
                        onClick={() => handleRemove(entry)}
                        className="grid place-items-center w-9 h-9 text-muted active:text-white shrink-0"
                        title="Remove"
                      >
                        <TrashIcon size={16} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
          const added = queueList.some((e) => e.track.id === t.id);
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
                title={added ? 'In queue' : 'Add to queue'}
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

  // Same centered-column treatment on desktop as the main app (see App.jsx) -
  // unchanged full-bleed on phone.
  return (
    <div className="h-full sm:bg-[#050508] sm:flex sm:items-center sm:justify-center">
      <div className="h-full sm:h-[min(880px,100%)] w-full sm:max-w-[440px] flex flex-col bg-bg text-white sm:rounded-[28px] sm:border sm:border-white/10 sm:shadow-2xl sm:shadow-black/60 overflow-hidden">
        {content}
      </div>
    </div>
  );
}

function Centered({ children }) {
  return <div className="text-center text-muted pt-16 px-8 safe-top">{children}</div>;
}
