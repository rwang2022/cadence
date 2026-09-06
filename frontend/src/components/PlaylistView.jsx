import { useEffect, useState } from 'react';
import { getPlaylist } from '../api.js';
import { usePlayer } from '../context/PlayerContext.jsx';
import SongRow from './SongRow.jsx';
import { PlaylistIcon } from './Icons.jsx';

// Shown in place of search results when the search box holds a playlist
// link/id (see api.js's extractPlaylistRef). Lets you queue or download the
// whole thing at once, or just individual songs via the normal SongRow.
export default function PlaylistView({ playlistRef }) {
  const { addToQueue, download } = usePlayer();
  const [state, setState] = useState('loading'); // loading | ok | error
  const [title, setTitle] = useState(null);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    getPlaylist(playlistRef)
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
  }, [playlistRef]);

  return (
    <div className="flex-1 overflow-y-auto no-scrollbar pb-2">
      {state === 'loading' && <Centered>Loading playlist…</Centered>}
      {state === 'error' && <Centered>⚠️ {error}</Centered>}

      {state === 'ok' && (
        <>
          <div className="flex items-center gap-2 px-4 pb-3">
            <PlaylistIcon size={18} className="text-muted shrink-0" />
            <p className="text-[14px] font-semibold truncate flex-1">{title || 'Playlist'}</p>
            <span className="text-[12px] text-muted shrink-0">{results.length}</span>
          </div>
          {results.length > 0 && (
            <div className="flex items-center gap-2 px-4 pb-3">
              <button
                onClick={() => results.forEach(addToQueue)}
                className="rounded-full bg-surface2 text-white px-3.5 py-1.5 text-[13px] active:scale-95 transition"
              >
                Queue all
              </button>
              <button
                onClick={() => results.forEach(download)}
                className="rounded-full bg-accent text-white px-3.5 py-1.5 text-[13px] active:scale-95 transition"
              >
                Download all (audio)
              </button>
            </div>
          )}
          {results.length === 0 && <Centered>This playlist is empty.</Centered>}
          {results.map((t) => <SongRow key={t.id} track={t} actions="search" />)}
        </>
      )}
    </div>
  );
}

function Centered({ children }) {
  return <div className="text-center text-muted pt-16 px-8">{children}</div>;
}
