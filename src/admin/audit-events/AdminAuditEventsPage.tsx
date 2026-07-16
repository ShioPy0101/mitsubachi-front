import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";

import { adminKeys, fetchAuditEvents } from "../api";
import {
  AdminFrame,
  AdminSearch,
  PaginatedState,
  adminQueryString,
} from "../components/AdminScaffold";
import {
  AuditTargetLink,
  formatAuditAction,
  formatAuditOutcome,
  formatDateTime,
} from "../components/auditFormat";

export function AdminAuditEventsPage() {
  const [params] = useSearchParams();
  const queryString = adminQueryString(params);
  const query = useQuery({
    queryKey: adminKeys.auditEvents(queryString),
    queryFn: () => fetchAuditEvents(queryString),
  });
  return (
    <AdminFrame title="監査イベント">
      <AdminSearch
        fields={[
          { name: "actor_user_id", label: "実行者ID" },
          { name: "organization_id", label: "組織ID" },
          { name: "action", label: "イベント" },
          {
            name: "outcome",
            label: "結果",
            options: [
              { value: "success", label: "成功" },
              { value: "failure", label: "失敗" },
              { value: "denied", label: "拒否" },
            ],
          },
          { name: "target_type", label: "対象種別" },
          { name: "occurred_from", label: "開始日時", type: "datetime-local" },
          { name: "occurred_to", label: "終了日時", type: "datetime-local" },
        ]}
      />
      <PaginatedState query={query}>
        {(data) => (
          <table className="admin-table">
            <thead>
              <tr>
                <th>発生日時</th>
                <th>イベント</th>
                <th>結果</th>
                <th>実行者</th>
                <th>組織</th>
                <th>対象</th>
                <th>接続元</th>
                <th>詳細</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((event) => (
                <tr key={event.id}>
                  <td>{formatDateTime(event.occurred_at)}</td>
                  <td>{formatAuditAction(event.action)}</td>
                  <td>{formatAuditOutcome(event.outcome)}</td>
                  <td>{event.actor_email ?? event.actor_user_id ?? "未認証/不明"}</td>
                  <td>{event.organization_name ?? event.organization_id ?? "—"}</td>
                  <td>
                    <AuditTargetLink
                      targetType={event.target_type}
                      targetId={event.target_id}
                    />
                  </td>
                  <td>{event.ip_address ?? "—"}</td>
                  <td>
                    <Link to={`/admin/audit-events/${event.id}`}>詳細</Link>
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
