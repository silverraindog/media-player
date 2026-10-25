import React, { useState, useEffect } from 'react';
import { Cpu, Zap, RefreshCw, AlertCircle } from 'lucide-react';
import { TranscodeConfig } from '../types';

export interface HwAccelSupport {
  nvenc: boolean;
  videotoolbox: boolean;
  vaapi: boolean;
}

export interface HwAccelSettingsCardProps {
  transcodeConfig: TranscodeConfig;
  onUpdateTranscodeConfig: (config: TranscodeConfig) => void;
  className?: string;
}

export const HwAccelSettingsCard: React.FC<HwAccelSettingsCardProps> = ({
  transcodeConfig,
  onUpdateTranscodeConfig,
  className = '',
}) => {
  const [hwSupport, setHwSupport] = useState<HwAccelSupport | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/media/diagnostics/ffmpeg')
      .then((res) => res.json())
      .then((data) => {
        setHwSupport(data.hwSupport);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  const hwAccel = transcodeConfig?.hwAccel || { enabled: true, nvenc: false, videotoolbox: false, vaapi: false };

  const toggleAccel = (key: keyof HwAccelSupport) => {
    onUpdateTranscodeConfig({
      ...transcodeConfig,
      hwAccel: {
        ...hwAccel,
        [key]: !hwAccel[key],
      },
    });
  };

  const toggleEnabled = () => {
    onUpdateTranscodeConfig({
      ...transcodeConfig,
      hwAccel: {
        ...hwAccel,
        enabled: !hwAccel.enabled,
      },
    });
  };

  if (isLoading) return <div className="p-4 text-xs text-slate-400"><RefreshCw className="w-4 h-4 animate-spin inline mr-2" /> Detecting hardware...</div>;

  return (
    <div className={`p-4 rounded-xl bg-slate-950 border border-slate-800 ${className}`}>
      <div className="flex items-center gap-2 mb-4">
        <Cpu className="w-5 h-5 text-cyan-400" />
        <h3 className="text-sm font-bold text-white">GPU Hardware Acceleration</h3>
      </div>
      
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-300">Enable Hardware Acceleration</span>
          <button
            onClick={toggleEnabled}
            className={`w-10 h-5 rounded-full relative transition-colors ${hwAccel.enabled ? 'bg-cyan-600' : 'bg-slate-700'}`}
          >
            <div className={`w-3 h-3 rounded-full bg-white absolute top-1 transition-transform ${hwAccel.enabled ? 'left-6' : 'left-1'}`} />
          </button>
        </div>

        {hwAccel.enabled && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
            {(['nvenc', 'videotoolbox', 'vaapi'] as const).map((key) => (
              <div key={key} className={`p-2 rounded border text-xs flex items-center justify-between ${hwSupport?.[key] ? 'border-slate-700 bg-slate-900' : 'border-slate-800 bg-slate-950 opacity-50'}`}>
                <span className="capitalize">{key === 'videotoolbox' ? 'VideoToolbox' : key}</span>
                <input
                  type="checkbox"
                  checked={Boolean(hwAccel[key])}
                  disabled={!hwSupport?.[key]}
                  onChange={() => toggleAccel(key)}
                  className="accent-cyan-500"
                />
              </div>
            ))}
          </div>
        )}
        
        {!hwSupport && <div className="text-xs text-rose-400 flex items-center gap-1 mt-2"><AlertCircle className="w-3 h-3" /> Could not detect HW capabilities.</div>}
      </div>
    </div>
  );
};
