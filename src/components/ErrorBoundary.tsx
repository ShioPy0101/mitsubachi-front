import { Component, type ErrorInfo, type ReactNode } from "react";

import { normalizeAppError, type AppError } from "../errors/appError";
import { ErrorReportPanel } from "./ErrorReportPanel";

type Props = {
  children: ReactNode;
};

type State = {
  error: AppError | null;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return {
      error: normalizeAppError(error, {
        operation: "画面表示",
        page: window.location.pathname,
      }),
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("React error boundary caught an error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="state-page">
        <h1>エラーが発生しました</h1>
        <p>操作をやり直しても解決しない場合は、エラー内容を開発者へ送ってください。</p>
        <ErrorReportPanel
          error={this.state.error}
          onRetry={() => window.location.reload()}
        />
      </main>
    );
  }
}
