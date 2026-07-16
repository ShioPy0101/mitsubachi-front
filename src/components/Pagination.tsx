import { ChevronLeft, ChevronRight } from "lucide-react";

import type { AdminMeta } from "../api/schemas";
import { Button } from "./Button";

export function Pagination({
  meta,
  onPageChange,
  onPerPageChange,
}: {
  meta: AdminMeta;
  onPageChange: (page: number) => void;
  onPerPageChange?: (perPage: number) => void;
}) {
  return (
    <nav className="pagination" aria-label="ページネーション">
      <div className="pagination-summary">
        <span>総件数 {meta.total_count}</span>
        <span>
          {meta.current_page} / {Math.max(meta.total_pages, 1)} ページ
        </span>
      </div>
      {onPerPageChange ? (
        <label className="pagination-size">
          <span>表示件数</span>
          <select
            value={meta.per_page}
            onChange={(event) => onPerPageChange(Number(event.target.value))}
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
      ) : null}
      <div className="pagination-actions">
        <Button
          type="button"
          variant="secondary"
          disabled={meta.current_page <= 1}
          onClick={() => onPageChange(meta.current_page - 1)}
        >
          <ChevronLeft size={16} aria-hidden="true" />
          前へ
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={meta.current_page >= meta.total_pages}
          onClick={() => onPageChange(meta.current_page + 1)}
        >
          次へ
          <ChevronRight size={16} aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
