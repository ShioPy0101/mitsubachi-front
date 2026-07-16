import { ChevronLeft, ChevronRight } from "lucide-react";

import type { AdminMeta } from "../api/schemas";
import { Button } from "./Button";

export function Pagination({
  meta,
  onPageChange,
}: {
  meta: AdminMeta;
  onPageChange: (page: number) => void;
}) {
  return (
    <nav className="pagination" aria-label="ページネーション">
      <Button
        type="button"
        variant="secondary"
        disabled={meta.current_page <= 1}
        onClick={() => onPageChange(meta.current_page - 1)}
      >
        <ChevronLeft size={16} aria-hidden="true" />
        前へ
      </Button>
      <span>
        {meta.current_page} / {Math.max(meta.total_pages, 1)}
      </span>
      <Button
        type="button"
        variant="secondary"
        disabled={meta.current_page >= meta.total_pages}
        onClick={() => onPageChange(meta.current_page + 1)}
      >
        次へ
        <ChevronRight size={16} aria-hidden="true" />
      </Button>
    </nav>
  );
}
