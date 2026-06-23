import { useState } from 'react';
import { usePlayer } from '../context/PlayerContext.jsx';
import { CheckIcon, PlusIcon } from './Icons.jsx';

/**
 * Bottom-sheet tag editor for a single track. Works for both library songs and
 * search results — tagging a not-yet-downloaded song saves it first (Option A).
 */
export default function TagSheet({ track, onClose }) {
  const { library, toggleTag } = usePlayer();
  const entry = library.find((t) => t.id === track.id);
  // Local mirror so chips react instantly, regardless of the download/save delay.
  const [sel, setSel] = useState(() => entry?.tags || []);
  const [draft, setDraft] = useState('');

  const allTags = [...new Set(library.flatMap((t) => t.tags || []))].sort();

  const apply = (tag) => {
    const t = tag.trim();
    if (!t) return;
    setSel((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));
    toggleTag(track, t);
  };

  const addDraft = () => {
    const t = draft.trim();
    if (t && !sel.includes(t)) apply(t);
    setDraft('');
  };

  const chips = [...new Set([...sel, ...allTags])];

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-surface rounded-t-3xl p-5 pb-8 safe-bottom max-h-[70%] overflow-y-auto no-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto w-10 h-1 rounded-full bg-surface2 mb-4" />
        <p className="truncate text-[15px] font-semibold">{track.title}</p>
        <p className="truncate text-[13px] text-muted mb-4">{track.artist}</p>

        <div className="flex gap-2 mb-4">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addDraft()}
            placeholder="New tag (e.g. jazzy)"
            className="flex-1 bg-surface2 rounded-full px-4 py-2 text-[15px] outline-none placeholder:text-muted"
          />
          <button
            onClick={addDraft}
            className="grid place-items-center w-10 h-10 rounded-full bg-accent text-white active:scale-90 shrink-0"
          >
            <PlusIcon size={20} />
          </button>
        </div>

        {chips.length === 0 ? (
          <p className="text-muted text-[13px]">No tags yet. Add one above.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {chips.map((tag) => {
              const on = sel.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => apply(tag)}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[14px] active:scale-95 transition ${
                    on ? 'bg-accent text-white' : 'bg-surface2 text-muted'
                  }`}
                >
                  {on && <CheckIcon size={15} />}
                  {tag}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
