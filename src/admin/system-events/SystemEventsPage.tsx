import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { StatusBadge } from "../../components/StatusBadge";
import {
  adminKeys,
  adminOrganizationIdFromParam,
  adminUiPath,
  fetchSystemEvents,
} from "../api";
import {
  AdminFrame,
  AdminSearch,
  PaginatedState,
  adminQueryString,
} from "../components/AdminScaffold";
import { formatCompactDateTime } from "../components/logFormat";

const eventLabels: Record<string, string> = {
  "storage.file_missing": "ファイル実体が見つかりません",
  "mail.delivery_failed": "メール送信に失敗",
  "background_job.failed": "バックグラウンド処理に失敗",
};
export function SystemEventsPage() {
  const [params] = useSearchParams();
  const organizationId = adminOrganizationIdFromParam(useParams().organizationId);
  const queryString = adminQueryString(params);
  const query = useQuery({
    queryKey: adminKeys.systemEvents(organizationId, queryString),
    queryFn: () => fetchSystemEvents(queryString, organizationId),
  });
  return (
    <AdminFrame title="システムイベント">
      <AdminSearch
        busy={query.isFetching}
        fields={[
          ...(organizationId === null
            ? [{ name: "organization_id", label: "Organization" }]
            : []),
          {
            name: "severity",
            label: "Severity",
            options: ["info", "warning", "error", "critical"].map((value) => ({
              value,
              label: value,
            })),
          },
          { name: "source", label: "Source" },
          { name: "event_type", label: "Event type" },
          { name: "request_id", label: "Request ID" },
          { name: "job_id", label: "Job ID" },
          { name: "trace_id", label: "Trace ID" },
        ]}
      />
      <PaginatedState query={query}>
        {(data) => (
          <table className="admin-table">
            <caption>システムイベント一覧</caption>
            <thead>
              <tr>
                <th>発生日時</th>
                <th>Severity</th>
                <th>Source</th>
                <th>Event type</th>
                <th>Organization</th>
                <th>対象</th>
                <th>概要</th>
                <th>詳細</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((event) => (
                <tr key={event.id}>
                  <td>{formatCompactDateTime(event.occurred_at)}</td>
                  <td>
                    <StatusBadge
                      tone={
                        event.severity === "critical" || event.severity === "error"
                          ? "danger"
                          : event.severity === "warning"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {event.severity}
                    </StatusBadge>
                  </td>
                  <td>{event.source}</td>
                  <td>{eventLabels[event.event_type] ?? event.event_type}</td>
                  <td>{event.organization_id ?? "システム全体"}</td>
                  <td>
                    {event.target.type
                      ? `${event.target.type} #${event.target.id ?? "削除済み"}`
                      : "—"}
                  </td>
                  <td>
                    {event.summary ?? eventLabels[event.event_type] ?? event.event_type}
                  </td>
                  <td>
                    <Link
                      to={adminUiPath(organizationId, `/system-events/${event.id}`)}
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
