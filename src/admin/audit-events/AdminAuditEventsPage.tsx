import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";

import { StatusBadge } from "../../components/StatusBadge";
import { adminKeys, fetchAuditEvents, type AuditEvent } from "../api";
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
  formatCompactDateTime,
  formatAuditOutcome,
} from "../components/auditFormat";

export function AdminAuditEventsPage() {
  const [params] = useSearchParams();
  const queryString = adminQueryString(params);
  const query = useQuery({
    queryKey: adminKeys.auditEvents(queryString),
    queryFn: () => fetchAuditEvents(queryString),
  });
  return (
    <AdminFrame title="システムイベント">
      <AdminSearch
        busy={query.isFetching}
        fields={[
          {
            name: "actor_user_id",
            label: "実行者ID",
            placeholder: "実行したユーザーID",
          },
          {
            name: "organization_id",
            label: "組織ID",
            placeholder: "対象組織ID",
          },
          {
            name: "action",
            label: "イベント",
            placeholder: "例: drive_item.create",
          },
          {
            name: "outcome",
            label: "結果",
            options: [
              { value: "success", label: "成功" },
              { value: "failure", label: "失敗" },
              { value: "denied", label: "拒否" },
            ],
          },
          { name: "target_type", label: "対象種別", placeholder: "例: DriveItem" },
          { name: "occurred_from", label: "開始日時", type: "datetime-local" },
          { name: "occurred_to", label: "終了日時", type: "datetime-local" },
        ]}
      />
      <PaginatedState query={query}>
        {(data) => (
          <div
            className="audit-table-wrapper"
            tabIndex={0}
            aria-label="監査イベント一覧の横スクロール領域"
          >
            <table className="admin-table audit-events-table">
              <caption>システムイベント一覧</caption>
              <colgroup>
                <col className="audit-col-time" />
                <col className="audit-col-action" />
                <col className="audit-col-outcome" />
                <col className="audit-col-actor" />
                <col className="audit-col-organization" />
                <col className="audit-col-target" />
                <col className="audit-col-ip" />
                <col className="audit-col-detail" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">発生日時</th>
                  <th scope="col">イベント</th>
                  <th scope="col">結果</th>
                  <th scope="col">実行者</th>
                  <th scope="col">組織</th>
                  <th scope="col">対象</th>
                  <th scope="col">接続元</th>
                  <th scope="col">詳細</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((event) => (
                  <AuditEventRow key={event.id} event={event} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PaginatedState>
    </AdminFrame>
  );
}

function AuditEventRow({ event }: { event: AuditEvent }) {
  const occurredAt = formatCompactDateTime(event.occurred_at);
  const actionLabel = formatAuditAction(event.action);
  return (
    <tr>
      <td className="audit-cell-time" title={occurredAt}>
        {occurredAt}
      </td>
      <td title={`${actionLabel} (${event.action})`}>
        <CellStack primary={actionLabel} secondary={event.action} monoSecondary />
      </td>
      <td>
        <OutcomeBadge outcome={event.outcome} />
      </td>
      <td title={event.actor_email ?? undefined}>
        <CellStack
          primary={event.actor_email ?? "未認証/システム"}
          secondary={event.actor_user_id ? `User #${event.actor_user_id}` : "IDなし"}
        />
      </td>
      <td title={event.organization_name ?? undefined}>
        <CellStack
          primary={event.organization_name ?? "—"}
          secondary={
            event.organization_id ? `Organization #${event.organization_id}` : "IDなし"
          }
        />
      </td>
      <td>
        <div className="cell-stack">
          <span className="cell-primary">
            <AuditTargetLink
              targetType={event.target_type}
              targetId={event.target_id}
            />
          </span>
          <span className="cell-secondary">
            {event.target_id
              ? `${formatAuditTargetType(event.target_type)} #${event.target_id}`
              : formatAuditTargetType(event.target_type)}
          </span>
        </div>
      </td>
      <td className="cell-mono" title={event.ip_address ?? undefined}>
        {event.ip_address ?? "—"}
      </td>
      <td>
        <Link
          className="button button-secondary audit-detail-button"
          to={`/admin/audit-events/${event.id}`}
          aria-label={`${occurredAt} の監査イベント詳細を表示`}
        >
          詳細
        </Link>
      </td>
    </tr>
  );
}

function CellStack({
  primary,
  secondary,
  monoSecondary = false,
}: {
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  monoSecondary?: boolean;
}) {
  return (
    <div className="cell-stack">
      <span className="cell-primary">{primary}</span>
      {secondary ? (
        <span className={monoSecondary ? "cell-secondary cell-mono" : "cell-secondary"}>
          {secondary}
        </span>
      ) : null}
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const label = formatAuditOutcome(outcome);
  const tone =
    outcome === "success"
      ? "success"
      : outcome === "failure"
        ? "danger"
        : outcome === "denied"
          ? "warning"
          : "neutral";
  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}
