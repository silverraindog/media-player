import React from 'react';
import { Music, Play } from 'lucide-react';
import { MediaMetadata, TrackMetadata } from '../../types';

interface TrackListProps {
  media: MediaMetadata;
  onPlayMedia?: (media: MediaMetadata, ep?: any, track?: TrackMetadata) => void;
}

export const TrackList: React.FC<TrackListProps> = ({ media, onPlayMedia }) => {
  if (media.type !== 'album' || !media.tracks) return null;

  return (
    <div className="space-y-3 pt-2 border-t border-slate-800">
      <h3 className="text-sm font-bold text-white flex items-center gap-2">
        <Music className="w-4 h-4 text-emerald-400" />
        <span>Tracklist ({media.tracks.length} Tracks)</span>
      </h3>

      <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
        {media.tracks.map((t) => (
          <div
            key={t.trackNumber}
            className="flex items-center justify-between p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs"
          >
            <div className="flex items-center gap-3">
              <span className="w-5 text-center font-mono text-slate-500 font-bold">
                {String(t.trackNumber).padStart(2, '0')}
              </span>
              <span className="text-white font-medium">{t.title}</span>
              {t.artist && <span className="text-slate-400 text-[11px] truncate">({t.artist})</span>}
            </div>

            <div className="flex items-center gap-2">
              {onPlayMedia && (
                <button
                  onClick={() => onPlayMedia(media, undefined, t)}
                  className="p-1 rounded bg-emerald-600/80 hover:bg-emerald-500 text-white transition cursor-pointer"
                  title="Play this track"
                >
                  <Play className="w-3 h-3 fill-white" />
                </button>
              )}
              <span className="font-mono text-slate-400">{t.duration}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
