import { Component, type ErrorInfo, type ReactNode } from 'react';
import { toast } from 'sonner';

interface Props {
  tabId: string;
  children: ReactNode;
}
interface State {
  error: Error | null;
  stack?: string;
}

/** Per-tab boundary: a crash in one tab never takes the shell down. */
export class TabErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`tab ${this.props.tabId} crashed`, error, info.componentStack);
    this.setState({ stack: info.componentStack ?? undefined });
  }

  override componentDidUpdate(prev: Props): void {
    if (prev.tabId !== this.props.tabId && this.state.error) this.setState({ error: null, stack: undefined });
  }

  private reset = (): void => this.setState({ error: null, stack: undefined });

  private copy = async (): Promise<void> => {
    const { error, stack } = this.state;
    const text = `${error?.name}: ${error?.message}\n${error?.stack ?? ''}\n${stack ?? ''}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Error copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="text-[14px] font-semibold">This tab crashed</div>
        <pre className="max-w-[640px] overflow-auto rounded border border-border bg-muted p-3 text-left font-mono text-[12px] text-muted-foreground">
          {error.message}
        </pre>
        <div className="flex gap-2">
          <button
            type="button"
            className="h-7 rounded bg-primary px-3 text-[12.5px] font-medium text-primary-foreground hover:brightness-110"
            onClick={this.reset}
          >
            Reload tab
          </button>
          <button
            type="button"
            className="h-7 rounded border border-border bg-background px-3 text-[12.5px] font-medium hover:bg-accent"
            onClick={this.copy}
          >
            Copy error
          </button>
        </div>
      </div>
    );
  }
}
