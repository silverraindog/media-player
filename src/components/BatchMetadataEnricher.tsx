import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Zap, 
  Image as ImageIcon, 
  FileText,
  Loader2,
  PlayCircle
} from 'lucide-react';
import { MediaMetadata } from '../types';

interface BatchMetadataEnricherProps {
  mediaLibrary: MediaMetadata[];
  onUpdateMedia: (updatedItems: MediaMetadata[]) => void;
  showToast: (msg: string) => void;
}

export const BatchMetadataEnricher: React.FC<BatchMetadataEnricherProps> = ({
  mediaLibrary,
  onUpdateMedia,
  showToast
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>('');
  const [results, setResults] = useState<{ enriched: number; failed: number }>({ enriched: 0, failed: 0 });
  const [repairMode, setRepairMode] = useState<'standard' | 'high-res'>('standard');

  const missingMetadataItems = mediaLibrary.filter(item => {
    const hasMissingPoster = !item.posterUrl || item.posterUrl.includes('unsplash.com') || item.posterUrl.includes('images.unsplash.com');
    const hasMissingSynopsis = !item.overview || item.overview.length < 50;
    return hasMissingPoster || hasMissingSynopsis;
  });

  const lowResItems = mediaLibrary.filter(item => {
    return !item.posterUrl || item.posterUrl.includes('unsplash.com') || item.posterUrl.includes('images.unsplash.com');
  });

  const activeItemsToProcess = repairMode === 'high-res' ? lowResItems : missingMetadataItems;

  const runBatchEnrich = async () => {
    if (activeItemsToProcess.length === 0) {
      showToast(repairMode === 'high-res' ? "No low-resolution posters detected!" : "Library is already fully enriched!");
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setResults({ enriched: 0, failed: 0 });
    setStatus(`Preparing to ${repairMode === 'high-res' ? 'recover high-res posters' : 'enrich'} ${activeItemsToProcess.length} items...`);

    const itemsToProcess = activeItemsToProcess.map(item => ({
      id: item.id,
      title: item.title,
      type: item.mediaType,
      year: item.year,
      hasPoster: !( !item.posterUrl || item.posterUrl.includes('unsplash.com') || item.posterUrl.includes('images.unsplash.com') ),
      hasSynopsis: !!(item.overview && item.overview.length > 50),
      forcePosterRepair: repairMode === 'high-res'
    }));

    try {
      // 1. Fetch enriched data from server (OMDb + AI flagging)
      const res = await fetch('/api/metadata/batch-enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToProcess })
      });
      
      const data = await res.json();
      if (!data.success) throw new Error("Batch enrichment server error");

      const serverResults = data.results;
      const updatedMediaLibrary = [...mediaLibrary];
      let enrichedCount = 0;

      // 2. Process results and trigger AI if needed
      for (let i = 0; i < serverResults.length; i++) {
        const result = serverResults[i];
        const mediaIndex = updatedMediaLibrary.findIndex(m => m.id === result.id);
        if (mediaIndex === -1) continue;

        let currentMedia = { ...updatedMediaLibrary[mediaIndex] };
        setStatus(`Enriching "${currentMedia.title}"...`);

        // Apply OMDb results
        if (result.overview) currentMedia.overview = result.overview;
        if (result.posterUrl) {
          currentMedia.posterUrl = result.posterUrl;
          currentMedia.fanartUrl = result.posterUrl;
        }
        if (result.rating) currentMedia.rating = result.rating;
        if (result.genres) currentMedia.genres = result.genres;
        if (result.cast) currentMedia.cast = result.cast;

        // Trigger AI Synopsis if flagged
        if (result.triggerAiSynopsis) {
          try {
            const aiRes = await fetch('/api/metadata/generate-synopsis', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: currentMedia.title, type: currentMedia.mediaType })
            });
            const aiData = await aiRes.json();
            if (aiData.success && aiData.data?.overview) {
              currentMedia.overview = aiData.data.overview;
            }
          } catch (err) { console.warn("AI Synopsis batch fail:", err); }
        }

        // Trigger AI Fanart if flagged
        if (result.triggerAiFanart) {
          try {
            const fanartRes = await fetch('/api/media/generate-fanart', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                title: currentMedia.title, 
                synopsis: currentMedia.overview,
                mediaPath: currentMedia.recommendedFolderStructure 
              })
            });
            const fanartData = await fanartRes.json();
            if (fanartData.success && fanartData.fanartUrl) {
              currentMedia.fanartUrl = fanartData.fanartUrl;
              currentMedia.posterUrl = fanartData.fanartUrl;
            }
          } catch (err) { console.warn("AI Fanart batch fail:", err); }
        }

        updatedMediaLibrary[mediaIndex] = currentMedia;
        enrichedCount++;
        setResults(prev => ({ ...prev, enriched: enrichedCount }));
        setProgress(Math.round(((i + 1) / serverResults.length) * 100));
      }

      onUpdateMedia(updatedMediaLibrary);
      showToast(`Batch repair complete! ${enrichedCount} items updated.`);
      setStatus('All selected items processed successfully.');
    } catch (err) {
      console.error("Batch repair error:", err);
      showToast("Batch repair encountered an error.");
      setStatus('Processing halted due to error.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Smart Library Repair Tool</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <button 
                onClick={() => setRepairMode('standard')}
                className={`text-[10px] px-2 py-0.5 rounded ${repairMode === 'standard' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-500 hover:text-slate-400'}`}
              >
                Standard Enrich
              </button>
              <button 
                onClick={() => setRepairMode('high-res')}
                className={`text-[10px] px-2 py-0.5 rounded flex items-center gap-1 ${repairMode === 'high-res' ? 'bg-amber-600 text-white font-bold shadow-lg shadow-amber-900/40' : 'text-slate-500 hover:text-slate-400'}`}
              >
                <ImageIcon className="w-2.5 h-2.5" />
                Poster Recovery
              </button>
            </div>
          </div>
        </div>
        <button
          onClick={runBatchEnrich}
          disabled={isProcessing || activeItemsToProcess.length === 0}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-lg ${
            isProcessing 
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
              : activeItemsToProcess.length === 0
              ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 cursor-default'
              : repairMode === 'high-res'
              ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/20 active:scale-95'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20 active:scale-95'
          }`}
        >
          {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
          <span>
            {isProcessing 
              ? 'Processing Library...' 
              : activeItemsToProcess.length === 0 
                ? 'Library Healthy' 
                : repairMode === 'high-res' 
                  ? `Recover ${activeItemsToProcess.length} Posters` 
                  : `Repair ${activeItemsToProcess.length} Items`
            }
          </span>
        </button>
      </div>

      {missingMetadataItems.length > 0 && !isProcessing && (
        <div className="flex items-center gap-4 text-[10px] bg-slate-950/50 border border-slate-800 p-3 rounded-xl">
          <div className="flex items-center gap-1.5 text-amber-400">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Detected <strong>{missingMetadataItems.length}</strong> items needing metadata attention.</span>
          </div>
          <div className="flex items-center gap-3 text-slate-500 border-l border-slate-800 pl-4">
            <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> Synopsis Fix</span>
            <span className="flex items-center gap-1"><ImageIcon className="w-3 h-3" /> Fanart Gen</span>
          </div>
        </div>
      )}

      {isProcessing && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-300 flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
              {status}
            </span>
            <span className="font-mono text-emerald-400">{progress}%</span>
          </div>
          <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800 relative">
            <div 
              className="bg-gradient-to-r from-indigo-500 to-emerald-500 h-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center gap-4 text-[10px] text-slate-500 font-mono">
            <span>Enriched: <span className="text-emerald-400">{results.enriched}</span></span>
            <span>Errors: <span className="text-rose-400">{results.failed}</span></span>
          </div>
        </div>
      )}

      {!isProcessing && results.enriched > 0 && (
        <div className="flex items-center gap-2 text-[11px] text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 p-2.5 rounded-xl">
          <CheckCircle2 className="w-4 h-4" />
          <span>Last run successfully enriched <strong>{results.enriched}</strong> items with high-fidelity metadata.</span>
        </div>
      )}
    </div>
  );
};
