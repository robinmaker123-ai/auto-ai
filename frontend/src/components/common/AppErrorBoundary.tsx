import { Component, type ErrorInfo, type ReactNode } from "react";

type AppErrorBoundaryProps = {
  children: ReactNode;
  resetKey?: string;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

const CHUNK_RELOAD_KEY = "auto-ai-chunk-reload-attempted";

function isChunkLoadError(error: Error) {
  const message = `${error.name} ${error.message}`.toLowerCase();
  return (
    message.includes("chunkloaderror") ||
    message.includes("failed to fetch dynamically imported module") ||
    message.includes("importing a module script failed") ||
    message.includes("loading chunk")
  );
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidMount() {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  }

  componentDidUpdate(previousProps: AppErrorBoundaryProps) {
    if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Auto-AI] App render failed.", error, info);
    if (!isChunkLoadError(error)) return;
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1") return;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
    window.setTimeout(() => window.location.reload(), 100);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const chunkError = isChunkLoadError(this.state.error);
    return (
      <main className="app-error-page">
        <section className="app-error-card">
          <p className="settings-eyebrow">Auto-AI</p>
          <h1>{chunkError ? "Page failed to load" : "Something went wrong"}</h1>
          <p>
            {chunkError
              ? "The app could not load this page file. Retry or return to the main workspace."
              : "The page could not render. Retry or return to the main workspace."}
          </p>
          <div className="app-error-actions">
            <button className="btn-primary" type="button" onClick={() => this.setState({ error: null })}>
              Retry
            </button>
            <a className="btn-secondary" href="/chat">
              Return to chat
            </a>
          </div>
        </section>
      </main>
    );
  }
}
