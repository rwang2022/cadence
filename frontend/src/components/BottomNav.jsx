import { SearchIcon, LibraryIcon, QueueIcon } from './Icons.jsx';

const TABS = [
  { id: 'search', label: 'Search', Icon: SearchIcon },
  { id: 'library', label: 'Library', Icon: LibraryIcon },
  { id: 'queue', label: 'Queue', Icon: QueueIcon },
];

export default function BottomNav({ tab, setTab, queueCount }) {
  return (
    <nav className="border-t border-white/5 bg-surface/95 backdrop-blur safe-bottom">
      <div className="flex">
        {TABS.map(({ id, label, Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`relative flex-1 flex flex-col items-center gap-1 py-2 transition-colors ${
                active ? 'text-accent' : 'text-muted'
              }`}
            >
              <Icon size={24} />
              <span className="text-[10px] font-medium">{label}</span>
              {id === 'queue' && queueCount > 0 && (
                <span className="absolute top-1 right-[calc(50%-22px)] min-w-4 h-4 px-1 grid place-items-center text-[10px] rounded-full bg-accent text-white">
                  {queueCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
