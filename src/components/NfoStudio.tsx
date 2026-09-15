import React, { useState, useEffect, useMemo } from 'react';
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
  Code,
  Columns,
  Wand2,
  Check,
  AlertTriangle,
  FileCheck,
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

interface XmlSyntaxError {
  line?: number;
  column?: number;
  message: string;
  rawText?: string;
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
  const [viewLayout, setViewLayout] = useState<'split' | 'preview' | 'editor'>('split');
  const [xmlValidation, setXmlValidation] = useState<{
    isValid: boolean;
    errors: XmlSyntaxError[];
  }>({
    isValid: true,
    errors: [],
  });
  const [showPushConfirm, setShowPushConfirm] = useState(false);

  useEffect(() => {
    if (initialMedia) {
      setSelectedMedia(initialMedia);
    }
  }, [initialMedia]);

  useEffect(() => {
    const generated = generateMetadataFile(selectedMedia);
    setXmlCode(generated);
    validateXmlContent(generated);
  }, [selectedMedia]);

  const validateXmlContent = (xml: string) => {
    const errors: XmlSyntaxError[] = [];

    if (!xml.trim()) {
      setXmlValidation({
        isValid: false,
        errors: [{ message: 'XML document is empty' }],
      });
      return;
    }

    // Check for unescaped ampersands
    const lines = xml.split('\n');
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const unescapedAmpMatch = line.match(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g);
      if (unescapedAmpMatch) {
        errors.push({
          line: lineNum,
          message: `Unescaped '&' found. In XML, replace '&' with '&amp;'`,
          rawText: line.trim(),
        });
      }
    });

    // Check DOMParser XML parsing
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, 'text/xml');
      const parserError = doc.querySelector('parsererror');
      if (parserError) {
        const errorText = parserError.textContent || 'Syntax error in XML markup';
        const lineMatch = errorText.match(/line\s*(\d+)/i);
        const colMatch = errorText.match(/column\s*(\d+)/i);
        errors.push({
          line: lineMatch ? parseInt(lineMatch[1], 10) : undefined,
          column: colMatch ? parseInt(colMatch[1], 10) : undefined,
          message: errorText.split('\n')[0] || errorText,
        });
      }

      // Check root tag matches standard media nfo schemas
      const rootElement = doc.documentElement;
      if (rootElement && !['movie', 'tvshow', 'episodedetails', 'album', 'musicvideo'].includes(rootElement.tagName.toLowerCase())) {
        errors.push({
          message: `Unrecognized root tag <${rootElement.tagName}>. Recommended: <movie>, <tvshow>, <episodedetails>, or <album>`,
        });
      }
    } catch (err: any) {
      errors.push({ message: err.message || 'XML Parsing exception' });
    }

    setXmlValidation({
      isValid: errors.length === 0,
      errors,
    });
  };

  const handleXmlChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setXmlCode(val);
    validateXmlContent(val);
  };

  // Auto-fix common XML syntax errors
  const handleAutoFixSyntax = () => {
    let fixed = xmlCode;
    // Replace unescaped & with &amp;
    fixed = fixed.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
    // Ensure XML header is present
    if (!fixed.trim().startsWith('<?xml')) {
      fixed = `<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>\n` + fixed;
    }
    setXmlCode(fixed);
    validateXmlContent(fixed);
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

  const handlePushSafely = () => {
    if (!xmlValidation.isValid) {
      setShowPushConfirm(true);
      return;
    }
    onPushNfoToSamba(selectedMedia, xmlCode);
  };

  const handleSelectPreset = (id: string) => {
    const found = CURATED_MEDIA_DATABASE.find((m) => m.id === id);
    if (found) setSelectedMedia(found);
  };

  // Parse lines for real-time syntax highlighted preview
  const previewLines = useMemo(() => {
    const lines = xmlCode.split('\n');
    const errorLineSet = new Set(
      xmlValidation.errors.filter((e) => e.line !== undefined).map((e) => e.line)
    );

    return lines.map((line, idx) => {
      const lineNum = idx + 1;
      const isErrorLine = errorLineSet.has(lineNum);
      return {
        lineNum,
        text: line,
        isErrorLine,
      };
    });
  }, [xmlCode, xmlValidation]);

  // Helper to colorize XML line content
  const renderSyntaxHighlightedLine = (line: string) => {
    if (line.trim().startsWith('<?xml') || line.trim().startsWith('<!DOCTYPE')) {
      return <span className="text-cyan-400 font-semibold">{line}</span>;
    }
    if (line.trim().startsWith('<!--')) {
      return <span className="text-slate-500 italic">{line}</span>;
    }

    // Match tags and values: <tag>value</tag> or <tag />
    const tagMatch = line.match(/^(\s*)(<[a-zA-Z0-9_-]+>)(.*?)(<\/[a-zA-Z0-9_-]+>|\/>)(\s*)$/);
    if (tagMatch) {
      const [, leading, openTag, innerText, closeTag, trailing] = tagMatch;
      return (
        <>
          <span>{leading}</span>
          <span className="text-purple-400 font-bold">{openTag}</span>
          <span className="text-emerald-300">{innerText}</span>
          <span className="text-purple-400 font-bold">{closeTag}</span>
          <span>{trailing}</span>
        </>
      );
    }

    // Match solitary open tag <tag>
    const openTagOnly = line.match(/^(\s*)(<[a-zA-Z0-9_-]+[^>]*>)(\s*)$/);
    if (openTagOnly) {
      const [, leading, tag, trailing] = openTagOnly;
      return (
        <>
          <span>{leading}</span>
          <span className="text-indigo-400 font-bold">{tag}</span>
          <span>{trailing}</span>
        </>
      );
    }

    // Match closing tag </tag>
    const closeTagOnly = line.match(/^(\s*)(<\/[a-zA-Z0-9_-]+>)(\s*)$/);
    if (closeTagOnly) {
      const [, leading, tag, trailing] = closeTagOnly;
      return (
        <>
          <span>{leading}</span>
          <span className="text-indigo-400 font-bold">{tag}</span>
          <span>{trailing}</span>
        </>
      );
    }

    return <span className="text-slate-200">{line}</span>;
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
          Live NFO Metadata Generator & Real-Time XML Preview
        </h2>
        <p className="mt-2 text-sm text-slate-300 leading-relaxed max-w-3xl">
          Edit metadata in real-time with an interactive syntax validator and live preview pane. Catch and auto-fix formatting errors before pushing <code className="text-purple-300 bg-purple-950/60 px-1 py-0.5 rounded">.nfo</code> files to your Samba share.
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
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500 cursor-pointer"
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
              <label className="block text-slate-400 mb-1 font-medium">Title</label>
              <input
                type="text"
                value={selectedMedia.title}
                onChange={(e) => setSelectedMedia({ ...selectedMedia, title: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-purple-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Year</label>
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
                <label className="block text-slate-400 mb-1 font-medium">Rating (/10)</label>
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
              <label className="block text-slate-400 mb-1 font-medium">Genres (comma separated)</label>
              <input
                type="text"
                value={selectedMedia.genres?.join(', ') || ''}
                onChange={(e) =>
                  setSelectedMedia({
                    ...selectedMedia,
                    genres: e.target.value.split(',').map((g) => g.trim()).filter(Boolean),
                  })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium">Plot / Overview</label>
              <textarea
                rows={4}
                value={selectedMedia.overview}
                onChange={(e) => setSelectedMedia({ ...selectedMedia, overview: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 text-xs focus:outline-none focus:border-purple-500 resize-none leading-relaxed"
              />
            </div>
          </div>

          {/* Validation Status & Live Syntax Diagnostics */}
          <div className="space-y-2 pt-2">
            <div
              className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                xmlValidation.isValid
                  ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300'
                  : 'bg-rose-950/30 border-rose-800/40 text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {xmlValidation.isValid ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="font-semibold">XML is 100% Valid</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span className="font-semibold">
                      {xmlValidation.errors.length} Syntax Issue{xmlValidation.errors.length === 1 ? '' : 's'}
                    </span>
                  </>
                )}
              </div>

              {!xmlValidation.isValid && (
                <button
                  id="btn-nfo-autofix"
                  onClick={handleAutoFixSyntax}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-rose-900/60 hover:bg-rose-800 text-rose-200 text-[11px] font-bold border border-rose-700 transition cursor-pointer"
                >
                  <Wand2 className="w-3 h-3" />
                  <span>Auto-Fix</span>
                </button>
              )}
            </div>

            {!xmlValidation.isValid && xmlValidation.errors.length > 0 && (
              <div className="p-3 bg-slate-950 border border-rose-900/40 rounded-xl space-y-1.5 text-xs text-rose-300 max-h-36 overflow-y-auto">
                <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400 block">
                  Detected XML Issues:
                </span>
                {xmlValidation.errors.map((err, i) => (
                  <div key={i} className="flex items-start gap-1.5 font-mono text-[11px] leading-tight">
                    <span className="text-rose-400 shrink-0">•</span>
                    <div>
                      {err.line !== undefined && (
                        <strong className="text-amber-400">Line {err.line}: </strong>
                      )}
                      <span>{err.message}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Real-time XML Editor & Live Preview Pane */}
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between space-y-4">
          <div>
            {/* Top Toolbar: View Layout Toggles & Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <FileCode2 className="w-4 h-4 text-purple-400" />
                  <h3 className="text-sm font-bold text-white">
                    {selectedMedia.type === 'movie'
                      ? 'movie.nfo'
                      : selectedMedia.type === 'series'
                      ? 'tvshow.nfo'
                      : 'album.nfo'}
                  </h3>
                </div>

                {/* View Mode Toggle: Split / Live Preview / Raw Editor */}
                <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                  <button
                    id="btn-nfo-view-split"
                    onClick={() => setViewLayout('split')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                      viewLayout === 'split'
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Side-by-side Editor & Live XML Preview"
                  >
                    <Columns className="w-3.5 h-3.5" />
                    <span>Split View</span>
                  </button>
                  <button
                    id="btn-nfo-view-preview"
                    onClick={() => setViewLayout('preview')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                      viewLayout === 'preview'
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Full Live Colorized XML Preview"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Live Preview</span>
                  </button>
                  <button
                    id="btn-nfo-view-editor"
                    onClick={() => setViewLayout('editor')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                      viewLayout === 'editor'
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Raw Code Editor"
                  >
                    <Code className="w-3.5 h-3.5" />
                    <span>Raw Code</span>
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  id="btn-nfo-copy"
                  onClick={handleCopy}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer"
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
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition shadow-md shadow-purple-600/20 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .nfo</span>
                </button>

                <button
                  id="btn-nfo-push-samba"
                  onClick={handlePushSafely}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-semibold transition cursor-pointer ${
                    !xmlValidation.isValid
                      ? 'bg-amber-600 hover:bg-amber-500 shadow-md shadow-amber-600/20'
                      : 'bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-600/20'
                  }`}
                  title={!xmlValidation.isValid ? 'Warning: XML contains syntax errors' : 'Push clean XML NFO to Samba share'}
                >
                  {!xmlValidation.isValid ? (
                    <AlertTriangle className="w-3.5 h-3.5" />
                  ) : (
                    <FolderPlus className="w-3.5 h-3.5" />
                  )}
                  <span>Push to SMB</span>
                </button>
              </div>
            </div>

            {/* Confirmation Dialog for pushing XML with syntax errors */}
            {showPushConfirm && (
              <div className="mt-3 p-3 bg-amber-950/80 border border-amber-800/80 rounded-xl text-xs text-amber-200 flex items-center justify-between gap-3 animate-in fade-in">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    XML markup contains syntax errors. Push anyway or auto-fix syntax first?
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleAutoFixSyntax}
                    className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px] cursor-pointer"
                  >
                    Auto-Fix & Continue
                  </button>
                  <button
                    onClick={() => {
                      setShowPushConfirm(false);
                      onPushNfoToSamba(selectedMedia, xmlCode);
                    }}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 text-[11px] cursor-pointer"
                  >
                    Push As-Is
                  </button>
                  <button
                    onClick={() => setShowPushConfirm(false)}
                    className="text-slate-400 hover:text-white text-[11px] cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Workspaces: Split View, Full Preview, or Full Editor */}
            <div className="mt-4">
              {viewLayout === 'split' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Left half: Raw editable textarea */}
                  <div className="flex flex-col space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono px-1">
                      <span>Interactive XML Code:</span>
                      <span className="text-purple-400">Live Sync</span>
                    </div>
                    <textarea
                      id="nfo-code-editor-split"
                      rows={16}
                      value={xmlCode}
                      onChange={handleXmlChange}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 font-mono text-[11px] text-purple-200 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 leading-relaxed resize-y select-text"
                      spellCheck={false}
                    />
                  </div>

                  {/* Right half: Live syntax-colorized XML preview pane with error highlighting */}
                  <div className="flex flex-col space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono px-1">
                      <span className="flex items-center gap-1.5">
                        <Eye className="w-3 h-3 text-emerald-400" />
                        <span>Real-Time XML Preview:</span>
                      </span>
                      {xmlValidation.isValid ? (
                        <span className="text-emerald-400 text-[10px] font-bold">100% Valid</span>
                      ) : (
                        <span className="text-rose-400 text-[10px] font-bold">Syntax Error</span>
                      )}
                    </div>
                    <div
                      id="nfo-preview-pane"
                      className="w-full bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 font-mono text-[11px] leading-relaxed max-h-[380px] overflow-y-auto select-text space-y-0.5"
                    >
                      {previewLines.map(({ lineNum, text, isErrorLine }) => (
                        <div
                          key={lineNum}
                          className={`flex items-start gap-2.5 px-1 py-0.5 rounded ${
                            isErrorLine ? 'bg-rose-950/60 border border-rose-800/80 text-rose-200' : 'hover:bg-slate-900/60'
                          }`}
                        >
                          <span className={`w-6 text-right select-none text-[10px] shrink-0 ${isErrorLine ? 'text-rose-400 font-bold' : 'text-slate-600'}`}>
                            {lineNum}
                          </span>
                          <div className="flex-1 overflow-x-auto whitespace-pre">
                            {renderSyntaxHighlightedLine(text)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {viewLayout === 'preview' && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono px-1">
                    <span className="flex items-center gap-1.5">
                      <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Full Colorized XML Inspection Pane:</span>
                    </span>
                    <span className="text-purple-400">{xmlCode.length} bytes</span>
                  </div>
                  <div
                    id="nfo-preview-full"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs leading-relaxed max-h-[440px] overflow-y-auto select-text space-y-0.5"
                  >
                    {previewLines.map(({ lineNum, text, isErrorLine }) => (
                      <div
                        key={lineNum}
                        className={`flex items-start gap-3 px-1.5 py-0.5 rounded ${
                          isErrorLine ? 'bg-rose-950/70 border border-rose-700 text-rose-200' : 'hover:bg-slate-900/60'
                        }`}
                      >
                        <span className={`w-8 text-right select-none text-[11px] shrink-0 ${isErrorLine ? 'text-rose-400 font-bold' : 'text-slate-600'}`}>
                          {lineNum}
                        </span>
                        <div className="flex-1 overflow-x-auto whitespace-pre">
                          {renderSyntaxHighlightedLine(text)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {viewLayout === 'editor' && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono px-1">
                    <span>Full Raw Code Editor:</span>
                    <span className="text-purple-400">UTF-8</span>
                  </div>
                  <textarea
                    id="nfo-code-editor-full"
                    rows={18}
                    value={xmlCode}
                    onChange={handleXmlChange}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-purple-200 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 leading-relaxed resize-y select-text"
                    spellCheck={false}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <span className="font-mono truncate max-w-lg">
              Target SMB Path: //{sambaConfig.server}/{sambaConfig.share}/{selectedMedia.recommendedFolderStructure}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-purple-400 font-semibold">UTF-8 Encoded</span>
              <span className="text-slate-500">|</span>
              <span className="text-emerald-400 font-medium">Real-Time XML Validator Active</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

