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
    // On phone this is unchanged (full-bleed, edge to edge). On a wider
    // screen the app would otherwise stretch full-width, which looks broken -
    // so past the sm breakpoint it's centered as a fixed-width column with
    // its own backdrop, like a phone held up on a desk.
    <div className="h-full sm:bg-[#050508] sm:flex sm:items-center sm:justify-center">
      <div className="h-full sm:h-[min(880px,100%)] w-full sm:max-w-[440px] flex flex-col bg-bg text-white safe-top sm:rounded-[28px] sm:border sm:border-white/10 sm:shadow-2xl sm:shadow-black/60 overflow-hidden">
        <main className="flex-1 min-h-0">
          <div className={tab === 'search' ? 'h-full' : 'hidden'}><Search /></div>
          <div className={tab === 'library' ? 'h-full' : 'hidden'}><Library /></div>
          <div className={tab === 'queue' ? 'h-full' : 'hidden'}><Queue /></div>
        </main>

        <MiniPlayer />
        <BottomNav tab={tab} setTab={setTab} queueCount={queue.length} />
      </div>
      <NowPlaying />
    </div>
  );
}
