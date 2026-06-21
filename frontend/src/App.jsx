import { useState } from 'react';
import { usePlayer } from './context/PlayerContext.jsx';
import BottomNav from './components/BottomNav.jsx';
import MiniPlayer from './components/MiniPlayer.jsx';
import NowPlaying from './components/NowPlaying.jsx';
import Search from './pages/Search.jsx';
import Library from './pages/Library.jsx';
import Queue from './pages/Queue.jsx';

export default function App() {
  const [tab, setTab] = useState('search');
  const { queue } = usePlayer();

  return (
    <div className="h-full flex flex-col bg-bg text-white safe-top">
      <main className="flex-1 min-h-0">
        <div className={tab === 'search' ? 'h-full' : 'hidden'}><Search /></div>
        <div className={tab === 'library' ? 'h-full' : 'hidden'}><Library /></div>
        <div className={tab === 'queue' ? 'h-full' : 'hidden'}><Queue /></div>
      </main>

      <MiniPlayer />
      <BottomNav tab={tab} setTab={setTab} queueCount={queue.length} />
      <NowPlaying />
    </div>
  );
}
