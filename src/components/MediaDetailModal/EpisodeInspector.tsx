import React from 'react';
import { Tv, Check, Clock, RotateCcw, Play, Sparkles, Edit3, Bookmark, Copy, HardDrive } from 'lucide-react';
import { MediaMetadata, EpisodeMetadata, SambaConfig } from '../../types';

interface EpisodeInspectorProps {
  media: MediaMetadata;
  activeSeasonTab: number;
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
  if (!selectedEpisode) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500 text-xs">
        <Tv className="w-8 h-8 text-slate-700 mb-2" />
        <span>Select an episode on the left to inspect its synopsis and details.</span>
      </div>
    );
  }

  const prog = getEpisodeProgress(selectedEpisode.episodeNumber);
  const currentPosSec = prog ? prog.playback_position_seconds : 0;
  const totalSec = prog && prog.total_duration_seconds ? prog.total_duration_seconds : 2880;
  const currentMins = Math.round(currentPosSec / 60);
  const totalMins = Math.round(totalSec / 60);
  const percent = prog ? prog.progress_percentage : 0;
  const isDone = prog ? Boolean(prog.is_completed) : false;

  return (
    <div className="space-y-3">
      {/* Episode Title & Metadata Header */}
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded bg-purple-900/60 text-purple-300 font-mono text-[11px] font-bold border border-purple-700/50">
              Season {activeSeasonTab} • Episode {selectedEpisode.episodeNumber}
            </span>
            {selectedEpisode.airDate && (
              <span className="text-[11px] text-slate-400">
                Air Date: <strong className="text-slate-200">{selectedEpisode.airDate}</strong>
              </span>
            )}
          </div>
          <h4 className="text-base font-bold text-white">{selectedEpisode.title}</h4>
        </div>
        {selectedEpisode.rating && (
          <div className="px-2.5 py-1 rounded-lg bg-amber-950/40 border border-amber-800/40 text-amber-400 font-bold text-xs flex items-center gap-1 shrink-0">
            <span>★ {selectedEpisode.rating}</span>
          </div>
        )}
      </div>

      {/* Watch Progress & Tracking */}
      <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-slate-200">
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
            <span>Episode Watch Tracking</span>
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
              onClick={() => handleUpdateEpisodeWatchProgress(selectedEpisode, Math.max(0, currentMins + 10), totalMins, false)}
              className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium border border-slate-700 transition cursor-pointer"
            >
              +10 min
            </button>
            <button
              type="button"
              onClick={() => handleUpdateEpisodeWatchProgress(selectedEpisode, Math.round(totalMins / 2), totalMins, false)}
              className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium border border-slate-700 transition cursor-pointer"
            >
              Halfway
            </button>
            <button
              type="button"
              onClick={() => handleUpdateEpisodeWatchProgress(selectedEpisode, totalMins, totalMins, true)}
              className="px-2 py-1 rounded-md bg-emerald-600/80 hover:bg-emerald-500 text-white text-[11px] font-bold transition cursor-pointer flex items-center gap-1"
            >
              <Check className="w-3 h-3" />
              <span>Mark Watched</span>
            </button>
            <button
              type="button"
              onClick={() => handleUpdateEpisodeWatchProgress(selectedEpisode, 0, totalMins, false)}
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
        {editingEpNum === selectedEpisode.episodeNumber ? (
          <div className="space-y-2">
            <textarea
              rows={4}
              value={customEpPlot}
              onChange={(e) => setCustomEpPlot(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white text-xs focus:outline-none focus:border-purple-500"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditingEpNum(null)} className="px-3 py-1 rounded bg-slate-800 text-slate-400 text-xs">Cancel</button>
              <button type="button" onClick={() => handleSaveCustomEpisodePlot(selectedEpisode)} className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold">Save</button>
            </div>
          </div>
        ) : (
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 text-slate-200 text-xs leading-relaxed">
            {selectedEpisode.plot ? (
              <p className="italic">"{selectedEpisode.plot}"</p>
            ) : (
              <div className="text-slate-500 text-center">No synopsis yet.</div>
            )}
          </div>
        )}
      </div>

      {/* Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {onPlayMedia && (
          <button type="button" onClick={() => onPlayMedia(media, selectedEpisode)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer">
            <Play className="w-3.5 h-3.5 fill-white" />
            <span>Play</span>
          </button>
        )}
        <button type="button" onClick={() => handleGenerateEpisodeSynopsis(selectedEpisode)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-purple-600/20 text-purple-300 text-xs font-medium border border-purple-500/30 cursor-pointer">
          <Sparkles className="w-3.5 h-3.5" />
          <span>AI Synopsis</span>
        </button>
        <button type="button" onClick={() => { setEditingEpNum(selectedEpisode.episodeNumber); setCustomEpPlot(selectedEpisode.plot || ''); }} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium border border-slate-700 cursor-pointer">
          <Edit3 className="w-3.5 h-3.5" />
          <span>Edit</span>
        </button>
        <button type="button" onClick={() => handleTrackEpisodeProgress(selectedEpisode)} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${trackedEpNum === selectedEpisode.episodeNumber ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-indigo-300'}`}>
          <Bookmark className="w-3.5 h-3.5" />
          <span>{trackedEpNum === selectedEpisode.episodeNumber ? 'Saved!' : 'Left Off'}</span>
        </button>
      </div>
      
      {/* Meta */}
      <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg text-[11px] font-mono text-slate-400">
        File: {media.title} - S{String(activeSeasonTab).padStart(2, '0')}E{String(selectedEpisode.episodeNumber).padStart(2, '0')}.mkv
      </div>
    </div>
  );
};
