import React, { useEffect } from 'react';
import { Tv, Check, Clock, RotateCcw, Play, Sparkles, Edit3, Bookmark, Copy, HardDrive, Star, Film, Sparkle } from 'lucide-react';
import { MediaMetadata, EpisodeMetadata, SambaConfig } from '../../types';

interface EpisodeInspectorProps {
  media: MediaMetadata;
  activeSeasonTab: number;
  setActiveSeasonTab: (s: number) => void;
  selectedEpisode: EpisodeMetadata | null;
  setSelectedEpisodeNumber: (ep: number | null) => void;
  getEpisodeProgress: (ep: number) => any;
  handleUpdateEpisodeWatchProgress: (ep: EpisodeMetadata, mins: number, totalMins: number, done: boolean) => void;
  handleGenerateEpisodeSynopsis: (ep: EpisodeMetadata) => void;
  handleSaveCustomEpisodePlot: (ep: EpisodeMetadata) => void;
  handleTrackEpisodeProgress: (ep: EpisodeMetadata) => void;
  handleCopyEpisodeNfo: (ep: EpisodeMetadata) => void;
  generatingEpNum: number | null;
  editingEpNum: number | null;
  setEditingEpNum: (ep: number | null) => void;
  customEpPlot: string;
  setCustomEpPlot: (plot: string) => void;
  trackedEpNum: number | null;
  copiedEpNfo: boolean;
  onPlayMedia?: (media: MediaMetadata, ep?: EpisodeMetadata) => void;
  sambaConfig: SambaConfig;
}

