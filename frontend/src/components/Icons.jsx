// Minimal inline icon set so we don't pull in an icon library.
const S = ({ children, size = 24, ...p }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...p}
  >
    {children}
  </svg>
);

export const SearchIcon = (p) => (
  <S {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></S>
);
export const LibraryIcon = (p) => (
  <S {...p}><path d="M3 5h18" /><path d="M3 12h18" /><path d="M3 19h18" /></S>
);
export const QueueIcon = (p) => (
  <S {...p}><path d="M3 6h13" /><path d="M3 12h13" /><path d="M3 18h9" /><circle cx="19" cy="16" r="2.5" /><path d="M21.5 16V8l-4 1.2" /></S>
);
export const PlayIcon = (p) => (
  <S {...p} fill="currentColor" stroke="none"><path d="M7 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 7 5.5Z" /></S>
);
export const PauseIcon = (p) => (
  <S {...p} fill="currentColor" stroke="none"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></S>
);
export const ChevronDown = (p) => (<S {...p}><path d="m6 9 6 6 6-6" /></S>);
export const PlusIcon = (p) => (<S {...p}><path d="M12 5v14" /><path d="M5 12h14" /></S>);
export const CheckIcon = (p) => (<S {...p}><path d="M20 6 9 17l-5-5" /></S>);
export const TrashIcon = (p) => (
  <S {...p}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></S>
);
export const DownloadIcon = (p) => (
  <S {...p}><path d="M12 3v12" /><path d="m7 12 5 5 5-5" /><path d="M5 21h14" /></S>
);
export const DownloadedIcon = (p) => (
  <S {...p}><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></S>
);
export const Back15 = (p) => (
  <S {...p}><path d="M11 4 4 9l7 5V4Z" fill="currentColor" stroke="none" /><text x="13.5" y="16" fontSize="8" fill="currentColor" stroke="none" fontWeight="700">15</text></S>
);
export const Fwd15 = (p) => (
  <S {...p}><path d="M13 4l7 5-7 5V4Z" fill="currentColor" stroke="none" /><text x="2.5" y="16" fontSize="8" fill="currentColor" stroke="none" fontWeight="700">15</text></S>
);
export const VolumeIcon = (p) => (
  <S {...p}><path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor" /><path d="M17 8a5 5 0 0 1 0 8" /></S>
);
export const DragIcon = (p) => (
  <S {...p}><circle cx="9" cy="6" r="1" fill="currentColor" /><circle cx="9" cy="12" r="1" fill="currentColor" /><circle cx="9" cy="18" r="1" fill="currentColor" /><circle cx="15" cy="6" r="1" fill="currentColor" /><circle cx="15" cy="12" r="1" fill="currentColor" /><circle cx="15" cy="18" r="1" fill="currentColor" /></S>
);
export const MusicIcon = (p) => (
  <S {...p}><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></S>
);
