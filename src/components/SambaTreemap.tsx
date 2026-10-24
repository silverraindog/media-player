import React, { useRef, useEffect, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { Layers, Film, Tv, Music, AlertTriangle, Maximize2, HardDrive } from 'lucide-react';
import { SambaShareNode } from '../types';
import { calculateSambaStorageMetrics, formatStorageBytes, StorageEntityItem } from '../utils/sambaStorageCalculator';

interface SambaTreemapProps {
  sambaTree: SambaShareNode[];
  onSelectNode?: (nodePath: string) => void;
  className?: string;
}

interface TreemapDatum {
  name: string;
  path: string;
  size: number;
  type: 'movies' | 'series' | 'music' | 'other';
  fileCount: number;
  children?: TreemapDatum[];
}

export const SambaTreemap: React.FC<SambaTreemapProps> = ({
  sambaTree,
  onSelectNode,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 420 });
  const [hoveredNode, setHoveredNode] = useState<TreemapDatum | null>(null);
  const [metricView, setMetricView] = useState<'size' | 'files'>('size');

  // Measure container width for responsiveness
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setDimensions((prev) => ({
            ...prev,
            width: entry.contentRect.width,
          }));
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Transform SambaTree into a hierarchical D3 treemap structure
  const treemapData = useMemo(() => {
    const metrics = calculateSambaStorageMetrics(sambaTree);
    const { byType } = metrics;

    const buildCategoryTree = (typeKey: 'movies' | 'series' | 'music' | 'other', label: string): TreemapDatum => {
      const stats = byType[typeKey];
      const items = stats.topItems || [];

      const children: TreemapDatum[] = items.map((item) => ({
        name: item.name,
        path: item.path,
        size: metricView === 'size' ? Math.max(1024, item.sizeBytes) : Math.max(1, item.fileCount),
        type: typeKey,
        fileCount: item.fileCount,
      }));

      // Ensure at least a dummy child if empty so D3 doesn't crash
      if (children.length === 0) {
        children.push({
          name: 'Empty Category',
          path: label,
          size: 1,
          type: typeKey,
          fileCount: 0,
        });
      }

      return {
        name: label,
        path: label,
        size: d3.sum(children, (d) => d.size),
        type: typeKey,
        fileCount: d3.sum(children, (d) => d.fileCount),
        children,
      };
    };

    const rootChildren: TreemapDatum[] = [
      buildCategoryTree('movies', 'Movies & Films'),
      buildCategoryTree('series', 'TV Series & Shows'),
      buildCategoryTree('music', 'Music & Audio'),
    ];

    if (byType.other.totalBytes > 0 || byType.other.topItems.length > 0) {
      rootChildren.push(buildCategoryTree('other', 'Other Assets'));
    }

    return {
      name: 'Samba Share Root',
      path: '',
      size: d3.sum(rootChildren, (d) => d.size),
      type: 'other' as const,
      fileCount: d3.sum(rootChildren, (d) => d.fileCount),
      children: rootChildren,
    };
  }, [sambaTree, metricView]);

  // Compute D3 Treemap layout
  const root = useMemo(() => {
    const hierarchy = d3
      .hierarchy(treemapData)
      .sum((d) => d.size)
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    const treemap = d3
      .treemap<TreemapDatum>()
      .size([dimensions.width, dimensions.height])
      .paddingOuter(3)
      .paddingTop(20)
      .paddingInner(2)
      .round(true);

    return treemap(hierarchy);
  }, [treemapData, dimensions]);

  // Color mapping by media category
  const getColorByType = (type: string, depth: number) => {
    if (depth === 1) {
      // Group header boxes
      switch (type) {
        case 'movies': return 'rgba(99, 102, 241, 0.15)';
        case 'series': return 'rgba(168, 85, 247, 0.15)';
        case 'music': return 'rgba(16, 185, 129, 0.15)';
        default: return 'rgba(100, 116, 139, 0.15)';
      }
    }
    // Leaf item boxes
    switch (type) {
      case 'movies': return '#4f46e5'; // Indigo 600
      case 'series': return '#9333ea'; // Purple 600
      case 'music': return '#059669'; // Emerald 600
      default: return '#475569'; // Slate 600
    }
  };

  const getBorderColorByType = (type: string) => {
    switch (type) {
      case 'movies': return '#818cf8';
      case 'series': return '#c084fc';
      case 'music': return '#34d399';
      default: return '#94a3b8';
    }
  };

  return (
    <div className={`rounded-2xl border border-slate-800 bg-slate-900/95 backdrop-blur-md shadow-xl p-5 space-y-4 ${className}`}>
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <span>Disk Usage Treemap Bottleneck Inspector</span>
              <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-mono">
                D3 Hierarchical Layout
              </span>
            </h4>
            <p className="text-xs text-slate-400">
              Interactive space-filling treemap representing storage distribution and heavy media consumers across your Samba share.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Metric View Toggle */}
          <div className="flex items-center p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs">
            <button
              onClick={() => setMetricView('size')}
              className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                metricView === 'size' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              By Storage Size
            </button>
            <button
              onClick={() => setMetricView('files')}
              className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                metricView === 'files' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              By File Count
            </button>
          </div>
        </div>
      </div>

      {/* Treemap SVG Container */}
      <div
        ref={containerRef}
        className="w-full relative rounded-xl bg-slate-950 border border-slate-800 overflow-hidden shadow-inner"
        style={{ height: `${dimensions.height}px` }}
      >
        <svg width={dimensions.width} height={dimensions.height} className="block w-full h-full">
          {root.descendants().map((node, i) => {
            const isRoot = node.depth === 0;
            const isGroup = node.depth === 1;
            const isLeaf = !node.children;

            if (isRoot) return null;

            const x = node.x0;
            const y = node.y0;
            const w = Math.max(0, node.x1 - node.x0);
            const h = Math.max(0, node.y1 - node.y0);

            if (w < 2 || h < 2) return null;

            const datum = node.data;
            const isHovered = hoveredNode === datum;

            return (
              <g
                key={`${datum.path}-${i}`}
                transform={`translate(${x},${y})`}
                onMouseEnter={() => setHoveredNode(datum)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => {
                  if (datum.path && onSelectNode) {
                    onSelectNode(datum.path);
                  }
                }}
                className="cursor-pointer transition-opacity duration-150"
              >
                <rect
                  width={w}
                  height={h}
                  rx={isGroup ? 6 : 4}
                  ry={isGroup ? 6 : 4}
                  fill={getColorByType(datum.type, node.depth)}
                  stroke={isGroup ? getBorderColorByType(datum.type) : isHovered ? '#ffffff' : 'rgba(255,255,255,0.15)'}
                  strokeWidth={isHovered ? 2 : isGroup ? 1.5 : 1}
                  className="transition-all duration-150"
                />

                {/* Group Category Header Label */}
                {isGroup && w > 60 && h > 20 && (
                  <text
                    x={8}
                    y={14}
                    fill="#e2e8f0"
                    fontSize={11}
                    fontWeight="bold"
                    fontFamily="monospace"
                    pointerEvents="none"
                  >
                    {datum.name} ({formatStorageBytes(datum.size)})
                  </text>
                )}

                {/* Leaf Title Label if box is large enough */}
                {isLeaf && w > 50 && h > 30 && (
                  <g transform="translate(6, 6)">
                    <text
                      x={0}
                      y={10}
                      fill="#ffffff"
                      fontSize={11}
                      fontWeight="bold"
                      className="drop-shadow-sm truncate"
                      pointerEvents="none"
                    >
                      {w > 90 ? datum.name : `${datum.name.slice(0, 12)}...`}
                    </text>
                    <text
                      x={0}
                      y={24}
                      fill="#94a3b8"
                      fontSize={10}
                      fontFamily="monospace"
                      pointerEvents="none"
                    >
                      {metricView === 'size' ? formatStorageBytes(datum.size) : `${datum.size} files`}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredNode && (
          <div className="absolute bottom-3 right-3 bg-slate-900/95 border border-slate-700 rounded-xl px-3.5 py-2.5 shadow-2xl backdrop-blur-md pointer-events-none z-20 text-xs space-y-1 max-w-xs animate-in fade-in duration-100">
            <div className="font-bold text-white truncate flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: getBorderColorByType(hoveredNode.type) }}
              />
              <span className="truncate">{hoveredNode.name}</span>
            </div>
            <div className="text-slate-400 font-mono text-[11px] truncate">
              {hoveredNode.path}
            </div>
            <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-800 text-slate-300 font-mono text-[11px]">
              <span>Storage: <strong>{formatStorageBytes(hoveredNode.size)}</strong></span>
              <span>Files: <strong>{hoveredNode.fileCount}</strong></span>
            </div>
          </div>
        )}
      </div>

      {/* Bottleneck Warning Footer */}
      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            Tip: Larger rectangular blocks represent high-capacity media consumers. Click any tile to inspect or jump to its directory.
          </span>
        </div>
        <span className="font-mono text-[11px] text-slate-500 shrink-0">
          Root Share: {formatStorageBytes(treemapData.size)}
        </span>
      </div>
    </div>
  );
};
