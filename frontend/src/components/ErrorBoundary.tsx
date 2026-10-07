import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from './ui/States';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback. Receives a reset callback. */
  fallback?: (reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** Catches render-time exceptions so a single failure never blanks the app. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface details in the console for diagnostics; the UI stays friendly.
    console.error('Unhandled UI error', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.reset);
    return (
      <div className="mx-auto max-w-2xl p-4">
        <ErrorState
          title="Something went wrong"
          description="An unexpected error interrupted this page. You can try again or reload the app."
          onRetry={this.reset}
        />
      </div>
    );
  }
}
