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
    <div className={`p-5 rounded-2xl bg-slate-950 border border-slate-800 shadow-xl space-y-4 ${className}`}>
      <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
        <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
          <Cpu className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white">GPU Hardware Acceleration</h3>
          <p className="text-xs text-slate-400">Dynamically update FFmpeg transcode command flags with <code className="text-cyan-300 font-mono">-hwaccel auto</code></p>
        </div>
      </div>
      
      <div className="space-y-3">
        {/* Main Hardware Acceleration Auto Toggle */}
        <div className="p-3.5 rounded-xl bg-slate-900 border border-cyan-500/30 flex items-center justify-between gap-4 shadow-sm">
          <div className="space-y-0.5">
            <div className="text-xs font-bold text-white flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-cyan-400 fill-cyan-400" />
              <span>Hardware Acceleration (-hwaccel auto)</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Ensures smoother playback on devices with supported GPUs by passing auto hardware acceleration flags.
            </p>
          </div>
          <button
            onClick={toggleEnabled}
            className={`w-11 h-6 rounded-full relative transition-colors cursor-pointer shrink-0 ${hwAccel.enabled ? 'bg-cyan-600' : 'bg-slate-700'}`}
            title="Toggle Hardware Acceleration (-hwaccel auto)"
          >
            <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${hwAccel.enabled ? 'left-5.5' : 'left-0.5'}`} />
          </button>
        </div>

        {hwAccel.enabled && (
          <div className="space-y-3 mt-3 animate-in fade-in">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Hardware Accelerators</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(['nvenc', 'videotoolbox', 'vaapi'] as const).map((key) => (
                <div key={key} className={`p-2.5 rounded-xl border text-xs flex items-center justify-between ${hwSupport?.[key] ? 'border-slate-700 bg-slate-900/90' : 'border-slate-800 bg-slate-950 opacity-50'}`}>
                  <span className="capitalize font-medium text-slate-300">{key === 'videotoolbox' ? 'VideoToolbox' : key}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(hwAccel[key as keyof typeof hwAccel])}
                    disabled={!hwSupport?.[key]}
                    onChange={() => toggleAccel(key)}
                    className="accent-cyan-500 cursor-pointer"
                  />
                </div>
              ))}
            </div>

            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 pt-1">Hardware Acceleration Encoders (AV1 / HEVC / H.264)</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(['h264', 'hevc', 'av1'] as const).map((enc) => (
                <div key={enc} className="p-2.5 rounded-xl border border-slate-700 bg-slate-900/90 text-xs flex items-center justify-between">
                  <span className="uppercase font-semibold text-cyan-300">{enc}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(hwAccel[enc as keyof typeof hwAccel])}
                    onChange={() => {
                      onUpdateTranscodeConfig({
                        ...transcodeConfig,
                        hwAccel: {
                          ...hwAccel,
                          [enc]: !hwAccel[enc],
                        },
                      });
                    }}
                    className="accent-cyan-500 cursor-pointer"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        
        {!hwSupport && <div className="text-xs text-rose-400 flex items-center gap-1 mt-2"><AlertCircle className="w-3 h-3" /> Could not detect hardware capabilities.</div>}
      </div>
    </div>
  );
};
