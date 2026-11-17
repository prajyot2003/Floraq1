import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
  details?: {
    error?: string;
    operationType?: string;
    path?: string | null;
  };
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let parsed: ErrorBoundaryState['details'] | undefined;
    try {
      const obj = JSON.parse(error.message);
      if (obj && typeof obj === 'object' && 'operationType' in obj) {
        parsed = obj;
      }
    } catch {
      // plain error message
    }
    return {
      hasError: true,
      message: parsed?.error || error.message || 'An unexpected application error occurred.',
      details: parsed,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[FloraQ ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F7FAF7] flex items-center justify-center p-4 text-[#20352A]">
          <div className="bg-white rounded-2xl border border-rose-200 max-w-md w-full p-6 shadow-md space-y-4">
            <div className="flex items-center gap-2.5 text-rose-700">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h2 className="text-base font-bold">FloraQ Runtime Protection</h2>
            </div>
            <p className="text-xs text-[#20352A] leading-relaxed">{this.state.message}</p>
            {this.state.details && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-[11px] font-mono text-rose-800 space-y-1">
                <div>Operation: {this.state.details.operationType}</div>
                {this.state.details.path && <div>Path: {this.state.details.path}</div>}
              </div>
            )}
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2 px-4 rounded-lg bg-[#174D36] hover:bg-[#206044] text-white text-xs font-semibold flex items-center justify-center gap-2 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reload Application</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
