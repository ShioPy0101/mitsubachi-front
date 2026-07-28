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
          <table className="admin-table">
            <caption>ファイルアクセス履歴一覧</caption>
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
              {data.data.map((log) => (
                <tr key={log.id}>
                  <td>{formatCompactDateTime(log.occurred_at)}</td>
                  <td>{log.actor.display_name ?? `${log.actor.kind}（削除済み）`}</td>
                  <td>{log.organization_id}</td>
                  <td>{actionLabels[log.action] ?? log.action}</td>
                  <td>{log.drive_item.filename ?? "削除済みファイル"}</td>
                  <td>{String(log.metadata.file_size ?? "—")}</td>
                  <td>{String(log.metadata.content_type ?? "—")}</td>
                  <td>{log.ip_address ?? "—"}</td>
                  <td>
                    <Link
                      to={adminUiPath(organizationId, `/file-access-logs/${log.id}`)}
                    >
                      詳細
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PaginatedState>
    </AdminFrame>
  );
}
