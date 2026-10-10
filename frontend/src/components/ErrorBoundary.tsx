import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  failed: boolean;
}

/** Replaces a blank white screen with a way out when a page crashes while rendering. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render failed', error, info.componentStack);
  }

  componentDidUpdate(previous: { resetKey?: string }) {
    // Navigating to another page clears the error.
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="container-page py-28 text-center">
        <h1 className="text-3xl font-medium">Something went wrong on this page.</h1>
        <p className="mt-3 text-muted">Your saved answers are still in this tab. Reloading usually fixes it.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => window.location.reload()} className="inline-flex h-11 items-center rounded-full bg-ink px-5 font-medium text-paper hover:bg-signal-strong">
            Reload
          </button>
          <a href="/" className="inline-flex h-11 items-center rounded-full border border-line bg-card px-5 font-medium hover:border-ink">Go home</a>
        </div>
      </div>
    );
  }
}
