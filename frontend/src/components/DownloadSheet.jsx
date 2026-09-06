import { usePlayer } from '../context/PlayerContext.jsx';
import { DownloadIcon, DownloadedIcon, VideoIcon } from './Icons.jsx';

/**
 * Bottom-sheet choice between downloading a track as audio (small, for
 * listening) or video (bigger, for watching offline - e.g. on the subway).
 * Reuses TagSheet's visual pattern.
 */
export default function DownloadSheet({ track, onClose }) {
  const {
    download, isDownloaded, downloading,
    downloadVideo, isVideoDownloaded, downloadingVideo,
  } = usePlayer();

  const audioDone = isDownloaded(track.id);
  const audioBusy = !!downloading[track.id];
  const videoDone = isVideoDownloaded(track.id);
  const videoBusy = !!downloadingVideo[track.id];

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-surface rounded-t-3xl p-5 pb-8 safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto w-10 h-1 rounded-full bg-surface2 mb-4" />
        <p className="truncate text-[15px] font-semibold">{track.title}</p>
        <p className="truncate text-[13px] text-muted mb-4">{track.artist}</p>

        <button
          onClick={() => { if (!audioDone && !audioBusy) download(track); onClose(); }}
          disabled={audioDone || audioBusy}
          className="w-full flex items-center gap-3 rounded-xl bg-surface2 px-4 py-3 mb-2 active:scale-[0.99] transition disabled:opacity-70"
        >
          {audioDone ? <DownloadedIcon size={22} className="text-accent shrink-0" /> : <DownloadIcon size={22} className="shrink-0" />}
          <div className="text-left flex-1 min-w-0">
            <p className="text-[15px]">{audioDone ? 'Downloaded' : audioBusy ? 'Downloading…' : 'Download audio'}</p>
            <p className="text-[12px] text-muted">Listen offline · small file</p>
          </div>
        </button>

        <button
          onClick={() => { if (!videoDone && !videoBusy) downloadVideo(track); onClose(); }}
          disabled={videoDone || videoBusy}
          className="w-full flex items-center gap-3 rounded-xl bg-surface2 px-4 py-3 active:scale-[0.99] transition disabled:opacity-70"
        >
          {videoDone ? <DownloadedIcon size={22} className="text-accent shrink-0" /> : <VideoIcon size={22} className="shrink-0" />}
          <div className="text-left flex-1 min-w-0">
            <p className="text-[15px]">{videoDone ? 'Video downloaded' : videoBusy ? 'Downloading video…' : 'Download video'}</p>
            <p className="text-[12px] text-muted">Watch offline · larger file, up to 1080p</p>
          </div>
        </button>
      </div>
    </div>
  );
}
