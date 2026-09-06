import { useState } from 'react';
import { usePlayer } from '../context/PlayerContext.jsx';
import { fmtTime } from '../lib/format.js';
import {
  PlusIcon, CheckIcon, DownloadIcon, DownloadedIcon, TrashIcon, TagIcon,
} from './Icons.jsx';
import TagSheet from './TagSheet.jsx';
import DownloadSheet from './DownloadSheet.jsx';

/**
 * A single track row. `actions` chooses which buttons appear:
 *   'search'       -> add-to-queue + download (audio or video, via a sheet)
 *   'library'      -> remove (audio) download
 *   'library-video'-> remove video download; tapping opens the video player
 *   'queue'        -> handled separately in Queue page
 * `onOpen` overrides what tapping the row does (defaults to playing it as
 * audio); library-video rows pass openVideo instead.
 */
export default function SongRow({ track, actions = 'search', trailing, onOpen }) {
  const {
    current, isPlaying, playTrack, preload,
    addToQueue, queue, downloading, isDownloaded, removeDownload,
    isVideoDownloaded, downloadingVideo, removeVideoDownload, openChannel,
  } = usePlayer();

  const active = current?.id === track.id;
  const inQueue = queue.some((t) => t.id === track.id);
  const downloaded = isDownloaded(track.id) || isVideoDownloaded(track.id);
  const isDownloading = !!downloading[track.id] || !!downloadingVideo[track.id];
  const [tagOpen, setTagOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);

  return (
    <>
    <div
      className={`group flex items-center gap-3 px-4 py-2.5 active:bg-surface2 transition-colors ${
        active ? 'bg-surface2' : ''
      }`}
      onPointerDown={() => actions !== 'library-video' && preload(track)} // preload audio on tap to avoid lag
      onClick={() => (onOpen ? onOpen(track) : playTrack(track))}
      role="button"
    >
      <div className="relative shrink-0">
        <img
          src={track.thumbnail}
          alt=""
          loading="lazy"
          className="w-12 h-12 rounded-lg object-cover bg-surface2"
        />
        {active && isPlaying && (
          <span className="absolute inset-0 grid place-items-center rounded-lg bg-black/40">
            <Equalizer />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className={`truncate text-[15px] ${active ? 'text-accent' : 'text-white'}`}>
          {track.title}
        </p>
        {track.channelUrl ? (
          <p
            onClick={(e) => { e.stopPropagation(); openChannel(track); }}
            className="truncate text-[13px] text-muted active:text-white active:underline w-fit"
          >
            {track.artist}
          </p>
        ) : (
          <p className="truncate text-[13px] text-muted">{track.artist}</p>
        )}
      </div>

      <span className="text-[12px] text-muted tabular-nums shrink-0">
        {track.duration ? fmtTime(track.duration) : ''}
      </span>

      {trailing}

      {actions === 'search' && (
        <div className="flex items-center gap-1 shrink-0">
          <IconBtn
            onClick={(e) => { e.stopPropagation(); setTagOpen(true); }}
            title="Tag"
          >
            <TagIcon size={20} className={downloaded ? 'text-accent' : ''} />
          </IconBtn>
          <IconBtn
            onClick={(e) => { e.stopPropagation(); addToQueue(track); }}
            title={inQueue ? 'In queue' : 'Add to queue'}
          >
            {inQueue ? <CheckIcon size={20} className="text-accent" /> : <PlusIcon size={20} />}
          </IconBtn>
          <IconBtn
            onClick={(e) => { e.stopPropagation(); setDownloadOpen(true); }}
            title={downloaded ? 'Downloaded' : 'Download for offline'}
          >
            {downloaded ? (
              <DownloadedIcon size={20} className="text-accent" />
            ) : isDownloading ? (
              <Spinner />
            ) : (
              <DownloadIcon size={20} />
            )}
          </IconBtn>
        </div>
      )}

      {actions === 'library' && (
        <div className="flex items-center gap-1 shrink-0">
          <IconBtn
            onClick={(e) => { e.stopPropagation(); setTagOpen(true); }}
            title="Tag"
          >
            <TagIcon size={20} className={track.tags?.length ? 'text-accent' : ''} />
          </IconBtn>
          <IconBtn
            onClick={(e) => { e.stopPropagation(); addToQueue(track); }}
            title={inQueue ? 'In queue' : 'Add to queue'}
          >
            {inQueue ? <CheckIcon size={20} className="text-accent" /> : <PlusIcon size={20} />}
          </IconBtn>
          <IconBtn
            onClick={(e) => { e.stopPropagation(); removeDownload(track.id); }}
            title="Remove download"
          >
            <TrashIcon size={20} />
          </IconBtn>
        </div>
      )}

      {actions === 'library-video' && (
        <div className="flex items-center gap-1 shrink-0">
          <IconBtn
            onClick={(e) => { e.stopPropagation(); removeVideoDownload(track.id); }}
            title="Remove video"
          >
            <TrashIcon size={20} />
          </IconBtn>
        </div>
      )}
    </div>
    {tagOpen && <TagSheet track={track} onClose={() => setTagOpen(false)} />}
    {downloadOpen && <DownloadSheet track={track} onClose={() => setDownloadOpen(false)} />}
    </>
  );
}

function IconBtn({ children, ...p }) {
  return (
    <button
      {...p}
      className="grid place-items-center w-9 h-9 rounded-full text-muted hover:text-white disabled:opacity-100 active:scale-90 transition"
    >
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <span className="w-4 h-4 rounded-full border-2 border-muted border-t-accent animate-spin" />
  );
}

function Equalizer() {
  return (
    <span className="flex items-end gap-[2px] h-4">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-[3px] bg-accent rounded-full"
          style={{
            height: '100%',
            animation: `eq 0.8s ${i * 0.15}s ease-in-out infinite alternate`,
          }}
        />
      ))}
      <style>{`@keyframes eq{from{height:25%}to{height:100%}}`}</style>
    </span>
  );
}
