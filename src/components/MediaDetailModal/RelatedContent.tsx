import React from 'react';
import { Layers, ChevronRight } from 'lucide-react';
import { MediaMetadata, EpisodeMetadata, TrackMetadata } from '../../types';

interface RelatedContentProps {
  media: MediaMetadata;
  mediaLibrary?: MediaMetadata[];
  setMedia: (media: MediaMetadata) => void;
  setActiveSeasonTab: (season: number) => void;
  setSelectedEpisodeNumber: (ep: number | null) => void;
  onSelectMedia?: (media: MediaMetadata) => void;
}

export const RelatedContent: React.FC<RelatedContentProps> = ({
  media,
  mediaLibrary,
  setMedia,
  setActiveSeasonTab,
  setSelectedEpisodeNumber,
  onSelectMedia,
}) => {
  if (media.type !== 'series' || !mediaLibrary) return null;

  const cleanCurrent = media.title.toLowerCase().replace(/season\s*\d+/gi, '').replace(/:\s*.*/g, '').trim();
  const primaryWord = cleanCurrent.split(' ')[0] || '';
  const related = mediaLibrary.filter((m) => {
    if (m.id === media.id || m.type !== 'series') return false;
    const cleanOther = m.title.toLowerCase().replace(/season\s*\d+/gi, '').replace(/:\s*.*/g, '').trim();
    return primaryWord.length > 3 && (cleanOther.includes(primaryWord) || cleanCurrent.includes(cleanOther.split(' ')[0]));
  });

  if (related.length === 0) return null;

  return (
    <div className="space-y-3 bg-slate-950/80 border border-purple-500/30 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
          <Layers className="w-4 h-4 text-purple-400" />
          <span>Related Series, Spin-Offs & Sequels ({related.length})</span>
        </h3>
        <span className="text-[10px] text-slate-400">Choose alternative franchise or spin-off series</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {related.map((rel) => (
          <button
            key={rel.id}
            type="button"
            onClick={() => {
              setMedia(rel);
              setActiveSeasonTab(rel.seasons?.[0]?.seasonNumber || 1);
              if (rel.seasons?.[0]?.episodes?.[0]) {
                setSelectedEpisodeNumber(rel.seasons[0].episodes[0].episodeNumber);
              }
              if (onSelectMedia) onSelectMedia(rel);
            }}
            className="group flex items-center gap-3 p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-purple-500/50 hover:bg-slate-850 transition text-left cursor-pointer shadow-sm"
          >
            <div className="w-12 h-16 rounded-lg overflow-hidden bg-slate-950 shrink-0 border border-slate-700">
              <img src={rel.posterUrl} alt={rel.title} className="w-full h-full object-cover group-hover:scale-105 transition" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <h4 className="text-xs font-bold text-white group-hover:text-purple-300 transition truncate">
                {rel.title}
              </h4>
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <span>{rel.year}</span>
                <span>★ {rel.rating.toFixed(1)}</span>
                <span className="text-purple-400 font-semibold">{rel.seasons?.length || 1} Seasons</span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-purple-300 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
};
