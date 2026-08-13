'use client';

import { Component, ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: (error: Error) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback?.(this.state.error!) || (
          <div className="p-4 bg-[var(--signal-critical)]/10 border border-[var(--signal-critical)] rounded-lg">
            <h2 className="font-semibold text-[var(--signal-critical)]">Something went wrong</h2>
            <p className="text-sm text-[var(--text-secondary)] mt-1">{this.state.error?.message}</p>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
