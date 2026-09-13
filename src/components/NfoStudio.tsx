import React, { useState, useEffect } from 'react';
import {
  FileCode2,
  Copy,
  Download,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Film,
  Tv,
  Music,
  FolderPlus,
  RefreshCw,
  Eye,
  Sliders,
} from 'lucide-react';
import { MediaMetadata, SambaConfig } from '../types';
import { generateMetadataFile } from '../utils/nfoGenerator';
import { downloadTextFile } from '../utils/zipDownloader';
import { CURATED_MEDIA_DATABASE } from '../data/curatedMedia';

interface NfoStudioProps {
  initialMedia?: MediaMetadata | null;
  sambaConfig: SambaConfig;
  onPushNfoToSamba: (media: MediaMetadata, xmlContent: string) => void;
}

export const NfoStudio: React.FC<NfoStudioProps> = ({
  initialMedia,
  sambaConfig,
  onPushNfoToSamba,
}) => {
  const [selectedMedia, setSelectedMedia] = useState<MediaMetadata>(
    initialMedia || CURATED_MEDIA_DATABASE[0]
  );
  const [xmlCode, setXmlCode] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [activeMode, setActiveMode] = useState<'xml' | 'editor'>('xml');
  const [xmlValidation, setXmlValidation] = useState<{ isValid: boolean; error?: string }>({
    isValid: true,
  });

  useEffect(() => {
    if (initialMedia) {
      setSelectedMedia(initialMedia);
    }
  }, [initialMedia]);

  useEffect(() => {
    const generated = generateMetadataFile(selectedMedia);
    setXmlCode(generated);
    validateXml(generated);
  }, [selectedMedia]);

  const validateXml = (xml: string) => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, 'text/xml');
      const parserError = doc.querySelector('parsererror');
      if (parserError) {
        setXmlValidation({
          isValid: false,
          error: parserError.textContent || 'Syntax error in XML markup',
        });
      } else {
        setXmlValidation({ isValid: true });
      }
    } catch (err: any) {
      setXmlValidation({ isValid: false, error: err.message });
    }
  };

  const handleXmlChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setXmlCode(val);
    validateXml(val);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(xmlCode);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleDownload = () => {
    const filename =
      selectedMedia.type === 'movie'
        ? `${selectedMedia.title} (${selectedMedia.year}).nfo`
        : selectedMedia.type === 'series'
        ? 'tvshow.nfo'
        : 'album.nfo';
    downloadTextFile(filename, xmlCode);
  };

  const handleSelectPreset = (id: string) => {
    const found = CURATED_MEDIA_DATABASE.find((m) => m.id === id);
    if (found) setSelectedMedia(found);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-purple-950/40 to-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-medium mb-3">
          <FileCode2 className="w-3.5 h-3.5 text-purple-400" />
          <span>Kodi / Jellyfin / Plex XML NFO Studio</span>
        </div>
        <h2 className="text-2xl font-bold text-white tracking-tight">
          Live NFO Metadata Generator & Validator
        </h2>
        <p className="mt-2 text-sm text-slate-300 leading-relaxed max-w-3xl">
          Preview, customize, and validate XML <code className="text-purple-300 bg-purple-950/60 px-1 py-0.5 rounded">.nfo</code> metadata files. Compatible with standard media servers (Plex, Kodi, Jellyfin, Emby) and music players.
        </p>
      </div>

      {/* Main Studio Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Preset Selector & Tag Inspector */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-purple-400" />
              <span>Target Media Profile</span>
            </h3>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                selectedMedia.type === 'series'
                  ? 'bg-purple-900/40 text-purple-300'
                  : selectedMedia.type === 'movie'
                  ? 'bg-cyan-900/40 text-cyan-300'
                  : 'bg-emerald-900/40 text-emerald-300'
              }`}
            >
              {selectedMedia.type}
            </span>
          </div>

          {/* Quick Preset Selector */}
          <div>
            <label className="block text-xs text-slate-400 font-medium mb-1.5">
              Select Sample Media:
            </label>
            <select
              id="nfo-preset-select"
              value={selectedMedia.id}
              onChange={(e) => handleSelectPreset(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
            >
              {CURATED_MEDIA_DATABASE.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.type === 'series' ? '📺 ' : m.type === 'movie' ? '🎬 ' : '🎵 '}
                  {m.title} ({m.year})
                </option>
              ))}
            </select>
          </div>

          {/* Quick Field Editors */}
          <div className="space-y-3 text-xs pt-2">
            <div>
              <label className="block text-slate-400 mb-1">Title</label>
              <input
                type="text"
                value={selectedMedia.title}
                onChange={(e) => setSelectedMedia({ ...selectedMedia, title: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-400 mb-1">Year</label>
                <input
                  type="number"
                  value={selectedMedia.year}
                  onChange={(e) =>
                    setSelectedMedia({ ...selectedMedia, year: Number(e.target.value) })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Rating (/10)</label>
                <input
                  type="number"
                  step="0.1"
                  value={selectedMedia.rating}
                  onChange={(e) =>
                    setSelectedMedia({ ...selectedMedia, rating: Number(e.target.value) })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Genres (comma separated)</label>
              <input
                type="text"
                value={selectedMedia.genres.join(', ')}
                onChange={(e) =>
                  setSelectedMedia({
                    ...selectedMedia,
                    genres: e.target.value.split(',').map((g) => g.trim()),
                  })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Plot / Overview</label>
              <textarea
                rows={4}
                value={selectedMedia.overview}
                onChange={(e) => setSelectedMedia({ ...selectedMedia, overview: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 text-xs focus:outline-none focus:border-purple-500 resize-none leading-relaxed"
              />
            </div>
          </div>

          {/* Validation Status Badge */}
          <div
            className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
              xmlValidation.isValid
                ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300'
                : 'bg-rose-950/30 border-rose-800/40 text-rose-300'
            }`}
          >
            {xmlValidation.isValid ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>XML Schema is 100% valid for Kodi/Jellyfin/Plex</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="truncate">{xmlValidation.error}</span>
              </>
            )}
          </div>
        </div>

        {/* Right: XML Code Editor & Output */}
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FileCode2 className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-bold text-white">
                  Generated .nfo XML Output (
                  {selectedMedia.type === 'movie'
                    ? 'movie.nfo'
                    : selectedMedia.type === 'series'
                    ? 'tvshow.nfo'
                    : 'album.nfo'}
                  )
                </h3>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  id="btn-nfo-copy"
                  onClick={handleCopy}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
                >
                  {isCopied ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy XML</span>
                    </>
                  )}
                </button>

                <button
                  id="btn-nfo-download"
                  onClick={handleDownload}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition shadow-md shadow-purple-600/20"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .nfo</span>
                </button>

                <button
                  id="btn-nfo-push-samba"
                  onClick={() => onPushNfoToSamba(selectedMedia, xmlCode)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>Push to SMB</span>
                </button>
              </div>
            </div>

            {/* XML Textarea */}
            <div className="mt-4">
              <textarea
                id="nfo-code-editor"
                rows={17}
                value={xmlCode}
                onChange={handleXmlChange}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-purple-200 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 leading-relaxed resize-y select-text"
                spellCheck={false}
              />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span className="font-mono">
              Target SMB Path: //{sambaConfig.server}/{sambaConfig.share}/{selectedMedia.recommendedFolderStructure}
            </span>
            <span className="text-purple-400 font-semibold">UTF-8 Encoded</span>
          </div>
        </div>
      </div>
    </div>
  );
};
