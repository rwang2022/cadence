import { useEffect, useState } from 'react';
import { getChannel } from '../api.js';
import { usePlayer } from '../context/PlayerContext.jsx';
import SongRow from '../components/SongRow.jsx';
import { ChevronDown, ChannelIcon } from '../components/Icons.jsx';

// Overlay showing a channel's other videos - opened via
// usePlayer().openChannel(track), keyed off that track's channelUrl.
export default function Channel() {
  const { channelTrack, closeChannel } = usePlayer();
  const [state, setState] = useState('loading'); // loading | ok | error
  const [title, setTitle] = useState(null);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!channelTrack?.channelUrl) return;
    let cancelled = false;
    setState('loading');
    getChannel(channelTrack.channelUrl)
      .then((d) => {
        if (cancelled) return;
        setTitle(d.title);
        setResults(d.results || []);
        setState('ok');
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message);
        setState('error');
      });
    return () => { cancelled = true; };
  }, [channelTrack?.channelUrl]);

  if (!channelTrack) return null;

  return (
    <div className="fixed inset-0 sm:left-1/2 sm:right-auto sm:-ml-[220px] sm:w-[440px] z-[65] flex flex-col bg-bg text-white safe-top safe-bottom sm:rounded-[28px] sm:border sm:border-white/10 sm:shadow-2xl sm:shadow-black/60 overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-3 pb-3">
        <button onClick={closeChannel} className="p-2 -ml-2 active:scale-90 shrink-0">
          <ChevronDown size={26} />
        </button>
        <ChannelIcon size={20} className="text-muted shrink-0" />
        <h1 className="text-lg font-bold truncate">{title || channelTrack.artist}</h1>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-2">
        {state === 'loading' && <Centered>Loading channel…</Centered>}
        {state === 'error' && <Centered>⚠️ {error}</Centered>}
        {state === 'ok' && results.length === 0 && <Centered>No videos found.</Centered>}
        {state === 'ok' && results.map((t) => <SongRow key={t.id} track={t} actions="search" />)}
      </div>
    </div>
  );
}

function Centered({ children }) {
  return <div className="text-center text-muted pt-16 px-8">{children}</div>;
}
