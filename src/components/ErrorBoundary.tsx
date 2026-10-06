import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  tabName?: string;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught render crash:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="my-8 max-w-2xl mx-auto p-6 rounded-2xl bg-slate-900 border border-rose-500/30 shadow-2xl text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/20 shadow-inner">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-bold text-white">
              {this.props.tabName ? `${this.props.tabName} View Recovered` : 'Component Error Recovered'}
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              A temporary display error occurred while rendering this tab. Your library data and vault state remain safe.
            </p>
            {this.state.error && (
              <p className="text-[11px] font-mono text-rose-300/80 bg-rose-950/40 p-2 rounded-lg border border-rose-900/30 max-h-24 overflow-y-auto">
                {this.state.error.message || String(this.state.error)}
              </p>
            )}
          </div>
          <button
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow-lg shadow-indigo-600/30 active:scale-95 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reload {this.props.tabName || 'View'}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
