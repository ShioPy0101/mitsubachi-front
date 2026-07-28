import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  adminKeys,
  adminOrganizationIdFromParam,
  adminUiPath,
  fetchSystemEvent,
} from "../api";
import { AdminFrame, DetailList, QueryState } from "../components/AdminScaffold";
import { formatDateTime } from "../components/logFormat";
export function SystemEventDetailPage() {
  const params = useParams();
  const id = Number(params.systemEventId);
  const organizationId = adminOrganizationIdFromParam(params.organizationId);
  const query = useQuery({
    queryKey: adminKeys.systemEvent(organizationId, id),
    queryFn: () => fetchSystemEvent(id, organizationId),
    enabled: Number.isFinite(id),
  });
  return (
    <AdminFrame
      title="システムイベント詳細"
      actions={
        <Link to={adminUiPath(organizationId, "/system-events")}>一覧へ戻る</Link>
      }
    >
      <QueryState query={query}>
        {(event) => (
          <DetailList
            items={[
              { label: "発生日時", value: formatDateTime(event.occurred_at) },
              { label: "Event type", value: event.event_type },
              { label: "Severity", value: event.severity },
              { label: "Source", value: event.source },
              {
                label: "対象",
                value: `${event.target.type ?? "—"} #${event.target.id ?? "—"}`,
              },
              { label: "Request ID", value: event.request_id },
              ...(organizationId === null
                ? [
                    { label: "Related user", value: event.related_user_id },
                    { label: "Job ID", value: event.job_id },
                    { label: "Trace ID", value: event.trace_id },
                    {
                      label: "Error",
                      value: [event.error_class, event.error_message]
                        .filter(Boolean)
                        .join(": "),
                    },
                    {
                      label: "Metadata",
                      value: <pre>{JSON.stringify(event.metadata ?? {}, null, 2)}</pre>,
                    },
                  ]
                : []),
            ]}
          />
        )}
      </QueryState>
    </AdminFrame>
  );
}