export const EpisodeInspector: React.FC<EpisodeInspectorProps> = ({
  media,
  activeSeasonTab,
  setActiveSeasonTab,
  selectedEpisode,
  setSelectedEpisodeNumber,
  getEpisodeProgress,
  handleUpdateEpisodeWatchProgress,
  handleGenerateEpisodeSynopsis,
  handleSaveCustomEpisodePlot,
  handleTrackEpisodeProgress,
  handleCopyEpisodeNfo,
  generatingEpNum,
  editingEpNum,
  setEditingEpNum,
  customEpPlot,
  setCustomEpPlot,
  trackedEpNum,
  copiedEpNfo,
  onPlayMedia,
  sambaConfig,
}) => {
  const currentSeason = media.seasons?.find((s) => s.seasonNumber === activeSeasonTab) || media.seasons?.[0];
  const episodeList = currentSeason?.episodes || [];

  // Auto-select first episode of active season if nothing is selected or current selection is not in this season
  useEffect(() => {
    if (episodeList.length > 0) {
      const isCurrentInSeason = selectedEpisode && episodeList.some((e) => e.episodeNumber === selectedEpisode.episodeNumber);
      if (!isCurrentInSeason) {
        setSelectedEpisodeNumber(episodeList[0].episodeNumber);
      }
    }
  }, [activeSeasonTab, episodeList, selectedEpisode, setSelectedEpisodeNumber]);

  const activeEp = selectedEpisode && episodeList.some((e) => e.episodeNumber === selectedEpisode.episodeNumber)
    ? selectedEpisode
    : episodeList[0] || null;

  const prog = activeEp ? getEpisodeProgress(activeEp.episodeNumber) : null;
  const currentPosSec = prog ? prog.playback_position_seconds : 0;
  const totalSec = prog && prog.total_duration_seconds ? prog.total_duration_seconds : 2880;
  const currentMins = Math.round(currentPosSec / 60);
  const totalMins = Math.round(totalSec / 60);
  const percent = prog ? prog.progress_percentage : 0;
  const isDone = prog ? Boolean(prog.is_completed) : false;

  return (
    <div className="space-y-4">
      {/* Seasons and Extras Selector Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 pb-2 border-b border-slate-800">
        {media.seasons?.map((season) => {
          const isExtras = season.seasonNumber === 0 || /extras?|specials?|bonus/i.test(season.name);
          const isSelected = activeSeasonTab === season.seasonNumber;
          return (
            <button
              key={season.seasonNumber}
              type="button"
              onClick={() => {
                setActiveSeasonTab(season.seasonNumber);
                if (season.episodes && season.episodes.length > 0) {
                  setSelectedEpisodeNumber(season.episodes[0].episodeNumber);
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                isSelected
                  ? isExtras
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'bg-indigo-600 text-white shadow-md'
                  : 'bg-slate-850 hover:bg-slate-800 text-slate-300 border border-slate-800'
              }`}
            >
              {isExtras ? <Sparkle className="w-3.5 h-3.5 text-amber-300" /> : <Film className="w-3.5 h-3.5 text-indigo-400" />}
              <span>{isExtras ? (season.name || 'Specials & Extras') : `Season ${season.seasonNumber}`}</span>
              <span className={`px-1.5 py-0.2 text-[10px] rounded-full ${isSelected ? 'bg-black/30 text-white' : 'bg-slate-800 text-slate-400'}`}>
                {season.episodes?.length || season.episodeCount || 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* Two Column Layout: Episode List (Left) + Detailed Inspector (Right) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
        {/* Left Column: Episodes & Extras List */}
        <div className="md:col-span-5 bg-slate-950/60 border border-slate-800 rounded-xl p-2.5 space-y-1.5 max-h-[460px] overflow-y-auto">
          <div className="flex items-center justify-between px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <span>{activeSeasonTab === 0 ? 'Bonus & Extras' : `Season ${activeSeasonTab} Episodes`}</span>
            <span>{episodeList.length} items</span>
          </div>

          {episodeList.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs">
              No items cataloged for this season.
            </div>
          ) : (
            episodeList.map((ep) => {
              const isSelected = activeEp?.episodeNumber === ep.episodeNumber;
              const epProg = getEpisodeProgress(ep.episodeNumber);
              const epCompleted = epProg ? Boolean(epProg.is_completed) : false;

              return (
                <button
                  key={ep.episodeNumber}
                  type="button"
                  onClick={() => setSelectedEpisodeNumber(ep.episodeNumber)}
                  className={`w-full text-left p-2 rounded-lg transition flex items-start gap-2.5 cursor-pointer border ${
                    isSelected
                      ? 'bg-indigo-950/70 border-indigo-500/60 text-white shadow-sm'
                      : 'bg-slate-900/60 hover:bg-slate-850 border-slate-800/80 text-slate-300'
                  }`}
                >
                  <div className={`px-2 py-1 rounded font-mono text-[10px] font-bold shrink-0 mt-0.5 ${
                    isSelected
                      ? 'bg-indigo-600 text-white'
                      : activeSeasonTab === 0
                      ? 'bg-purple-900/60 text-purple-300 border border-purple-700/40'
                      : 'bg-slate-800 text-slate-300'
                  }`}>
                    {activeSeasonTab === 0 ? `X${String(ep.episodeNumber).padStart(2, '0')}` : `E${String(ep.episodeNumber).padStart(2, '0')}`}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold text-xs truncate">{ep.title}</span>
                      {epCompleted && (
                        <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                      {ep.airDate && <span>{ep.airDate}</span>}
                      {ep.rating && <span className="text-amber-400">★ {ep.rating}</span>}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Right Column: Active Episode Inspector & Controls */}
        <div className="md:col-span-7 bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3.5">
          {!activeEp ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500 text-xs">
              <Tv className="w-8 h-8 text-slate-700 mb-2" />
              <span>Select an episode or extra on the left to inspect its synopsis and details.</span>
            </div>
          ) : (
            <>
              {/* Episode Header */}
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded font-mono text-[11px] font-bold border ${
                      activeSeasonTab === 0
                        ? 'bg-purple-900/60 text-purple-300 border-purple-700/50'
                        : 'bg-indigo-900/60 text-indigo-300 border-indigo-700/50'
                    }`}>
                      {activeSeasonTab === 0 ? `Special / Extra #${activeEp.episodeNumber}` : `Season ${activeSeasonTab} • Episode ${activeEp.episodeNumber}`}
                    </span>
                    {activeEp.airDate && (
                      <span className="text-[11px] text-slate-400">
                        Air Date: <strong className="text-slate-200">{activeEp.airDate}</strong>
                      </span>
                    )}
                  </div>
                  <h4 className="text-base font-bold text-white">{activeEp.title}</h4>
                </div>
                {activeEp.rating && (
                  <div className="px-2.5 py-1 rounded-lg bg-amber-950/40 border border-amber-800/40 text-amber-400 font-bold text-xs flex items-center gap-1 shrink-0">
                    <Star className="w-3.5 h-3.5 fill-amber-400" />
                    <span>{activeEp.rating}</span>
                  </div>
                )}
              </div>

              {/* Watch Progress & Tracking */}
              <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                    <Clock className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Watch Progress</span>
                  </div>
                  <span className="font-mono text-[11px] font-bold text-indigo-300">
                    {isDone ? '✓ Completed (100%)' : `${currentMins}m / ${totalMins}m (${percent}%)`}
                  </span>
                </div>
                <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                  <div
                    className={`h-full transition-all duration-300 ${
                      isDone ? 'bg-emerald-500' : 'bg-gradient-to-r from-indigo-500 to-purple-500'
                    }`}
                    style={{ width: `${Math.min(100, isDone ? 100 : percent)}%` }}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-xs">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleUpdateEpisodeWatchProgress(activeEp, Math.max(0, currentMins + 10), totalMins, false)}
                      className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium border border-slate-700 transition cursor-pointer"
                    >
                      +10 min
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateEpisodeWatchProgress(activeEp, Math.round(totalMins / 2), totalMins, false)}
                      className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium border border-slate-700 transition cursor-pointer"
                    >
                      Halfway
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateEpisodeWatchProgress(activeEp, totalMins, totalMins, true)}
                      className="px-2 py-1 rounded-md bg-emerald-600/80 hover:bg-emerald-500 text-white text-[11px] font-bold transition cursor-pointer flex items-center gap-1"
                    >
                      <Check className="w-3 h-3" />
                      <span>Mark Watched</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateEpisodeWatchProgress(activeEp, 0, totalMins, false)}
                      className="p-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition cursor-pointer"
                      title="Reset Progress"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Synopsis Editor */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Synopsis</label>
                {editingEpNum === activeEp.episodeNumber ? (
                  <div className="space-y-2">
                    <textarea
                      rows={4}
                      value={customEpPlot}
                      onChange={(e) => setCustomEpPlot(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white text-xs focus:outline-none focus:border-purple-500"
                    />
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setEditingEpNum(null)} className="px-3 py-1 rounded bg-slate-800 text-slate-400 text-xs">Cancel</button>
                      <button type="button" onClick={() => handleSaveCustomEpisodePlot(activeEp)} className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold">Save</button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 text-slate-200 text-xs leading-relaxed">
                    {activeEp.plot ? (
                      <p className="italic">"{activeEp.plot}"</p>
                    ) : (
                      <div className="text-slate-500 text-center py-2">No synopsis available yet. Click 'AI Synopsis' to enrich.</div>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {onPlayMedia && (
                  <button type="button" onClick={() => onPlayMedia(media, activeEp)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer shadow-sm">
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>Play {activeSeasonTab === 0 ? 'Extra' : 'Episode'}</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={generatingEpNum === activeEp.episodeNumber}
                  onClick={() => handleGenerateEpisodeSynopsis(activeEp)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 text-xs font-medium border border-purple-500/30 cursor-pointer"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${generatingEpNum === activeEp.episodeNumber ? 'animate-spin' : ''}`} />
                  <span>{generatingEpNum === activeEp.episodeNumber ? 'Generating...' : 'AI Synopsis'}</span>
                </button>
                <button type="button" onClick={() => { setEditingEpNum(activeEp.episodeNumber); setCustomEpPlot(activeEp.plot || ''); }} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium border border-slate-700 cursor-pointer">
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
                <button type="button" onClick={() => handleTrackEpisodeProgress(activeEp)} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer border ${trackedEpNum === activeEp.episodeNumber ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-slate-800 hover:bg-slate-750 text-indigo-300 border-slate-700'}`}>
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>{trackedEpNum === activeEp.episodeNumber ? 'Saved!' : 'Save Progress'}</span>
                </button>
                <button type="button" onClick={() => handleCopyEpisodeNfo(activeEp)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium border border-slate-700 cursor-pointer ml-auto">
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedEpNfo ? 'Copied NFO!' : 'Copy NFO'}</span>
                </button>
              </div>
              
              {/* Samba File Location */}
              <div className="p-2.5 bg-slate-900/60 border border-slate-800 rounded-lg text-[11px] font-mono text-slate-400 flex items-center gap-2">
                <HardDrive className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="truncate">
                  {media.title} {activeSeasonTab === 0 ? `[Extras - ${activeEp.title}]` : `S${String(activeSeasonTab).padStart(2, '0')}E${String(activeEp.episodeNumber).padStart(2, '0')}`}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
