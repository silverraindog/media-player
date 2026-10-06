import React from 'react';
import { Copy, Database, FileCode2, Check, FolderPlus, Download, Image as ImageIcon } from 'lucide-react';
import { MediaMetadata } from '../../types';
import { downloadMediaArtwork } from '../../utils/zipDownloader';

interface MediaDetailFooterProps {
  media: MediaMetadata;
  handleCopyNfo: () => void;
  copiedNfo: boolean;
  handleSaveToSqlite: () => void;
  isSavedSqlite: boolean;
  onOpenInNfoStudio: (media: MediaMetadata) => void;
  onClose: () => void;
  handlePush: () => void;
  isPushed: boolean;
  downloadMediaBundleZip: (media: MediaMetadata) => void;
}

export const MediaDetailFooter: React.FC<MediaDetailFooterProps> = ({
  media,
  handleCopyNfo,
  copiedNfo,
  handleSaveToSqlite,
  isSavedSqlite,
  onOpenInNfoStudio,
  onClose,
  handlePush,
  isPushed,
  downloadMediaBundleZip,
}) => {
  return (
    <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
      <div className="flex items-center gap-2">
        <button
          id="modal-btn-copy-nfo"
          onClick={handleCopyNfo}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer"
        >
          {copiedNfo ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied NFO</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy XML NFO</span>
            </>
          )}
        </button>

        <button
          id="modal-btn-sqlite"
          onClick={handleSaveToSqlite}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
            isSavedSqlite
              ? 'bg-emerald-600 border-emerald-500 text-white'
              : 'bg-slate-800 hover:bg-slate-700 text-emerald-300 border-slate-700'
          }`}
          title="Persist title, synopsis, and metadata into SQLite database"
        >
          {isSavedSqlite ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Saved to SQLite!</span>
            </>
          ) : (
            <>
              <Database className="w-3.5 h-3.5" />
              <span>Save to SQLite DB</span>
            </>
          )}
        </button>

        <button
          id="modal-btn-studio"
          onClick={() => {
            onOpenInNfoStudio(media);
            onClose();
          }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-purple-300 text-xs font-semibold border border-slate-700 transition cursor-pointer"
        >
          <FileCode2 className="w-3.5 h-3.5" />
          <span>Edit in Studio</span>
        </button>
      </div>

      <div className="flex items-center gap-2">
        {media.posterUrl && (
          <button
            id="modal-btn-download-art"
            type="button"
            onClick={() => {
              const filename = `${media.title.replace(/[/\\?%*:|"<>]/g, '_')}-${media.type === 'album' ? 'folder' : 'poster'}.jpg`;
              downloadMediaArtwork(media.posterUrl, filename);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 text-xs font-semibold border border-indigo-900/50 transition cursor-pointer"
            title="Download high-resolution poster artwork file directly"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Download Art (.jpg)</span>
          </button>
        )}

        <button
          id="modal-btn-push-samba"
          onClick={handlePush}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
            isPushed
              ? 'bg-emerald-600 text-white'
              : 'bg-emerald-700 hover:bg-emerald-600 text-white shadow-md shadow-emerald-700/20'
          }`}
        >
          {isPushed ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Pushed to Samba!</span>
            </>
          ) : (
            <>
              <FolderPlus className="w-3.5 h-3.5" />
              <span>Push to Samba Share</span>
            </>
          )}
        </button>

        <button
          id="modal-btn-download-bundle"
          onClick={() => downloadMediaBundleZip(media)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow-md shadow-indigo-600/20 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Download Bundle (ZIP)</span>
        </button>
      </div>
    </div>
  );
};
