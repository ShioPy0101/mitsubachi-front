import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  adminKeys,
  adminOrganizationIdFromParam,
  adminUiPath,
  fetchDriveItemAccessLogs,
} from "../api";
import {
  AdminFrame,
  AdminSearch,
  PaginatedState,
  adminQueryString,
} from "../components/AdminScaffold";
import { formatCompactDateTime } from "../components/logFormat";

const actionLabels: Record<string, string> = {
  preview: "プレビュー",
  stream: "ストリーミング",
  download: "ダウンロード",
  bulk_download: "一括ダウンロード",
  download_folder: "フォルダダウンロード",
};
export function DriveItemAccessLogsPage() {
  const [params] = useSearchParams();
  const organizationId = adminOrganizationIdFromParam(useParams().organizationId);
  const queryString = adminQueryString(params);
  const query = useQuery({
    queryKey: adminKeys.driveItemAccessLogs(organizationId, queryString),
    queryFn: () => fetchDriveItemAccessLogs(queryString, organizationId),
  });
  return (
    <AdminFrame title="ファイルアクセス履歴">
      <AdminSearch
        busy={query.isFetching}
        fields={[
          ...(organizationId === null
            ? [{ name: "organization_id", label: "Organization" }]
            : []),
          { name: "user_id", label: "ユーザーID" },
          { name: "external_share_id", label: "外部共有ID" },
          { name: "action", label: "アクセス種別" },
          { name: "filename", label: "ファイル名" },
          { name: "ip_address", label: "IPアドレス" },
          { name: "request_id", label: "Request ID" },
          { name: "batch_id", label: "Batch ID" },
        ]}
      />
      <PaginatedState query={query}>
        {(data) => (
          <div
            className="access-log-table-wrapper"
            role="region"
            aria-label="ファイルアクセス履歴一覧"
            tabIndex={0}
          >
            <table className="admin-table access-log-table">
              <caption>ファイルアクセス履歴一覧</caption>
              <colgroup>
                <col className="access-log-col-time" />
                <col className="access-log-col-actor" />
                <col className="access-log-col-organization" />
                <col className="access-log-col-action" />
                <col className="access-log-col-file" />
                <col className="access-log-col-size" />
                <col className="access-log-col-content-type" />
                <col className="access-log-col-ip" />
                <col className="access-log-col-detail" />
              </colgroup>
              <thead>
                <tr>
                  <th>発生日時</th>
                  <th>利用者</th>
                  <th>Organization</th>
                  <th>アクセス種別</th>
                  <th>ファイル名</th>
                  <th>サイズ</th>
                  <th>Content-Type</th>
                  <th>IPアドレス</th>
                  <th>詳細</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((log) => {
                  const actor =
                    log.actor.display_name ?? `${log.actor.kind}（削除済み）`;
                  const organization = log.organization_name ?? "—";
                  const action = actionLabels[log.action] ?? log.action;
                  const filename = log.drive_item.filename ?? "削除済みファイル";
                  const contentType = metadataText(log.metadata.content_type);
                  return (
                    <tr key={log.id}>
                      <td className="access-log-nowrap">
                        {formatCompactDateTime(log.occurred_at)}
                      </td>
                      <td className="access-log-truncate" title={actor}>
                        {actor}
                      </td>
                      <td className="access-log-truncate" title={organization}>
                        {organization}
                      </td>
                      <td className="access-log-truncate" title={action}>
                        {action}
                      </td>
                      <td className="access-log-truncate" title={filename}>
                        {filename}
                      </td>
                      <td className="access-log-nowrap">
                        {formatFileSize(log.metadata.file_size)}
                      </td>
                      <td className="access-log-truncate" title={contentType}>
                        {contentType}
                      </td>
                      <td className="access-log-nowrap">{log.ip_address ?? "—"}</td>
                      <td>
                        <Link
                          to={adminUiPath(
                            organizationId,
                            `/file-access-logs/${log.id}`,
                          )}
                        >
                          詳細
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PaginatedState>
    </AdminFrame>
  );
}

function metadataText(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "—";
}

function formatFileSize(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "—";

  const units = ["B", "KB", "MB", "GB"] as const;
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const digits = unitIndex === 0 || size >= 10 ? 0 : 1;
  return `${new Intl.NumberFormat("ja-JP", { maximumFractionDigits: digits }).format(size)} ${units[unitIndex]}`;
}
