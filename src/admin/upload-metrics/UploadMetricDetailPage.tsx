import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { adminKeys, fetchUploadMetric } from "../api";
import { AdminFrame, DetailList, QueryState } from "../components/AdminScaffold";
import { formatCompactDateTime } from "../components/logFormat";
import { formatBytes } from "./UploadMetricsPage";

export function UploadMetricDetailPage() {
  const id = useParams().uploadSessionId ?? "";
  const query = useQuery({
    queryKey: adminKeys.uploadMetric(id),
    queryFn: () => fetchUploadMetric(id),
    enabled: Boolean(id),
  });
  return (
    <AdminFrame
      title="アップロード統計詳細"
      actions={<Link to="/system-admin/upload-metrics">一覧へ戻る</Link>}
    >
      <QueryState query={query}>
        {(metric) => (
          <>
            <DetailList
              items={[
                { label: "セッションID", value: metric.upload_session_id },
                { label: "開始", value: formatCompactDateTime(metric.started_at) },
                {
                  label: "完了",
                  value: metric.completed_at
                    ? formatCompactDateTime(metric.completed_at)
                    : "—",
                },
                { label: "Organization", value: metric.organization_name },
                { label: "ユーザー", value: metric.user_name },
                { label: "状態", value: metric.status },
                { label: "要確認", value: metric.needs_review.join("、") || "なし" },
                { label: "総容量", value: formatBytes(metric.total_bytes) },
                {
                  label: "成功 / 失敗",
                  value: `${metric.completed_files} / ${metric.failed_files}`,
                },
                {
                  label: "サイズ分布",
                  value: `<1MB ${metric.under_1mb_count}、1〜100MB ${metric.between_1mb_and_100mb_count}、100MB〜1GB ${metric.between_100mb_and_1gb_count}、1GB以上 ${metric.over_1gb_count}`,
                },
                { label: "進捗停止", value: metric.progress_stall_count },
                {
                  label: "Long Task",
                  value: `${metric.long_task_count}件 / ${metric.long_task_total_duration_ms}ms`,
                },
                {
                  label: "バックグラウンド",
                  value: `${metric.background_duration_ms}ms`,
                },
                {
                  label: "frontend / backend",
                  value: `${metric.frontend_version ?? "不明"} / ${metric.backend_version ?? "不明"}`,
                },
                {
                  label: "HTTP status",
                  value: JSON.stringify(metric.http_status_counts),
                },
                {
                  label: "エラーコード",
                  value: JSON.stringify(metric.error_code_counts),
                },
                {
                  label: "Rails request ID",
                  value: metric.request_ids?.join(", ") || "—",
                },
              ]}
            />
            {metric.related_operation_logs?.length ? (
              <section>
                <h3>関連する操作履歴</h3>
                <ul>
                  {metric.related_operation_logs.map((log) => (
                    <li key={log.id}>
                      <Link to={`/system-admin/operation-logs/${log.id}`}>
                        {log.operation_type} — {formatCompactDateTime(log.occurred_at)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </QueryState>
    </AdminFrame>
  );
}
