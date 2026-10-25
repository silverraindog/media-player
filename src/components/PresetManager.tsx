import React, { useState } from 'react';
import { Plus, Trash2, Zap } from 'lucide-react';
import { TranscodeConfig, TranscodePreset } from '../types';

export interface PresetManagerProps {
  transcodeConfig: TranscodeConfig;
  onUpdateTranscodeConfig: (config: TranscodeConfig) => void;
  className?: string;
}

export const PresetManager: React.FC<PresetManagerProps> = ({
  transcodeConfig,
  onUpdateTranscodeConfig,
  className = '',
}) => {
  const [newPresetName, setNewPresetName] = useState('');

  const addPreset = () => {
    if (!newPresetName) return;
    const newPreset: TranscodePreset = {
      id: `preset-${Date.now()}`,
      name: newPresetName,
      resolution: '1080p',
      bitrate: '5000k',
      hwAccelType: 'none',
    };
    onUpdateTranscodeConfig({
      ...transcodeConfig,
      presets: [...transcodeConfig.presets, newPreset],
    });
    setNewPresetName('');
  };

  const deletePreset = (id: string) => {
    onUpdateTranscodeConfig({
      ...transcodeConfig,
      presets: transcodeConfig.presets.filter(p => p.id !== id),
      activePresetId: transcodeConfig.activePresetId === id ? undefined : transcodeConfig.activePresetId,
    });
  };

  const setActivePreset = (id: string) => {
    onUpdateTranscodeConfig({
      ...transcodeConfig,
      activePresetId: id,
    });
  };

  return (
    <div className={`p-4 rounded-xl bg-slate-950 border border-slate-800 ${className}`}>
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-5 h-5 text-indigo-400" />
        <h3 className="text-sm font-bold text-white">Transcode Preset Manager</h3>
      </div>
      
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={newPresetName}
          onChange={(e) => setNewPresetName(e.target.value)}
          placeholder="New preset name (e.g., 720p-Low)"
          className="flex-1 bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-xs text-white"
        />
        <button onClick={addPreset} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded px-3 py-1.5 text-xs font-semibold">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-2">
        {transcodeConfig.presets.map((preset) => (
          <div key={preset.id} className={`p-2 rounded border text-xs flex items-center justify-between ${transcodeConfig.activePresetId === preset.id ? 'border-indigo-500 bg-indigo-900/20' : 'border-slate-800 bg-slate-900'}`}>
            <span className="font-medium text-white">{preset.name}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setActivePreset(preset.id)} className="text-indigo-400 hover:text-indigo-300">Select</button>
              <button onClick={() => deletePreset(preset.id)} className="text-rose-400 hover:text-rose-300"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
