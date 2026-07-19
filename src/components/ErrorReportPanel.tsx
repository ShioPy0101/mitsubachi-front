import { useMemo, useState } from "react";

import { type AppError, formatAppErrorReport } from "../errors/appError";
import { Button } from "./Button";

export function ErrorReportPanel({
  error,
  onRetry,
  onResolveName,
}: {
  error: AppError;
  onRetry?: () => void;
  onResolveName?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">("idle");
  const [note, setNote] = useState("");
  const reportText = useMemo(() => formatAppErrorReport(error, note), [error, note]);

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopyState("copied");
    } catch {
      setExpanded(true);
      setCopyState("manual");
    }
  }

  return (
    <section className="error-report" role="alert" aria-live="polite">
      <div>
        <strong>{error.message}</strong>
        {error.requestId ? <span>Request ID: {error.requestId}</span> : null}
      </div>
      <div className="error-report-actions">
        {error.code === "duplicate_name" && onResolveName ? (
          <Button type="button" variant="secondary" onClick={onResolveName}>
            名前を変更
          </Button>
        ) : null}
        {onRetry ? (
          <Button type="button" variant="secondary" onClick={onRetry}>
            再試行
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={() => setExpanded((value) => !value)}>
          詳細を表示
        </Button>
        <Button type="button" variant="ghost" onClick={() => void copyReport()}>
          エラー内容をコピー
        </Button>
      </div>
      {copyState === "copied" ? <p className="form-message">コピーしました。</p> : null}
      {expanded ? (
        <div className="error-report-details">
          <label className="field">
            <span>補足</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          <label className="field">
            <span>手動コピー用エラー内容</span>
            <textarea readOnly value={reportText} />
          </label>
          {copyState === "manual" ? (
            <p className="form-message">コピーできませんでした。上の内容を手動で選択してください。</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
