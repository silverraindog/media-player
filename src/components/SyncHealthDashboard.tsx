import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import { SyncLog } from '../types';
import { Activity, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';

interface SyncHealthDashboardProps {
  logs: SyncLog[];
}

export const SyncHealthDashboard: React.FC<SyncHealthDashboardProps> = ({ logs }) => {
  const chartData = useMemo(() => {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Create 24 hourly buckets
    const buckets: Record<string, { hour: string; success: number; warning: number; error: number; timestamp: number }> = {};
    
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getTime() - i * 60 * 60 * 1000);
      d.setMinutes(0, 0, 0);
      const key = d.toISOString();
      buckets[key] = {
        hour: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        success: 0,
        warning: 0,
        error: 0,
        timestamp: d.getTime()
      };
    }

    logs.forEach(log => {
      const logTime = new Date(log.timestamp);
      if (logTime >= twentyFourHoursAgo) {
        const bucketTime = new Date(logTime.getTime());
        bucketTime.setMinutes(0, 0, 0);
        const key = bucketTime.toISOString();
        if (buckets[key]) {
          if (log.status === 'success') buckets[key].success++;
          else if (log.status === 'warning') buckets[key].warning++;
          else if (log.status === 'error') buckets[key].error++;
        }
      }
    });

    return Object.values(buckets).sort((a, b) => a.timestamp - b.timestamp);
  }, [logs]);

  const stats = useMemo(() => {
    const last24h = logs.filter(l => new Date(l.timestamp) >= new Date(Date.now() - 24 * 60 * 60 * 1000));
    return {
      success: last24h.filter(l => l.status === 'success').length,
      warning: last24h.filter(l => l.status === 'warning').length,
      error: last24h.filter(l => l.status === 'error').length,
    };
  }, [logs]);

  if (logs.length === 0) {
    return (
      <div className="bg-slate-950/50 border border-slate-800/60 rounded-xl p-8 text-center space-y-2">
        <Activity className="w-8 h-8 text-slate-700 mx-auto opacity-50" />
        <p className="text-slate-500 text-sm">No activity recorded in the last 24 hours.</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-950/50 border border-slate-800/60 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-400" />
          <h4 className="text-sm font-bold text-slate-200">Sync Health (24h Trend)</h4>
        </div>
        <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-wider">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <CheckCircle2 className="w-3 h-3" />
            <span>{stats.success} Success</span>
          </div>
          <div className="flex items-center gap-1.5 text-amber-400">
            <AlertTriangle className="w-3 h-3" />
            <span>{stats.warning} Warnings</span>
          </div>
          <div className="flex items-center gap-1.5 text-rose-400">
            <AlertCircle className="w-3 h-3" />
            <span>{stats.error} Errors</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-500 pl-4 border-l border-slate-800">
            <span>{logs.length} Total Ops</span>
          </div>
        </div>
      </div>

      <div className="h-32 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorError" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis 
              dataKey="hour" 
              hide 
            />
            <YAxis hide />
            <Tooltip
              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: '10px' }}
              itemStyle={{ padding: '0px' }}
            />
            <Area
              type="monotone"
              dataKey="success"
              stroke="#10b981"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorSuccess)"
              name="Success"
            />
            <Area
              type="monotone"
              dataKey="warning"
              stroke="#f59e0b"
              strokeWidth={2}
              fill="none"
              name="Warning"
            />
            <Area
              type="monotone"
              dataKey="error"
              stroke="#f43f5e"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorError)"
              name="Error"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
