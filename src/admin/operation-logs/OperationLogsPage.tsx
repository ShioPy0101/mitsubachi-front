import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  type OperationLog,
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
          <div
            className="operation-log-table-wrapper"
            role="region"
            aria-label="操作履歴一覧"
            tabIndex={0}
          >
            <table className="admin-table operation-log-table">
              <caption>操作履歴一覧</caption>
              <colgroup>
                <col className="operation-log-col-time" />
                <col className="operation-log-col-actor" />
                <col className="operation-log-col-organization" />
                <col className="operation-log-col-action" />
                <col className="operation-log-col-result" />
                <col className="operation-log-col-target" />
                <col className="operation-log-col-ip" />
                <col className="operation-log-col-detail" />
              </colgroup>
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
                {data.data.map((log) => {
                  const actor = operationActor(log);
                  const organization = operationOrganization(log);
                  const action = formatAuditAction(log.operation_type);
                  const target = operationTarget(log);
                  return (
                    <tr key={log.id}>
                      <td className="operation-log-nowrap">
                        {formatCompactDateTime(log.occurred_at)}
                      </td>
                      <td className="operation-log-truncate" title={actor}>
                        {actor}
                      </td>
                      <td className="operation-log-truncate" title={organization}>
                        {organization}
                      </td>
                      <td className="operation-log-truncate" title={action}>
                        {action}
                      </td>
                      <td className="operation-log-nowrap">
                        {formatAuditOutcome(log.result)}
                      </td>
                      <td className="operation-log-truncate" title={target}>
                        {target}
                      </td>
                      <td className="operation-log-nowrap">{log.ip_address ?? "—"}</td>
                      <td className="operation-log-nowrap">
                        <Link
                          to={adminUiPath(organizationId, `/operation-logs/${log.id}`)}
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

function operationActor(log: OperationLog) {
  return (
    log.actor.display_name ??
    metadataText(log, "actor_display_name") ??
    metadataText(log, "actor_email") ??
    `${log.actor.kind}（削除済み）`
  );
}

function operationOrganization(log: OperationLog) {
  return (
    log.organization_name ??
    metadataText(log, "organization_name") ??
    "削除済みOrganization"
  );
}

function operationTarget(log: OperationLog) {
  const name = log.target.display_name ?? metadataText(log, "target_name");
  const deleted = ["drive_item.delete", "drive_item.deleted"].includes(
    log.operation_type,
  );
  const purged = ["drive_item.purge", "drive_item.purged"].includes(log.operation_type);
  if (name) {
    if (purged) return `${name}（完全削除済み）`;
    if (deleted) return `${name}（削除済み）`;
    return name;
  }

  const type = log.target.type ?? metadataText(log, "target_type") ?? "対象";
  const id = log.target.id ?? metadataText(log, "target_id") ?? "不明";
  const suffix = purged ? "完全削除済み" : "削除済み";
  return `${type} #${id}（${suffix}）`;
}

function metadataText(log: OperationLog, key: string) {
  const value = log.metadata[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}
