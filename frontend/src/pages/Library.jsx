import { usePlayer } from '../context/PlayerContext.jsx';
import SongRow from '../components/SongRow.jsx';
import { DownloadIcon } from '../components/Icons.jsx';

export default function Library() {
  const { library } = usePlayer();

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 pt-2 pb-3">
        <h1 className="text-3xl font-bold">Library</h1>
        <p className="text-muted text-sm mt-1">
          {library.length} downloaded {library.length === 1 ? 'song' : 'songs'} · plays offline
        </p>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-2">
        {library.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-muted gap-3 pt-24 px-8 text-center">
            <DownloadIcon size={48} className="opacity-40" />
            <p>No downloads yet. Tap the download icon on any song to save it for offline listening.</p>
          </div>
        ) : (
          library.map((t) => (
            <SongRow key={t.id} track={t} actions="library" />
          ))
        )}
      </div>
    </div>
  );
}
