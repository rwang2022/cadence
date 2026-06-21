import { fmtTime } from '../lib/format.js';

// Seekable progress bar with current / remaining time labels.
export default function Scrubber({ currentTime, duration, onSeek }) {
  const pct = duration ? (currentTime / duration) * 100 : 0;
  return (
    <div className="w-full">
      <input
        type="range"
        min={0}
        max={duration || 0}
        step="0.1"
        value={currentTime}
        onChange={(e) => onSeek(parseFloat(e.target.value))}
        style={{
          // filled portion in accent, rest in track color
          background: `linear-gradient(to right, #8b5cf6 ${pct}%, #2a2a38 ${pct}%)`,
          borderRadius: 999,
          width: '100%',
        }}
      />
      <div className="flex justify-between text-[11px] text-muted tabular-nums mt-1.5">
        <span>{fmtTime(currentTime)}</span>
        <span>-{fmtTime(Math.max(0, (duration || 0) - currentTime))}</span>
      </div>
    </div>
  );
}
