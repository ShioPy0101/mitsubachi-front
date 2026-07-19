import { useMemo, useState } from "react";

import {
  type AppError,
  formatAppErrorReport,
  isNameConflictAppError,
  isReportableAppError,
} from "../errors/appError";
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
  const nameConflict = isNameConflictAppError(error);
  const reportable = isReportableAppError(error);
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
    <section
      className={`error-report error-report-${error.level}`}
      role={reportable ? "alert" : "status"}
      aria-live="polite"
    >
      <div>
        <strong>{error.message}</strong>
        {nameConflict ? (
          <span>別名を指定すると同じ操作を再実行できます。</span>
        ) : null}
      </div>
      <div className="error-report-actions">
        {nameConflict && onResolveName ? (
          <Button type="button" variant="secondary" onClick={onResolveName}>
            名前を変更
          </Button>
        ) : null}
        {onRetry ? (
          <Button type="button" variant="secondary" onClick={onRetry}>
            再試行
          </Button>
        ) : null}
        {reportable ? (
          <>
            <Button type="button" variant="ghost" onClick={() => setExpanded((value) => !value)}>
              詳細を表示
            </Button>
            <Button type="button" variant="ghost" onClick={() => void copyReport()}>
              エラー内容をコピー
            </Button>
          </>
        ) : null}
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
