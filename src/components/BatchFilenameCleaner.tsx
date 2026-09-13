import React, { useState } from 'react';
import {
  FolderSync,
  Upload,
  FileVideo,
  FileAudio,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Copy,
  Download,
  Terminal,
  RefreshCw,
  Trash2,
  FolderTree,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { ParsedFileInfo, MediaType, SambaConfig } from '../types';
import { downloadTextFile } from '../utils/zipDownloader';

interface BatchFilenameCleanerProps {
  sambaConfig: SambaConfig;
  onBatchPushToSamba: (items: ParsedFileInfo[]) => void;
}

const SAMPLE_RAW_FILES = [
  'Breaking.Bad.S01E01.Pilot.720p.BluRay.x264-ROVERS.mkv',
  'Severance.S01E01.Good.News.About.Hell.1080p.WEB-DL.DDP5.1.H.264.mkv',
  'Dune.Part.Two.2024.2160p.UHD.HDR.BluRay.x265.DTS-HD.MA.7.1-EXTREME.mkv',
  'Interstellar.2014.IMAX.1080p.BluRay.x264.DTS-WiKi.mp4',
  'Oppenheimer.2023.1080p.WEBRip.x264.AAC5.1-[YTS.MX].mkv',
  '01_Daft_Punk_Give_Life_Back_to_Music_FLAC_24bit_96kHz.flac',
  'Pink.Floyd.1973.The.Dark.Side.Of.The.Moon.06.Money.mp3',
  'Stranger.Things.S04E01.Chapter.One.The.Hellfire.Club.1080p.NF.WEB-DL.mkv',
];

export const BatchFilenameCleaner: React.FC<BatchFilenameCleanerProps> = ({
  sambaConfig,
  onBatchPushToSamba,
}) => {
  const [inputText, setInputText] = useState(SAMPLE_RAW_FILES.join('\n'));
  const [parsedFiles, setParsedFiles] = useState<ParsedFileInfo[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [copiedScript, setCopiedScript] = useState<string | null>(null);
  const [activeScriptTab, setActiveScriptTab] = useState<'bash' | 'powershell' | 'cmd'>('bash');

  const handleParse = async () => {
    const rawLines = inputText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (rawLines.length === 0) return;

    setIsProcessing(true);

    try {
      const res = await fetch('/api/metadata/parse-filename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filenames: rawLines }),
      });

      const data = await res.json();
      if (data.success && data.results) {
        setParsedFiles(data.results);
      }
    } catch (err) {
      console.error('Failed to parse:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLoadSample = () => {
    setInputText(SAMPLE_RAW_FILES.join('\n'));
  };

  const handleClear = () => {
    setInputText('');
    setParsedFiles([]);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesList = Array.from(e.target.files) as File[];
      const names = filesList.map((f) => f.name);
      setInputText((prev) => (prev ? `${prev}\n${names.join('\n')}` : names.join('\n')));
    }
  };

  // Generate Shell / Batch scripts
  const generateBashScript = () => {
    let script = `#!/bin/bash
# ==============================================================================
# Automated Media Renamer & Organizer for macOS / Linux Samba Share
# Target: //${sambaConfig.server}/${sambaConfig.share}
# ==============================================================================

BASE_DIR="/mnt/${sambaConfig.share}" # (Change to /Volumes/${sambaConfig.share} on macOS)

echo "Starting automated media organization..."
`;

    parsedFiles.forEach((f) => {
      const safeFolder = f.cleanFolderPath.replace(/'/g, "\\'");
      const safeOrig = f.originalFilename.replace(/'/g, "\\'");
      const safeClean = f.cleanFormattedFilename.replace(/'/g, "\\'");

      script += `
# Clean: ${f.detectedTitle}
mkdir -p "$BASE_DIR/${safeFolder}"
if [ -f "${safeOrig}" ]; then
  mv "${safeOrig}" "$BASE_DIR/${safeFolder}/${safeClean}"
  echo "✅ Moved ${safeOrig} -> $BASE_DIR/${safeFolder}/${safeClean}"
fi
`;
    });

    script += `\necho "Finished organizing all media files!"\n`;
    return script;
  };

  const generatePowerShellScript = () => {
    let script = `# ==============================================================================
# Automated Media Renamer & Organizer for Windows PowerShell
# Target: \\\\${sambaConfig.server}\\${sambaConfig.share} (Mapped Drive Z:)
# ==============================================================================

$BaseDir = "Z:\\" # Or "\\\\${sambaConfig.server}\\${sambaConfig.share}"

Write-Host "Organizing files on Samba Share..." -ForegroundColor Cyan
`;

    parsedFiles.forEach((f) => {
      const winFolder = f.cleanFolderPath.replace(/\//g, '\\');
      script += `
# File: ${f.detectedTitle}
$targetDir = Join-Path $BaseDir "${winFolder}"
if (!(Test-Path -Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
}
if (Test-Path -Path "${f.originalFilename}") {
    Move-Item -Path "${f.originalFilename}" -Destination (Join-Path $targetDir "${f.cleanFormattedFilename}")
    Write-Host "Moved ${f.originalFilename} -> $targetDir\\${f.cleanFormattedFilename}" -ForegroundColor Green
}
`;
    });

    script += `\nWrite-Host "Media files organized successfully!" -ForegroundColor Green\n`;
    return script;
  };

  const generateCmdScript = () => {
    let script = `@echo off
:: ==============================================================================
:: Automated Media Renamer for Windows Command Prompt
:: Target: Z:\\
:: ==============================================================================
set BASE_DIR=Z:\\

echo Organizing files on Samba Share...
`;

    parsedFiles.forEach((f) => {
      const winFolder = f.cleanFolderPath.replace(/\//g, '\\');
      script += `
mkdir "%BASE_DIR%\\${winFolder}" 2>nul
if exist "${f.originalFilename}" (
    move "${f.originalFilename}" "%BASE_DIR%\\${winFolder}\\${f.cleanFormattedFilename}"
    echo [OK] Moved ${f.originalFilename}
)
`;
    });

    script += `\necho Completed!\npause\n`;
    return script;
  };

  const getActiveScript = () => {
    if (activeScriptTab === 'bash') return generateBashScript();
    if (activeScriptTab === 'powershell') return generatePowerShellScript();
    return generateCmdScript();
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(getActiveScript());
    setCopiedScript(activeScriptTab);
    setTimeout(() => setCopiedScript(null), 2000);
  };

  const handleDownloadScript = () => {
    const ext = activeScriptTab === 'bash' ? 'sh' : activeScriptTab === 'powershell' ? 'ps1' : 'bat';
    downloadTextFile(`samba_organize_media_${sambaConfig.share}.${ext}`, getActiveScript());
  };

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="bg-gradient-to-r from-slate-900 via-cyan-950/40 to-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-medium mb-3">
          <FolderSync className="w-3.5 h-3.5 text-cyan-400" />
          <span>Batch Release Cleaner & Auto-Tagger</span>
        </div>
        <h2 className="text-2xl font-bold text-white tracking-tight">
          Plex, Jellyfin & Kodi Standard File Organizer
        </h2>
        <p className="mt-2 text-sm text-slate-300 leading-relaxed max-w-3xl">
          Clean messy scene releases, torrents, or rip filenames into standardized structures. Automatically detects Show titles, Season/Episode numbers, Movie release years, audio codecs, and music tags, and generates ready-to-run organization scripts for macOS, Linux, and Windows Samba shares.
        </p>
      </div>

      {/* Input & Action Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Input Textarea and File Dropper */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="batch-filenames-textarea" className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <FileText className="w-4 h-4 text-cyan-400" />
                <span>Raw Filenames or Release Titles (one per line):</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  id="batch-load-sample-btn"
                  onClick={handleLoadSample}
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition"
                >
                  Load Sample
                </button>
                <button
                  id="batch-clear-btn"
                  onClick={handleClear}
                  className="text-xs text-slate-400 hover:text-rose-400 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <textarea
              id="batch-filenames-textarea"
              rows={9}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Paste raw media filenames here, e.g.:&#10;Breaking.Bad.S01E01.720p.BluRay.x264.mkv&#10;Interstellar.2014.1080p.BluRay.mp4"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 leading-relaxed resize-y"
            />
          </div>

          {/* File upload drag trigger */}
          <div className="border border-dashed border-slate-700 hover:border-cyan-500/60 rounded-xl p-4 text-center bg-slate-950/40 transition">
            <input
              id="file-upload-input"
              type="file"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
            <label
              htmlFor="file-upload-input"
              className="cursor-pointer flex flex-col items-center justify-center space-y-1 text-xs text-slate-400 hover:text-slate-200"
            >
              <Upload className="w-5 h-5 text-cyan-400 mb-1" />
              <span className="font-semibold text-slate-300">
                Or select video/audio files directly
              </span>
              <span className="text-[11px] text-slate-500">
                (Extracts file names without uploading large media files over network)
              </span>
            </label>
          </div>

          {/* Clean / Parse Action Button */}
          <button
            id="batch-parse-btn"
            onClick={handleParse}
            disabled={isProcessing || !inputText.trim()}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-cyan-600/20 disabled:opacity-50 transition"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
                <span>AI Parsing & Standardizing...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-cyan-200" />
                <span>Standardize & Auto-Organize</span>
              </>
            )}
          </button>
        </div>

        {/* Right: Parsed Results Table / Preview */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FolderTree className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">
                  Cleaned Structure ({parsedFiles.length} items parsed)
                </h3>
              </div>

              {parsedFiles.length > 0 && (
                <button
                  id="batch-push-all-btn"
                  onClick={() => onBatchPushToSamba(parsedFiles)}
                  className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Push All to Samba Share</span>
                </button>
              )}
            </div>

            {parsedFiles.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center p-6 border border-slate-800 rounded-xl bg-slate-950/40">
                <FolderSync className="w-10 h-10 text-slate-600 mb-2" />
                <p className="text-sm text-slate-400 font-medium">No files parsed yet</p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  Paste filenames on the left and click "Standardize & Auto-Organize" to format them for Kodi, Jellyfin, and Plex.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                {parsedFiles.map((file) => (
                  <div
                    key={file.id}
                    id={`parsed-item-${file.id}`}
                    className="p-3 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl text-xs space-y-1.5 transition"
                  >
                    {/* Original Raw */}
                    <div className="flex items-center justify-between text-slate-500 font-mono text-[11px] truncate">
                      <span className="truncate">ORIGINAL: {file.originalFilename}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          file.detectedType === 'series'
                            ? 'bg-purple-900/40 text-purple-300'
                            : file.detectedType === 'movie'
                            ? 'bg-cyan-900/40 text-cyan-300'
                            : 'bg-emerald-900/40 text-emerald-300'
                        }`}
                      >
                        {file.detectedType}
                      </span>
                    </div>

                    {/* Standardized Target */}
                    <div className="flex items-center gap-2 text-emerald-400 font-semibold font-mono">
                      <ArrowRight className="w-3.5 h-3.5 shrink-0 text-cyan-400" />
                      <span className="truncate">{file.cleanFolderPath}</span>
                    </div>
                    <div className="pl-5 text-slate-200 font-mono font-medium truncate">
                      ↳ {file.cleanFormattedFilename}
                    </div>

                    {/* Tags */}
                    <div className="pl-5 flex flex-wrap gap-2 text-[10px] text-slate-400">
                      {file.detectedResolution && (
                        <span className="bg-slate-800 px-1.5 py-0.5 rounded">
                          {file.detectedResolution}
                        </span>
                      )}
                      {file.detectedCodec && (
                        <span className="bg-slate-800 px-1.5 py-0.5 rounded">
                          {file.detectedCodec}
                        </span>
                      )}
                      {file.detectedSeason !== undefined && file.detectedEpisode !== undefined && (
                        <span className="bg-purple-950 text-purple-300 px-1.5 py-0.5 rounded">
                          S{String(file.detectedSeason).padStart(2, '0')}E
                          {String(file.detectedEpisode).padStart(2, '0')}
                        </span>
                      )}
                      {file.detectedYear && (
                        <span className="bg-slate-800 px-1.5 py-0.5 rounded">
                          {file.detectedYear}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Script Generation Footer */}
          {parsedFiles.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-semibold text-slate-200">
                    One-Click Shell Script for Samba Share:
                  </span>
                </div>

                {/* Tabs */}
                <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px]">
                  <button
                    id="tab-script-bash"
                    onClick={() => setActiveScriptTab('bash')}
                    className={`px-2.5 py-1 rounded ${
                      activeScriptTab === 'bash' ? 'bg-indigo-600 text-white' : 'text-slate-400'
                    }`}
                  >
                    macOS / Linux (.sh)
                  </button>
                  <button
                    id="tab-script-powershell"
                    onClick={() => setActiveScriptTab('powershell')}
                    className={`px-2.5 py-1 rounded ${
                      activeScriptTab === 'powershell'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400'
                    }`}
                  >
                    PowerShell (.ps1)
                  </button>
                  <button
                    id="tab-script-cmd"
                    onClick={() => setActiveScriptTab('cmd')}
                    className={`px-2.5 py-1 rounded ${
                      activeScriptTab === 'cmd' ? 'bg-indigo-600 text-white' : 'text-slate-400'
                    }`}
                  >
                    Windows CMD (.bat)
                  </button>
                </div>
              </div>

              {/* Code display preview */}
              <div className="relative">
                <pre className="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-[11px] text-slate-300 max-h-24 overflow-y-auto leading-relaxed">
                  {getActiveScript()}
                </pre>
                <div className="absolute top-2 right-2 flex gap-1">
                  <button
                    id="btn-copy-script"
                    onClick={handleCopyScript}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1 transition shadow"
                  >
                    {copiedScript === activeScriptTab ? (
                      <span className="text-emerald-400 text-[10px]">Copied!</span>
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    id="btn-download-script"
                    onClick={handleDownloadScript}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1 transition shadow"
                    title="Download execution script"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
