import { Button } from "./Button";

export function ErrorState({
  title = "読み込みに失敗しました",
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="error-state" role="alert">
      <h2>{title}</h2>
      <p>{message ?? "時間をおいて再試行してください。"}</p>
      {onRetry ? (
        <Button type="button" variant="secondary" onClick={onRetry}>
          再試行
        </Button>
      ) : null}
    </div>
  );
}
