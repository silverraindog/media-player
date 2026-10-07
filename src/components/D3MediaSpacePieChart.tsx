import React, { useRef, useState, useMemo, useEffect } from 'react';
import * as d3 from 'd3';
import { Film, Tv, Music, HardDrive, PieChart as PieChartIcon, Disc, Layers } from 'lucide-react';

export interface MediaSpaceTypeItem {
  name: string;
  typeKey: string;
  count: number;
  totalGB: number;
  color: string;
  totalBytes?: number;
}

interface D3MediaSpacePieChartProps {
  data: MediaSpaceTypeItem[];
  totalSizeGB?: number;
  totalItemsCount?: number;
  onSelectType?: (typeKey: string) => void;
  selectedType?: string;
  className?: string;
}

interface ArcSliceData {
  data: MediaSpaceTypeItem;
  value: number;
  startAngle: number;
  endAngle: number;
  padAngle: number;
  index: number;
  storagePercent: number;
  countPercent: number;
  avgSizeGB: number;
}

export const D3MediaSpacePieChart: React.FC<D3MediaSpacePieChartProps> = ({
  data,
  totalSizeGB,
  totalItemsCount,
  onSelectType,
  selectedType = 'all',
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 380, height: 260 });
  const [hoveredSlice, setHoveredSlice] = useState<MediaSpaceTypeItem | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [metricMode, setMetricMode] = useState<'storage' | 'count'>('storage');
  const [chartShape, setChartShape] = useState<'donut' | 'pie'>('donut');

  // Track container width dynamically for responsiveness
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          const w = Math.max(280, entry.contentRect.width);
          const h = Math.min(300, Math.max(230, Math.round(w * 0.65)));
          setDimensions({ width: w, height: h });
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Calculate totals
  const overallStorageGB = useMemo(() => {
    if (typeof totalSizeGB === 'number' && totalSizeGB > 0) return totalSizeGB;
    return Number(data.reduce((acc, curr) => acc + curr.totalGB, 0).toFixed(2));
  }, [data, totalSizeGB]);

  const overallCount = useMemo(() => {
    if (typeof totalItemsCount === 'number' && totalItemsCount > 0) return totalItemsCount;
    return data.reduce((acc, curr) => acc + curr.count, 0);
  }, [data, totalItemsCount]);

  // Generate D3 pie arcs
  const { slices, activeSummary } = useMemo(() => {
    if (!data || data.length === 0) {
      return { slices: [], activeSummary: null };
    }

    const pieGenerator = d3
      .pie<MediaSpaceTypeItem>()
      .value((d) => (metricMode === 'storage' ? Math.max(0.01, d.totalGB) : Math.max(1, d.count)))
      .sort(null)
      .padAngle(chartShape === 'donut' ? 0.035 : 0.015);

    const pieArcs = pieGenerator(data);

    const computedSlices: ArcSliceData[] = pieArcs.map((arc, idx) => {
      const d = arc.data;
      const storagePct = overallStorageGB > 0 ? Number(((d.totalGB / overallStorageGB) * 100).toFixed(1)) : 0;
      const countPct = overallCount > 0 ? Number(((d.count / overallCount) * 100).toFixed(1)) : 0;
      const avgGB = d.count > 0 ? Number((d.totalGB / d.count).toFixed(2)) : 0;

      return {
        data: d,
        value: arc.value,
        startAngle: arc.startAngle,
        endAngle: arc.endAngle,
        padAngle: arc.padAngle || 0,
        index: idx,
        storagePercent: storagePct,
        countPercent: countPct,
        avgSizeGB: avgGB,
      };
    });

    const activeItem = hoveredSlice || (selectedType !== 'all' ? data.find((d) => d.typeKey === selectedType) : null);
    let summary = null;
    if (activeItem) {
      const storagePct = overallStorageGB > 0 ? Number(((activeItem.totalGB / overallStorageGB) * 100).toFixed(1)) : 0;
      const countPct = overallCount > 0 ? Number(((activeItem.count / overallCount) * 100).toFixed(1)) : 0;
      const avgGB = activeItem.count > 0 ? Number((activeItem.totalGB / activeItem.count).toFixed(2)) : 0;
      summary = {
        name: activeItem.name,
        typeKey: activeItem.typeKey,
        totalGB: activeItem.totalGB,
        count: activeItem.count,
        storagePercent: storagePct,
        countPercent: countPct,
        avgSizeGB: avgGB,
        color: activeItem.color,
      };
    }

    return { slices: computedSlices, activeSummary: summary };
  }, [data, metricMode, chartShape, overallStorageGB, overallCount, hoveredSlice, selectedType]);

  // Radius calculation
  const radius = Math.min(dimensions.width, dimensions.height) / 2 - 14;
  const innerRadius = chartShape === 'donut' ? Math.max(28, radius * 0.58) : 0;
  const outerRadius = radius;

  // D3 Arc generator helper
  const createArcPath = (slice: ArcSliceData, isHovered: boolean, isSelected: boolean) => {
    const rOuter = isHovered || isSelected ? outerRadius + 5 : outerRadius;
    const rInner = chartShape === 'donut' ? (isHovered || isSelected ? innerRadius - 2 : innerRadius) : 0;

    const arcGenerator = d3
      .arc<ArcSliceData>()
      .innerRadius(rInner)
      .outerRadius(rOuter)
      .cornerRadius(chartShape === 'donut' ? 4 : 2);

    return arcGenerator(slice) || '';
  };

  const getMediaIcon = (typeKey: string) => {
    switch (typeKey) {
      case 'movie':
        return <Film className="w-3.5 h-3.5" />;
      case 'series':
        return <Tv className="w-3.5 h-3.5" />;
      case 'album':
      case 'music':
        return <Music className="w-3.5 h-3.5" />;
      default:
        return <Disc className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div
      ref={containerRef}
      className={`rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl p-5 space-y-4 flex flex-col justify-between ${className}`}
    >
      {/* Chart Title & Interactive Controls */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-slate-800/80">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                <PieChartIcon className="w-4 h-4" />
              </span>
              <span>Media Space Usage by Type</span>
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-indigo-950/60 border border-indigo-800/40 text-indigo-300">
                D3 Layout
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Proportional storage volume (Movies vs. TV Series vs. Music)
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Donut vs Solid Pie toggle */}
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setChartShape('donut')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                  chartShape === 'donut' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Donut format with center metric readout"
              >
                Donut
              </button>
              <button
                type="button"
                onClick={() => setChartShape('pie')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                  chartShape === 'pie' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Solid pie chart"
              >
                Pie
              </button>
            </div>

            {/* Storage (GB) vs Count toggle */}
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setMetricMode('storage')}
                className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                  metricMode === 'storage' ? 'bg-purple-600 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Scale slices by Gigabytes allocated"
              >
                Storage (GB)
              </button>
              <button
                type="button"
                onClick={() => setMetricMode('count')}
                className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                  metricMode === 'count' ? 'bg-purple-600 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Scale slices by number of media files"
              >
                Titles
              </button>
            </div>
          </div>
        </div>

        {/* D3 SVG Pie Chart Rendering Canvas */}
        <div className="relative w-full flex items-center justify-center my-3 select-none" style={{ height: dimensions.height }}>
          {slices.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-slate-500 text-xs py-10 space-y-2">
              <Layers className="w-8 h-8 opacity-30 animate-pulse" />
              <span>Indexing SQLite vault media distribution…</span>
            </div>
          ) : (
            <>
              <svg
                width={dimensions.width}
                height={dimensions.height}
                viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
                className="overflow-visible"
              >
                <defs>
                  {slices.map((slice) => (
                    <filter
                      key={`glow-${slice.data.typeKey}`}
                      id={`d3-glow-${slice.data.typeKey}`}
                      x="-20%"
                      y="-20%"
                      width="140%"
                      height="140%"
                    >
                      <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor={slice.data.color} floodOpacity="0.45" />
                    </filter>
                  ))}
                </defs>

                <g transform={`translate(${dimensions.width / 2}, ${dimensions.height / 2})`}>
                  {slices.map((slice) => {
                    const isHovered = hoveredSlice?.typeKey === slice.data.typeKey;
                    const isSelected = selectedType === slice.data.typeKey;
                    const pathD = createArcPath(slice, isHovered, isSelected);

                    return (
                      <g key={slice.data.typeKey} className="transition-all duration-200">
                        <path
                          d={pathD}
                          fill={slice.data.color}
                          stroke="#020617"
                          strokeWidth={2}
                          filter={isHovered || isSelected ? `url(#d3-glow-${slice.data.typeKey})` : undefined}
                          className="cursor-pointer transition-all duration-200 hover:opacity-100"
                          style={{
                            opacity: hoveredSlice && !isHovered ? 0.45 : isSelected ? 1 : 0.9,
                            transformOrigin: '0px 0px',
                          }}
                          onMouseEnter={(e) => {
                            setHoveredSlice(slice.data);
                            const rect = containerRef.current?.getBoundingClientRect();
                            if (rect) {
                              setTooltipPos({
                                x: e.clientX - rect.left,
                                y: e.clientY - rect.top,
                              });
                            }
                          }}
                          onMouseMove={(e) => {
                            const rect = containerRef.current?.getBoundingClientRect();
                            if (rect) {
                              setTooltipPos({
                                x: e.clientX - rect.left,
                                y: e.clientY - rect.top,
                              });
                            }
                          }}
                          onMouseLeave={() => {
                            setHoveredSlice(null);
                            setTooltipPos(null);
                          }}
                          onClick={() => {
                            if (onSelectType) {
                              onSelectType(selectedType === slice.data.typeKey ? 'all' : slice.data.typeKey);
                            }
                          }}
                        />
                      </g>
                    );
                  })}
                </g>
              </svg>

              {/* Center Donut Readout */}
              {chartShape === 'donut' && (
                <div
                  className="absolute pointer-events-none flex flex-col items-center justify-center text-center transition-all duration-150"
                  style={{
                    width: innerRadius * 1.7,
                    height: innerRadius * 1.7,
                  }}
                >
                  {activeSummary ? (
                    <div className="space-y-0.5 animate-in fade-in duration-150">
                      <span className="text-[11px] font-semibold tracking-wider text-slate-300 block truncate max-w-[120px]">
                        {activeSummary.name}
                      </span>
                      <span className="text-base font-black font-mono text-white block">
                        {metricMode === 'storage' ? `${activeSummary.totalGB} GB` : `${activeSummary.count} titles`}
                      </span>
                      <span className="text-[10px] font-mono text-emerald-400 block font-semibold">
                        {metricMode === 'storage' ? `${activeSummary.storagePercent}% space` : `${activeSummary.countPercent}% titles`}
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-medium tracking-wider text-slate-400 uppercase block">
                        Total {metricMode === 'storage' ? 'Space' : 'Titles'}
                      </span>
                      <span className="text-base font-black font-mono text-white block">
                        {metricMode === 'storage' ? `${overallStorageGB} GB` : `${overallCount} titles`}
                      </span>
                      <span className="text-[10px] font-mono text-indigo-400 block">
                        {data.length} Formats
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Floating Tooltip */}
              {hoveredSlice && tooltipPos && (
                <div
                  className="absolute pointer-events-none z-30 px-3 py-2 rounded-xl bg-slate-950/95 border border-slate-700 shadow-2xl backdrop-blur-md text-xs space-y-1 animate-in fade-in zoom-in-95 duration-100"
                  style={{
                    left: Math.min(dimensions.width - 160, Math.max(10, tooltipPos.x + 12)),
                    top: Math.max(10, tooltipPos.y - 45),
                  }}
                >
                  <div className="flex items-center gap-1.5 font-bold text-white border-b border-slate-800 pb-1">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: hoveredSlice.color }} />
                    <span>{hoveredSlice.name}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] font-mono text-slate-300">
                    <span className="text-slate-400">Vault Space:</span>
                    <span className="text-emerald-400 font-bold text-right">{hoveredSlice.totalGB} GB</span>
                    <span className="text-slate-400">Share of Vault:</span>
                    <span className="text-indigo-400 text-right">
                      {overallStorageGB > 0 ? Number(((hoveredSlice.totalGB / overallStorageGB) * 100).toFixed(1)) : 0}%
                    </span>
                    <span className="text-slate-400">Catalog Count:</span>
                    <span className="text-white text-right">{hoveredSlice.count}</span>
                    <span className="text-slate-400">Avg Title Size:</span>
                    <span className="text-purple-400 text-right">
                      {hoveredSlice.count > 0 ? (hoveredSlice.totalGB / hoveredSlice.count).toFixed(1) : 0} GB
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Media Type Space Breakdown List */}
      <div className="space-y-2 pt-2 border-t border-slate-800/80">
        <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium px-1">
          <span>Format Category</span>
          <span>Storage Footprint & Ratio</span>
        </div>

        <div className="space-y-1.5">
          {data.map((item) => {
            const isHovered = hoveredSlice?.typeKey === item.typeKey;
            const isSelected = selectedType === item.typeKey;
            const storagePct = overallStorageGB > 0 ? Number(((item.totalGB / overallStorageGB) * 100).toFixed(1)) : 0;
            const countPct = overallCount > 0 ? Number(((item.count / overallCount) * 100).toFixed(1)) : 0;
            const avgGB = item.count > 0 ? (item.totalGB / item.count).toFixed(1) : '0';

            return (
              <div
                key={item.typeKey}
                onMouseEnter={() => setHoveredSlice(item)}
                onMouseLeave={() => setHoveredSlice(null)}
                onClick={() => {
                  if (onSelectType) {
                    onSelectType(selectedType === item.typeKey ? 'all' : item.typeKey);
                  }
                }}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-1.5 ${
                  isSelected
                    ? 'bg-indigo-950/40 border-indigo-500/80 shadow-md shadow-indigo-500/10'
                    : isHovered
                      ? 'bg-slate-800/60 border-slate-700'
                      : 'bg-slate-950/60 border-slate-800/70 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-6 h-6 rounded-lg flex items-center justify-center text-white"
                      style={{ backgroundColor: `${item.color}25`, border: `1px solid ${item.color}60`, color: item.color }}
                    >
                      {getMediaIcon(item.typeKey)}
                    </span>
                    <div>
                      <span className="font-semibold text-slate-100 flex items-center gap-1.5">
                        {item.name}
                        {isSelected && (
                          <span className="text-[9px] uppercase px-1 rounded bg-indigo-500/20 text-indigo-300 font-mono">
                            Active Filter
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {item.count} titles · ~{avgGB} GB/title
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="font-mono font-bold text-emerald-400 text-xs block">
                      {item.totalGB} GB
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {storagePct}% vault space
                    </span>
                  </div>
                </div>

                {/* Progress bar of storage share */}
                <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.max(3, storagePct)}%`,
                      backgroundColor: item.color,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
