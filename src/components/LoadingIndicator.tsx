import { Loader2 } from "lucide-react";

export function LoadingIndicator({ label = "読み込み中" }: { label?: string }) {
  return (
    <div className="loading-indicator" role="status" aria-live="polite">
      <Loader2 className="spin" size={18} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
