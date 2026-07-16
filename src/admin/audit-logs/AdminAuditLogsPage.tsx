import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";

import { adminKeys, fetchAuditLogs } from "../api";
import {
  AdminFrame,
  AdminSearch,
  PaginatedState,
  adminQueryString,
} from "../components/AdminScaffold";
import {
  AuditTargetLink,
  formatAuditAction,
  formatAuditTargetType,
  formatDateTime,
  summarizeChangeSet,
} from "../components/auditFormat";

export function AdminAuditLogsPage() {
  const [params] = useSearchParams();
  const queryString = adminQueryString(params);
  const query = useQuery({
    queryKey: adminKeys.auditLogs(queryString),
    queryFn: () => fetchAuditLogs(queryString),
  });
  return (
    <AdminFrame title="管理監査ログ">
      <AdminSearch
        fields={[
          { name: "actor_user_id", label: "操作者ID" },
          { name: "organization_id", label: "組織ID" },
          { name: "action", label: "操作" },
          { name: "target_type", label: "対象種別" },
          { name: "created_from", label: "開始日時", type: "datetime-local" },
          { name: "created_to", label: "終了日時", type: "datetime-local" },
        ]}
      />
      <PaginatedState query={query}>
        {(data) => (
          <table className="admin-table">
            <thead>
              <tr>
                <th>発生日時</th>
                <th>操作者</th>
                <th>組織</th>
                <th>操作</th>
                <th>対象種別</th>
                <th>対象</th>
                <th>変更概要</th>
                <th>詳細</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((log) => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.created_at)}</td>
                  <td>{log.actor_email ?? log.actor_user_id ?? "不明"}</td>
                  <td>{log.organization_name ?? log.organization_id ?? "—"}</td>
                  <td>{formatAuditAction(log.action)}</td>
                  <td>{formatAuditTargetType(log.target_type)}</td>
                  <td>
                    <AuditTargetLink
                      targetType={log.target_type}
                      targetId={log.target_id}
                    />
                  </td>
                  <td>{summarizeChangeSet(log.change_set)}</td>
                  <td>
                    <Link to={`/admin/audit-logs/${log.id}`}>詳細</Link>
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
