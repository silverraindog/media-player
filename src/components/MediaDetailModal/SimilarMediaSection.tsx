import React from 'react';
import { Sparkles, ChevronRight, Star } from 'lucide-react';
import { MediaMetadata } from '../../types';

interface SimilarMediaSectionProps {
  media: MediaMetadata;
  mediaLibrary?: MediaMetadata[];
  setMedia: (media: MediaMetadata) => void;
  setActiveSeasonTab: (season: number) => void;
  setSelectedEpisodeNumber: (ep: number | null) => void;
  onSelectMedia?: (media: MediaMetadata) => void;
}

export const SimilarMediaSection: React.FC<SimilarMediaSectionProps> = ({
  media,
  mediaLibrary,
  setMedia,
  setActiveSeasonTab,
  setSelectedEpisodeNumber,
  onSelectMedia,
}) => {
  if (!mediaLibrary || mediaLibrary.length === 0) return null;

  // Calculate similar media based on shared genres and studio tags
  const currentGenres = new Set((media.genres || []).map(g => g.toLowerCase().trim()));
  const currentStudio = media.studio ? media.studio.toLowerCase().trim() : '';

  const scored = mediaLibrary
    .filter((m) => m.id !== media.id)
    .map((m) => {
      let score = 0;
      const mGenres = (m.genres || []).map(g => g.toLowerCase().trim());
      const sharedGenres = mGenres.filter(g => currentGenres.has(g));
      score += sharedGenres.length * 3;

      if (currentStudio && m.studio && m.studio.toLowerCase().trim() === currentStudio) {
        score += 5;
      }

      if (m.type === media.type) {
        score += 2;
      }

      return { item: m, score, sharedGenres };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  if (scored.length === 0) return null;

  return (
    <div className="space-y-3 bg-slate-950/80 border border-indigo-500/30 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <span>Similar Media & Studio Recommendations ({scored.length})</span>
        </h3>
        <span className="text-[10px] text-slate-400">Matched by shared genres & studio tags</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {scored.map(({ item, sharedGenres }) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setMedia(item);
              if (item.seasons?.[0]) {
                setActiveSeasonTab(item.seasons[0].seasonNumber);
                if (item.seasons[0].episodes?.[0]) {
                  setSelectedEpisodeNumber(item.seasons[0].episodes[0].episodeNumber);
                }
              }
              if (onSelectMedia) onSelectMedia(item);
            }}
            className="group flex items-center gap-3 p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-850 transition text-left cursor-pointer shadow-sm"
          >
            <div className="w-12 h-16 rounded-lg overflow-hidden bg-slate-950 shrink-0 border border-slate-700">
              <img src={item.posterUrl} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <h4 className="text-xs font-bold text-white group-hover:text-indigo-300 transition truncate">
                {item.title}
              </h4>
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <span>{item.year}</span>
                <span className="flex items-center gap-0.5 text-amber-300">
                  <Star className="w-3 h-3 fill-amber-300" /> {item.rating.toFixed(1)}
                </span>
                {item.studio && <span className="truncate max-w-[90px]">{item.studio}</span>}
              </div>
              {sharedGenres.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {sharedGenres.slice(0, 2).map((g, i) => (
                    <span key={i} className="px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 text-[9px]">
                      {g}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-indigo-300 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
};
