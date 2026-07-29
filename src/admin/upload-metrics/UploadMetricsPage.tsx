import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";

import { EmptyState } from "../../components/EmptyState";
import { StatusBadge } from "../../components/StatusBadge";
import {
  adminKeys,
  fetchUploadMetricSummary,
  fetchUploadMetricTimeseries,
  fetchUploadMetrics,
  type UploadMetric,
} from "../api";
import {
  AdminFrame,
  AdminSearch,
  PaginatedState,
  QueryState,
  adminQueryString,
} from "../components/AdminScaffold";
import { formatCompactDateTime } from "../components/logFormat";

export function UploadMetricsPage() {
  const [params] = useSearchParams();
  const queryString = adminQueryString(params);
  const aggregateParams = new URLSearchParams(params);
  aggregateParams.delete("page");
  aggregateParams.delete("per_page");
  const aggregateQuery = `?${aggregateParams.toString()}`;
  const list = useQuery({
    queryKey: adminKeys.uploadMetrics(queryString),
    queryFn: () => fetchUploadMetrics(queryString),
  });
  const summary = useQuery({
    queryKey: [...adminKeys.uploadMetrics(aggregateQuery), "summary"],
    queryFn: () => fetchUploadMetricSummary(aggregateQuery),
  });
  const timeseries = useQuery({
    queryKey: [...adminKeys.uploadMetrics(aggregateQuery), "timeseries"],
    queryFn: () => fetchUploadMetricTimeseries(aggregateQuery),
  });

  return (
    <AdminFrame title="アップロード統計">
      <AdminSearch
        busy={list.isFetching || summary.isFetching || timeseries.isFetching}
        fields={[
          {
            name: "period",
            label: "期間",
            options: [
              { value: "24h", label: "24時間" },
              { value: "7d", label: "7日" },
              { value: "30d", label: "30日" },
            ],
          },
          { name: "from", label: "開始日時", type: "datetime-local" },
          { name: "to", label: "終了日時", type: "datetime-local" },
          { name: "organization_id", label: "Organization ID", type: "number" },
          { name: "user_id", label: "ユーザーID", type: "number" },
          {
            name: "status",
            label: "状態",
            options: [
              "in_progress",
              "completed",
              "completed_with_errors",
              "failed",
              "cancelled",
              "abandoned",
            ].map((value) => ({ value, label: value })),
          },
          {
            name: "upload_kind",
            label: "種別",
            options: ["single", "multiple", "folder"].map((value) => ({
              value,
              label: kindLabel(value),
            })),
          },
          {
            name: "size_band",
            label: "サイズ帯",
            options: [
              { value: "under_1mb", label: "1MB未満" },
              { value: "1mb_to_100mb", label: "1MB〜100MB" },
              { value: "100mb_to_1gb", label: "100MB〜1GB" },
              { value: "over_1gb", label: "1GB以上" },
            ],
          },
          { name: "error_code", label: "エラーコード" },
          { name: "minimum_bytes", label: "最低容量（bytes）", type: "number" },
          { name: "minimum_files", label: "最低ファイル数", type: "number" },
        ]}
      />

      <QueryState query={summary}>
        {(data) => (
          <section className="upload-metric-cards" aria-label="選択期間の概要">
            <MetricCard label="セッション数" value={formatNumber(data.session_count)} />
            <MetricCard label="総容量" value={formatBytes(data.total_bytes)} />
            <MetricCard label="総ファイル数" value={formatNumber(data.total_files)} />
            <MetricCard
              label="セッション成功率"
              value={formatRate(data.session_success_rate)}
            />
            <MetricCard label="完全失敗" value={formatNumber(data.failed_sessions)} />
            <MetricCard
              label="一部失敗"
              value={formatNumber(data.partial_failure_sessions)}
            />
            <MetricCard
              label="abandoned"
              value={formatNumber(data.abandoned_sessions)}
            />
            <MetricCard
              label="ファイル失敗率"
              value={formatRate(data.file_failure_rate)}
            />
            <MetricCard label="再試行対象率" value={formatRate(data.retry_rate)} />
            <MetricCard
              label="平均実効速度"
              value={formatRateBytes(data.average_throughput_bytes_per_second)}
            />
            <MetricCard
              label="p50実効速度"
              value={formatRateBytes(data.p50_throughput_bytes_per_second)}
            />
            <MetricCard
              label="p95所要時間"
              value={formatDuration(data.p95_elapsed_ms)}
            />
            <MetricCard label="最大容量" value={formatBytes(data.max_upload_bytes)} />
          </section>
        )}
      </QueryState>

      <QueryState query={timeseries} emptyTitle="選択期間の統計はありません。">
        {(data) =>
          data.length === 0 ? (
            <EmptyState title="選択期間の統計はありません。" />
          ) : (
            <div className="upload-metric-charts">
              <MetricChart
                title="アップロード量"
                rows={data.map((row) => ({
                  label: formatCompactDateTime(row.bucket),
                  value: row.total_bytes,
                }))}
                format={formatBytes}
              />
              <MetricChart
                title="要確認セッション"
                rows={data.map((row) => ({
                  label: formatCompactDateTime(row.bucket),
                  value:
                    row.failed_sessions +
                    row.partial_failure_sessions +
                    row.abandoned_sessions,
                }))}
                format={formatNumber}
              />
              <MetricChart
                title="p50実効速度"
                rows={data.map((row) => ({
                  label: formatCompactDateTime(row.bucket),
                  value: row.p50_throughput_bytes_per_second,
                }))}
                format={formatRateBytes}
              />
            </div>
          )
        }
      </QueryState>

      <PaginatedState query={list}>
        {(data) => (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <caption>アップロードセッション一覧</caption>
              <thead>
                <tr>
                  <th>開始日時</th>
                  <th>Organization</th>
                  <th>ユーザー</th>
                  <th>種別</th>
                  <th>状態</th>
                  <th>総容量</th>
                  <th>ファイル</th>
                  <th>成功/失敗</th>
                  <th>再試行</th>
                  <th>所要時間</th>
                  <th>実効速度</th>
                  <th>最終更新</th>
                  <th>詳細</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((metric) => (
                  <MetricRow key={metric.upload_session_id} metric={metric} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PaginatedState>
    </AdminFrame>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="upload-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function MetricChart({
  title,
  rows,
  format,
}: {
  title: string;
  rows: Array<{ label: string; value: number }>;
  format: (value: number) => string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <section className="upload-metric-chart">
      <h3>{title}</h3>
      <div className="upload-metric-bars">
        {rows.map((row) => (
          <div className="upload-metric-bar-row" key={row.label}>
            <span>{row.label}</span>
            <div>
              <i style={{ width: `${Math.max(1, (row.value / max) * 100)}%` }} />
            </div>
            <strong>{format(row.value)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function MetricRow({ metric }: { metric: UploadMetric }) {
  return (
    <tr>
      <td>{formatCompactDateTime(metric.started_at)}</td>
      <td>{metric.organization_name}</td>
      <td>{metric.user_name}</td>
      <td>{kindLabel(metric.upload_kind)}</td>
      <td>
        <StatusBadge
          tone={
            metric.needs_review.length
              ? "warning"
              : metric.status === "completed"
                ? "success"
                : "neutral"
          }
        >
          {metric.needs_review.length
            ? `要確認: ${metric.needs_review.join("・")}`
            : metric.status}
        </StatusBadge>
      </td>
      <td>{formatBytes(metric.total_bytes)}</td>
      <td>{formatNumber(metric.total_files)}</td>
      <td>
        {metric.completed_files} / {metric.failed_files}
      </td>
      <td>{metric.retry_count}</td>
      <td>{formatDuration(metric.elapsed_ms)}</td>
      <td>{formatRateBytes(metric.effective_throughput_bytes_per_second)}</td>
      <td>{formatCompactDateTime(metric.last_observed_at)}</td>
      <td>
        <Link to={`/system-admin/upload-metrics/${metric.upload_session_id}`}>
          詳細
        </Link>
      </td>
    </tr>
  );
}

function kindLabel(value: string) {
  return (
    (
      { single: "単一", multiple: "複数", folder: "フォルダ" } as Record<string, string>
    )[value] ?? value
  );
}
export function formatBytes(value: number) {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${formatNumber(value)} B`;
}
function formatRateBytes(value: number) {
  return `${formatBytes(value)}/s`;
}
function formatNumber(value: number) {
  return new Intl.NumberFormat("ja-JP").format(value);
}
function formatRate(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}
function formatDuration(value: number) {
  return value >= 60_000
    ? `${(value / 60_000).toFixed(1)}分`
    : `${(value / 1000).toFixed(1)}秒`;
}
