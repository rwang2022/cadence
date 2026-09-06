// Horizontal chip list for a track's YouTube chapters (the labelled sections
// in the scrubber) - tap a chip to jump there. Renders nothing if there are
// no chapters, so callers can drop it in unconditionally.
export default function ChapterList({ chapters, currentTime, onSeek }) {
  if (!chapters || chapters.length === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
      {chapters.map((c, i) => {
        const active = currentTime >= c.start && (c.end == null || currentTime < c.end);
        return (
          <button
            key={i}
            onClick={() => onSeek(c.start)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] whitespace-nowrap transition active:scale-95 ${
              active ? 'bg-accent text-white' : 'bg-surface2 text-muted'
            }`}
          >
            {c.title}
          </button>
        );
      })}
    </div>
  );
}
