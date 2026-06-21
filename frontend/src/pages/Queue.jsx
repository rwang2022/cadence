import { useEffect, useRef, useState } from 'react';
import { usePlayer } from '../context/PlayerContext.jsx';
import { fmtTime } from '../lib/format.js';
import { TrashIcon, QueueIcon, DragIcon } from '../components/Icons.jsx';

export default function Queue() {
  const {
    queue, current, playTrack, preload, removeFromQueue, reorderQueue, clearQueue,
  } = usePlayer();

  const listRef = useRef(null);
  const queueRef = useRef(queue);
  useEffect(() => { queueRef.current = queue; }, [queue]);

  const [dragId, setDragId] = useState(null);
  const drag = useRef(null);          // { id, moved }
  const suppressClick = useRef(false); // ignore the click that ends a drag

  // Pointer-based reordering: swap with a neighbour as the finger crosses its
  // midpoint. Works with both mouse and touch (iOS/PWA). Defined once per drag
  // so add/removeEventListener share the same handler identities.
  function startDrag(e, id) {
    e.stopPropagation();
    drag.current = { id, moved: false };
    setDragId(id);

    const onMove = (ev) => {
      const d = drag.current;
      if (!d) return;
      d.moved = true;
      const rows = [...(listRef.current?.querySelectorAll('[data-row]') || [])];
      const idx = queueRef.current.findIndex((t) => t.id === d.id);
      if (idx === -1) return;
      const y = ev.clientY;
      if (idx > 0) {
        const r = rows[idx - 1].getBoundingClientRect();
        if (y < r.top + r.height / 2) { reorderQueue(idx, idx - 1); return; }
      }
      if (idx < rows.length - 1) {
        const r = rows[idx + 1].getBoundingClientRect();
        if (y > r.top + r.height / 2) { reorderQueue(idx, idx + 1); return; }
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const moved = drag.current?.moved;
      drag.current = null;
      setDragId(null);
      if (moved) {
        suppressClick.current = true;
        setTimeout(() => { suppressClick.current = false; }, 120);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 pt-2 pb-3 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold">Queue</h1>
          <p className="text-muted text-sm mt-1">
            {queue.length} {queue.length === 1 ? 'song' : 'songs'} · drag <span className="align-middle">⠿</span> to reorder
          </p>
        </div>
        {queue.length > 0 && (
          <button onClick={clearQueue} className="text-sm text-muted active:text-white">
            Clear
          </button>
        )}
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto no-scrollbar pb-2">
        {queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-muted gap-3 pt-24 px-8 text-center">
            <QueueIcon size={48} className="opacity-40" />
            <p>Your queue is empty. Add songs from Search with the + button.</p>
          </div>
        ) : (
          queue.map((t) => {
            const active = current?.id === t.id;
            const dragging = dragId === t.id;
            return (
              <div
                key={t.id}
                data-row
                className={`flex items-center gap-3 px-4 py-2.5 transition-shadow ${
                  active ? 'bg-surface2' : ''
                } ${dragging ? 'bg-surface2 shadow-lg shadow-black/50 scale-[1.01] relative z-10' : ''}`}
                onPointerDown={() => preload(t)}
                onClick={() => { if (suppressClick.current) return; playTrack(t); }}
              >
                {/* drag handle */}
                <div
                  onPointerDown={(e) => startDrag(e, t.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="grid place-items-center w-7 h-11 -ml-1 text-muted active:text-white cursor-grab touch-none select-none"
                  style={{ touchAction: 'none' }}
                  aria-label="Drag to reorder"
                >
                  <DragIcon size={18} />
                </div>

                <img src={t.thumbnail} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0 pointer-events-none" />
                <div className="min-w-0 flex-1 pointer-events-none">
                  <p className={`truncate text-[15px] ${active ? 'text-accent' : ''}`}>{t.title}</p>
                  <p className="truncate text-[13px] text-muted">{t.artist}</p>
                </div>
                <span className="text-[12px] text-muted tabular-nums pointer-events-none">{fmtTime(t.duration)}</span>

                <button
                  onClick={(e) => { e.stopPropagation(); removeFromQueue(t.id); }}
                  className="grid place-items-center w-9 h-9 text-muted active:text-white active:scale-90"
                  aria-label="Remove from queue"
                >
                  <TrashIcon size={18} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
