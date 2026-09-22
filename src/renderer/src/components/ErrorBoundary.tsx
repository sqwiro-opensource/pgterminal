import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Optional custom fallback (used per tab later). */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ErrorBoundary caught', error, info.componentStack);
  }

  private reset = (): void => this.setState({ error: null });

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-background p-8 text-center">
        <div className="text-[15px] font-semibold">Something went wrong</div>
        <pre className="max-w-[640px] overflow-auto rounded border border-border bg-muted p-3 text-left font-mono text-[12px] text-muted-foreground">
          {error.message}
        </pre>
        <div className="flex gap-2">
          <button
            type="button"
            className="h-7 rounded border border-border bg-background px-3 text-[12.5px] font-medium hover:bg-accent"
            onClick={this.reset}
          >
            Try again
          </button>
          <button
            type="button"
            className="h-7 rounded bg-primary px-3 text-[12.5px] font-medium text-primary-foreground hover:brightness-110"
            onClick={() => location.reload()}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
