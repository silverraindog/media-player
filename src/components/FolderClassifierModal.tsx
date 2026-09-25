import React, { useState } from 'react';
import {
  FolderTree,
  CheckCircle2,
  AlertCircle,
  Sliders,
  Sparkles,
  ChevronRight,
  ChevronDown,
  X,
  FileVideo,
  FileAudio,
  Tv,
  Film,
  Music,
  Check,
  HelpCircle,
  Plus,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import {
  FolderScanClassification,
  ClassifierSettings,
  RegexCategoryRule,
  MediaType,
  SambaConfig,
} from '../types';
import { DEFAULT_REGEX_RULES, classifyFolder } from '../utils/folderClassifier';

interface FolderClassifierModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderClassifications: FolderScanClassification[];
  onConfirmImport: (
    updatedClassifications: FolderScanClassification[],
    settings: ClassifierSettings
  ) => void;
  settings: ClassifierSettings;
  onUpdateSettings: (settings: ClassifierSettings) => void;
  sambaConfig: SambaConfig;
  customScanPath?: string;
}

export const FolderClassifierModal: React.FC<FolderClassifierModalProps> = ({
  isOpen,
  onClose,
  folderClassifications: initialClassifications,
  onConfirmImport,
  settings,
  onUpdateSettings,
  sambaConfig,
  customScanPath,
}) => {
  const [classifications, setClassifications] = useState<FolderScanClassification[]>(initialClassifications);
  const [activeTab, setActiveTab] = useState<'review' | 'rules' | 'categories'>('review');
  const [expandedFolderIds, setExpandedFolderIds] = useState<Record<string, boolean>>({});
  const [testFolderName, setTestFolderName] = useState('My TV Shows');
  const [customRules, setCustomRules] = useState<RegexCategoryRule[]>(settings.rules || DEFAULT_REGEX_RULES);
  const [categories, setCategories] = useState<string[]>(settings.categories || ['Movie', 'Series', 'Album', 'Animation', 'Comedy']);
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(settings.confidenceThreshold || 0.85);
  const [autoImportConfident, setAutoImportConfident] = useState<boolean>(settings.autoImportConfident ?? true);
  const [alwaysPromptReview, setAlwaysPromptReview] = useState<boolean>(settings.alwaysPromptReview ?? false);
  
  // Persist settings effect
  React.useEffect(() => {
    const newSettings: ClassifierSettings = {
      confidenceThreshold,
      autoImportConfident,
      alwaysPromptReview,
      rules: customRules,
      categories: categories,
    };
    localStorage.setItem('samba_vault_classifier', JSON.stringify(newSettings));
  }, [customRules, categories, confidenceThreshold, autoImportConfident, alwaysPromptReview]);
  
  // Progress Simulation State
  const [analyzingProgress, setAnalyzingProgress] = useState(0);
  const [matchingProgress, setMatchingProgress] = useState(0);
  const [applyingProgress, setApplyingProgress] = useState(0);

  React.useEffect(() => {
    if (isOpen) {
      // Simulate classification progress for visual feedback
      let timer1 = setTimeout(() => setAnalyzingProgress(100), 400);
      let timer2 = setTimeout(() => setMatchingProgress(100), 900);
      let timer3 = setTimeout(() => setApplyingProgress(100), 1400);
      
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
        clearTimeout(timer3);
        setAnalyzingProgress(0);
        setMatchingProgress(0);
        setApplyingProgress(0);
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAddCategory = (newCat: string) => {
    if (newCat && !categories.includes(newCat)) {
      setCategories([...categories, newCat]);
    }
  };

  const handleRemoveCategory = (catToRemove: string) => {
    setCategories(categories.filter(c => c !== catToRemove));
  };

  const toggleFolderSelection = (id: string) => {
    setClassifications((prev) =>
      prev.map((c) => (c.id === id ? { ...c, selectedForImport: !c.selectedForImport } : c))
    );
  };

  const updateTargetType = (id: string, newType: MediaType | 'ignore') => {
    setClassifications((prev) =>
      prev.map((c) => (c.id === id ? { ...c, targetType: newType } : c))
    );
  };

  const selectAll = () => {
    setClassifications((prev) => prev.map((c) => ({ ...c, selectedForImport: true })));
  };

  const selectAllAndApplyRules = () => {
    setClassifications((prev) =>
      prev.map((c) => {
        const classification = classifyFolder(c.folderName, c.sampleFiles, customRules, confidenceThreshold);
        return {
          ...c,
          selectedForImport: true,
          targetType: classification.detectedType,
          confidence: classification.confidence,
          isConfident: classification.isConfident,
          matchedRuleName: classification.matchedRuleName,
          matchedRegexPattern: classification.matchedRegexPattern,
        };
      })
    );
  };
  
  // Need to import classifyFolder, but FolderClassifierModal.tsx currently does not. 
  // Let's check imports. It imports DEFAULT_REGEX_RULES from ../utils/folderClassifier.
  // I need to add classifyFolder to the import.


  const selectConfidentOnly = () => {
    setClassifications((prev) =>
      prev.map((c) => ({ ...c, selectedForImport: c.confidence >= confidenceThreshold }))
    );
  };

  const deselectAll = () => {
    setClassifications((prev) => prev.map((c) => ({ ...c, selectedForImport: false })));
  };

  const massApplyTargetType = (newType: MediaType | 'ignore') => {
    setClassifications((prev) =>
      prev.map((c) => (c.selectedForImport ? { ...c, targetType: newType } : c))
    );
  };

  const allSelected = classifications.length > 0 && classifications.every((c) => c.selectedForImport);
  const someSelected = classifications.some((c) => c.selectedForImport) && !allSelected;
  const selectedCount = classifications.filter((c) => c.selectedForImport).length;

  const toggleSelectAll = () => {
    if (allSelected) {
      deselectAll();
    } else {
      selectAll();
    }
  };

  const toggleFolderExpand = (id: string) => {
    setExpandedFolderIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectedFolders = classifications.filter((c) => c.selectedForImport && c.targetType !== 'ignore');
  const totalSelectedItems = selectedFolders.reduce((acc, curr) => acc + curr.itemCount, 0);
  const confidentFoldersCount = classifications.filter((c) => c.confidence >= confidenceThreshold).length;
  const uncertainFoldersCount = classifications.length - confidentFoldersCount;

  const handleApplyImport = () => {
    const updatedSettings: ClassifierSettings = {
      confidenceThreshold,
      autoImportConfident,
      alwaysPromptReview,
      rules: customRules,
      categories,
    };
    onUpdateSettings(updatedSettings);
    onConfirmImport(classifications, updatedSettings);
    onClose();
  };

  const handleAutoImportConfidentOnly = () => {
    const updated = classifications.map((c) => ({
      ...c,
      selectedForImport: c.confidence >= confidenceThreshold,
    }));
    const updatedSettings: ClassifierSettings = {
      confidenceThreshold,
      autoImportConfident,
      alwaysPromptReview,
      rules: customRules,
    };
    onUpdateSettings(updatedSettings);
    onConfirmImport(updated, updatedSettings);
    onClose();
  };

  // Test custom regex against user input
  const testMatch = (() => {
    for (const rule of customRules) {
      try {
        const regex = new RegExp(rule.pattern, 'i');
        if (regex.test(testFolderName.trim())) {
          return {
            matched: true,
            rule,
            confidence: rule.confidenceScore,
          };
        }
      } catch {
        // ignore
      }
    }
    return { matched: false, rule: null, confidence: 0.5 };
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500/20 to-emerald-500/20 border border-indigo-500/30 text-indigo-400">
              <FolderTree className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white tracking-tight">
                  Smart Share Scanner & Regex Classifier
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 text-[11px] font-semibold border border-emerald-500/20">
                  {classifications.length} Folders Detected
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Path:{' '}
                <span className="font-mono text-slate-300">
                  {customScanPath || `//${sambaConfig.server || 'nas'}/${sambaConfig.share || 'media'}`}
                </span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 pt-3 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('review')}
              className={`px-4 py-2 rounded-t-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer border-t border-x ${
                activeTab === 'review'
                  ? 'bg-slate-950 text-indigo-300 border-slate-800 border-b-slate-950'
                  : 'text-slate-400 hover:text-slate-200 border-transparent'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Detected Folders & Import Review</span>
              <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-slate-300 font-mono">
                {confidentFoldersCount} Confident
              </span>
            </button>

            <button
              onClick={() => setActiveTab('rules')}
              className={`px-4 py-2 rounded-t-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer border-t border-x ${
                activeTab === 'rules'
                  ? 'bg-slate-950 text-indigo-300 border-slate-800 border-b-slate-950'
                  : 'text-slate-400 hover:text-slate-200 border-transparent'
              }`}
            >
              <Sliders className="w-4 h-4 text-indigo-400" />
              <span>Regex Rules & Confidence Settings</span>
            </button>
            <button
              onClick={() => setActiveTab('categories')}
              className={`px-4 py-2 rounded-t-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer border-t border-x ${
                activeTab === 'categories'
                  ? 'bg-slate-950 text-indigo-300 border-slate-800 border-b-slate-950'
                  : 'text-slate-400 hover:text-slate-200 border-transparent'
              }`}
            >
              <FolderTree className="w-4 h-4 text-indigo-400" />
              <span>Manage Categories</span>
            </button>
          </div>

          {activeTab === 'review' && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400 pb-2">
              <button
                onClick={selectAll}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium transition cursor-pointer"
              >
                Select All
              </button>
              <button
                onClick={selectAllAndApplyRules}
                className="px-2.5 py-1 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 text-[11px] font-medium border border-emerald-800/40 transition cursor-pointer"
              >
                Select All & Categorize
              </button>
              <button
                onClick={selectConfidentOnly}
                className="px-2.5 py-1 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-300 text-[11px] font-medium border border-indigo-800/40 transition cursor-pointer"
              >
                Confident Only
              </button>
              <button
                onClick={deselectAll}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 text-[11px] font-medium transition cursor-pointer"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'review' && (
            <div className="space-y-3">
              {/* Master Select All Checkbox & Mass Category Application Bar */}
              <div
                id="mass-category-apply-bar"
                className="p-3.5 bg-slate-900/90 border border-slate-700/80 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-sm"
              >
                <label className="flex items-center gap-2.5 text-xs font-semibold text-white cursor-pointer select-none">
                  <input
                    type="checkbox"
                    id="master-select-all-folders-checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span className="text-slate-200">Select All Folders</span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[11px] font-mono border border-slate-700">
                    {selectedCount} of {classifications.length} selected
                  </span>
                </label>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                        setClassifications(prev => prev.map(c => c.confidence >= 0.9 ? {...c, selectedForImport: true} : c));
                    }}
                    className="px-3 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 text-xs font-semibold border border-emerald-800/40 transition cursor-pointer"
                  >
                    Fix All (&gt;90%)
                  </button>
                </div>
              </div>

              {/* Granular Progress Bars */}
              <div className="p-3.5 bg-slate-900/50 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex justify-between text-[10px] text-slate-400">
                      <span>Analyzing file structure</span>
                      <span>{analyzingProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full">
                    <div 
                      className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500 ease-out" 
                      style={{ width: `${analyzingProgress}%` }}
                    ></div>
                  </div>
                  
                  <div className="flex justify-between text-[10px] text-slate-400">
                      <span>Matching metadata</span>
                      <span>{matchingProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full">
                    <div 
                      className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500 ease-out" 
                      style={{ width: `${matchingProgress}%` }}
                    ></div>
                  </div>
                  
                  <div className="flex justify-between text-[10px] text-slate-400">
                      <span>Applying changes</span>
                      <span>{applyingProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full">
                    <div 
                      className="bg-purple-500 h-1.5 rounded-full transition-all duration-500 ease-out" 
                      style={{ width: `${applyingProgress}%` }}
                    ></div>
                  </div>
              </div>

                {selectedCount > 0 ? (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-slate-400 font-medium mr-1">
                      Mass-Apply to Selected:
                    </span>
                    <button
                      id="btn-mass-apply-movie"
                      type="button"
                      onClick={() => massApplyTargetType('movie')}
                      className="px-2.5 py-1 rounded-lg bg-indigo-950/90 hover:bg-indigo-900 text-indigo-200 text-xs font-semibold border border-indigo-700/80 transition flex items-center gap-1.5 cursor-pointer shadow-sm hover:scale-[1.02] active:scale-[0.98]"
                      title={`Set target category to Movie for all ${selectedCount} selected folders`}
                    >
                      <Film className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Movie</span>
                    </button>
                    <button
                      id="btn-mass-apply-series"
                      type="button"
                      onClick={() => massApplyTargetType('series')}
                      className="px-2.5 py-1 rounded-lg bg-purple-950/90 hover:bg-purple-900 text-purple-200 text-xs font-semibold border border-purple-700/80 transition flex items-center gap-1.5 cursor-pointer shadow-sm hover:scale-[1.02] active:scale-[0.98]"
                      title={`Set target category to TV Series for all ${selectedCount} selected folders`}
                    >
                      <Tv className="w-3.5 h-3.5 text-purple-400" />
                      <span>Series</span>
                    </button>
                    <button
                      id="btn-mass-apply-ignore"
                      type="button"
                      onClick={() => massApplyTargetType('ignore')}
                      className="px-2.5 py-1 rounded-lg bg-rose-950/90 hover:bg-rose-900 text-rose-200 text-xs font-semibold border border-rose-700/80 transition flex items-center gap-1.5 cursor-pointer shadow-sm hover:scale-[1.02] active:scale-[0.98]"
                      title={`Ignore / skip all ${selectedCount} selected folders`}
                    >
                      <X className="w-3.5 h-3.5 text-rose-400" />
                      <span>Ignore</span>
                    </button>
                    <button
                      id="btn-mass-apply-music"
                      type="button"
                      onClick={() => massApplyTargetType('album')}
                      className="px-2.5 py-1 rounded-lg bg-cyan-950/90 hover:bg-cyan-900 text-cyan-200 text-xs font-semibold border border-cyan-700/80 transition flex items-center gap-1.5 cursor-pointer shadow-sm hover:scale-[1.02] active:scale-[0.98]"
                      title={`Set target category to Music Album for all ${selectedCount} selected folders`}
                    >
                      <Music className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Music</span>
                    </button>
                  </div>
                ) : (
                  <span className="text-[11px] text-slate-500 italic">
                    Check folders to mass-apply Movie, Series, or Ignore
                  </span>
                )}

              {uncertainFoldersCount > 0 ? (
                <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-3">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Review needed for {uncertainFoldersCount} folders:</span>{' '}
                    Some folders have ambiguous names or low regex confidence (e.g. <em>sort/</em>, <em>temp/</em>). You can assign them directly to TV Series, Movies, or Music Albums below.
                  </div>
                </div>
              ) : null}

              {classifications.map((item) => {
                const isExpanded = expandedFolderIds[item.id];
                const isConfident = item.confidence >= confidenceThreshold;

                return (
                  <div
                    key={item.id}
                    className={`rounded-xl border transition p-4 ${
                      item.selectedForImport
                        ? 'bg-slate-900/90 border-slate-700 shadow-md'
                        : 'bg-slate-900/40 border-slate-800 opacity-70'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={item.selectedForImport}
                          onChange={() => toggleFolderSelection(item.id)}
                          className="mt-1 w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-white font-mono">
                              /{item.folderName}
                            </span>

                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 ${
                                isConfident
                                  ? 'bg-emerald-950 text-emerald-300 border-emerald-800/60'
                                  : 'bg-amber-950 text-amber-300 border-amber-800/60'
                              }`}
                            >
                              <Sparkles className="w-3 h-3" />
                              {Math.round(item.confidence * 100)}% Confidence
                            </span>

                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[11px] font-mono">
                              {item.itemCount} files
                            </span>
                          </div>

                          <div className="mt-1 text-xs text-slate-400 flex items-center gap-2 flex-wrap">
                            <span>
                              Matched Rule: <strong className="text-slate-300">{item.matchedRuleName}</strong>
                            </span>
                            <span className="text-slate-600">•</span>
                            <span className="font-mono text-[10px] text-slate-500">
                              /{item.matchedRegexPattern}/i
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Target Category Dropdown & Details Toggle */}
                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="text-slate-400 text-[11px]">Map to:</span>
                          <select
                            value={item.targetType}
                            onChange={(e) => updateTargetType(item.id, e.target.value as any)}
                            className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-medium cursor-pointer"
                          >
                            <option value="series">📺 TV Series</option>
                            <option value="movie">🎬 Movies</option>
                            <option value="album">🎵 Music Albums</option>
                            <option value="ignore">🚫 Ignore / Skip</option>
                          </select>
                        </div>

                        <button
                          onClick={() => toggleFolderExpand(item.id)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
                          title="Preview files in this folder"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Expandable Preview of sample files & Suggested Structure */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-slate-800/80 pl-7 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <div className="text-[11px] font-semibold text-slate-400 mb-1">Sample Discovered Files:</div>
                            <div className="bg-slate-950/80 rounded-lg p-2.5 space-y-1 border border-slate-800/60 font-mono text-[11px] text-slate-300">
                              {item.sampleFiles.map((file, fIdx) => (
                                <div key={fIdx} className="flex items-center gap-2 truncate">
                                  {file.endsWith('.mp3') || file.endsWith('.flac') ? (
                                    <FileAudio className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                  ) : (
                                    <FileVideo className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                  )}
                                  <span className="truncate">{file}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div>
                            <div className="text-[11px] font-semibold text-indigo-300 mb-1 flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                              <span>AI & Heuristic Suggested Structure:</span>
                            </div>
                            <div className="bg-indigo-950/20 rounded-lg p-2.5 space-y-1 border border-indigo-900/40 font-mono text-[11px] text-indigo-200">
                              <div className="text-slate-400 text-[10px] uppercase font-sans font-semibold">Target Convention:</div>
                              {item.targetType === 'series' && (
                                <div>
                                  📁 TV Shows / <span className="text-white font-bold">{item.folderName.replace(/[\._]/g, ' ')}</span> / Season 01 /{' '}
                                  <span className="text-emerald-300">{item.folderName.replace(/[\._]/g, ' ')} - S01E01 - Pilot.mkv</span>
                                </div>
                              )}
                              {item.targetType === 'movie' && (
                                <div>
                                  📁 Movies / <span className="text-white font-bold">{item.folderName.replace(/[\._]/g, ' ')} (2024)</span> /{' '}
                                  <span className="text-emerald-300">{item.folderName.replace(/[\._]/g, ' ')} (2024).mkv</span>
                                </div>
                              )}
                              {item.targetType === 'album' && (
                                <div>
                                  📁 Music / <span className="text-white font-bold">{item.folderName.replace(/[\._]/g, ' ')}</span> /{' '}
                                  <span className="text-emerald-300">01 - Track Title.flac</span>
                                </div>
                              )}
                              {item.targetType === 'ignore' && (
                                <div className="text-rose-400">🚫 Folder ignored / skipped from library import</div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'rules' && (
            <div className="space-y-6">
              {/* Confidence Threshold & Auto-Import Toggles */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-4">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-indigo-400" />
                  <span>Automation & Threshold Settings</span>
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Auto-Import Confidence Threshold: {Math.round(confidenceThreshold * 100)}%
                    </label>
                    <input
                      type="range"
                      min="0.5"
                      max="0.99"
                      step="0.05"
                      value={confidenceThreshold}
                      onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                      <span>50% (Permissive)</span>
                      <span>85% (Recommended)</span>
                      <span>99% (Strict)</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoImportConfident}
                        onChange={(e) => setAutoImportConfident(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Auto-import folders with confidence ≥ {Math.round(confidenceThreshold * 100)}%</span>
                    </label>

                    <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={alwaysPromptReview}
                        onChange={(e) => setAlwaysPromptReview(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Always show this review modal after every Samba sync</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Regex Match Interactive Tester */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Live Regex Rule Tester</span>
                </h4>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={testFolderName}
                    onChange={(e) => setTestFolderName(e.target.value)}
                    placeholder="Enter a sample folder name, e.g. 'Series' or '4K Movies'..."
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                  <div
                    className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${
                      testMatch.matched
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {testMatch.matched ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>
                          Matches: <strong>{testMatch.rule?.name}</strong> ({Math.round(testMatch.confidence * 100)}% confidence)
                        </span>
                      </>
                    ) : (
                      <>
                        <HelpCircle className="w-4 h-4 text-slate-400" />
                        <span>No exact regex match (will prompt review)</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Active Regex Rules Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-white">Active Regex Classification Rules</h4>
                  <button
                    onClick={() => setCustomRules(DEFAULT_REGEX_RULES)}
                    className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset to Defaults</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {customRules.map((rule, rIdx) => (
                    <div
                      key={rule.id}
                      className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{rule.name}</span>
                          <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 font-mono text-[10px]">
                            {rule.targetType.toUpperCase()}
                          </span>
                          <span className="text-emerald-400 font-mono text-[10px]">
                            {Math.round(rule.confidenceScore * 100)}% base confidence
                          </span>
                        </div>
                        <div className="mt-1 font-mono text-[11px] text-slate-400 truncate max-w-xl">
                          /{rule.pattern}/i
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-500">Priority #{rule.priority}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'categories' && (
            <div className="p-4 space-y-4">
              <h3 className="text-sm font-bold text-white">Manage Media Categories</h3>
              <div className="flex gap-2">
                <input type="text" id="new-cat-input" placeholder="New Category..." className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white" />
                <button onClick={() => {
                    const input = document.getElementById('new-cat-input') as HTMLInputElement;
                    handleAddCategory(input.value);
                    input.value = '';
                }} className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold">Add</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {categories.map(cat => (
                  <div key={cat} className="flex items-center gap-1 bg-slate-800 px-2 py-1 rounded text-xs text-slate-200">
                    {cat}
                    <button onClick={() => handleRemoveCategory(cat)} className="text-slate-400 hover:text-white">×</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-4 bg-slate-900 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            Selected for import:{' '}
            <strong className="text-white">
              {selectedFolders.length} folders ({totalSelectedItems} items)
            </strong>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={onClose}
              className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
            >
              Cancel
            </button>

            {confidentFoldersCount > 0 && (
              <button
                onClick={handleAutoImportConfidentOnly}
                className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-700/40 text-xs font-semibold transition cursor-pointer"
                title="Import only the folders that meet confidence threshold"
              >
                Auto-Import Confident ({confidentFoldersCount})
              </button>
            )}

            <button
              onClick={handleApplyImport}
              disabled={selectedFolders.length === 0}
              className="flex-1 sm:flex-initial px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white text-xs font-bold shadow-lg shadow-indigo-500/25 transition cursor-pointer disabled:opacity-50"
            >
              Import Selected Folders ({selectedFolders.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
