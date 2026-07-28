import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  adminKeys,
  adminOrganizationIdFromParam,
  adminUiPath,
  fetchOperationLogs,
} from "../api";
import {
  AdminFrame,
  AdminSearch,
  PaginatedState,
  adminQueryString,
} from "../components/AdminScaffold";
import {
  formatAuditAction,
  formatAuditOutcome,
  formatCompactDateTime,
} from "../components/logFormat";

export function OperationLogsPage() {
  const [params] = useSearchParams();
  const organizationId = adminOrganizationIdFromParam(useParams().organizationId);
  const queryString = adminQueryString(params);
  const query = useQuery({
    queryKey: adminKeys.operationLogs(organizationId, queryString),
    queryFn: () => fetchOperationLogs(queryString, organizationId),
  });
  return (
    <AdminFrame title="操作履歴">
      <AdminSearch
        busy={query.isFetching}
        fields={[
          ...(organizationId === null
            ? [{ name: "organization_id", label: "Organization" }]
            : []),
          { name: "actor_user_id", label: "操作者ID" },
          { name: "operation_type", label: "操作種別" },
          {
            name: "result",
            label: "結果",
            options: [
              { value: "success", label: "成功" },
              { value: "failure", label: "失敗" },
              { value: "denied", label: "拒否" },
            ],
          },
          { name: "target_type", label: "対象種別" },
          { name: "request_id", label: "Request ID" },
          { name: "occurred_from", label: "開始日時", type: "datetime-local" },
          { name: "occurred_to", label: "終了日時", type: "datetime-local" },
        ]}
      />
      <PaginatedState query={query}>
        {(data) => (
          <table className="admin-table">
            <caption>操作履歴一覧</caption>
            <thead>
              <tr>
                <th>発生日時</th>
                <th>操作者</th>
                <th>Organization</th>
                <th>操作内容</th>
                <th>結果</th>
                <th>対象</th>
                <th>IPアドレス</th>
                <th>詳細</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((log) => (
                <tr key={log.id}>
                  <td>{formatCompactDateTime(log.occurred_at)}</td>
                  <td>{log.actor.display_name ?? `${log.actor.kind}（削除済み）`}</td>
                  <td>{log.organization_id ?? "—"}</td>
                  <td>{formatAuditAction(log.operation_type)}</td>
                  <td>{formatAuditOutcome(log.result)}</td>
                  <td>
                    {log.target.display_name ??
                      `${log.target.type ?? "対象"} #${log.target.id ?? "削除済み"}`}
                  </td>
                  <td>{log.ip_address ?? "—"}</td>
                  <td>
                    <Link to={adminUiPath(organizationId, `/operation-logs/${log.id}`)}>
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
