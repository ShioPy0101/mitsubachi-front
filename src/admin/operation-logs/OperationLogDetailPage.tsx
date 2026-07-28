import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  adminKeys,
  adminOrganizationIdFromParam,
  adminUiPath,
  fetchOperationLog,
} from "../api";
import { AdminFrame, DetailList, QueryState } from "../components/AdminScaffold";
import {
  formatAuditAction,
  formatAuditOutcome,
  formatDateTime,
} from "../components/logFormat";

export function OperationLogDetailPage() {
  const params = useParams();
  const id = Number(params.operationLogId);
  const organizationId = adminOrganizationIdFromParam(params.organizationId);
  const query = useQuery({
    queryKey: adminKeys.operationLog(organizationId, id),
    queryFn: () => fetchOperationLog(id, organizationId),
    enabled: Number.isFinite(id),
  });
  return (
    <AdminFrame
      title="操作履歴詳細"
      actions={
        <Link to={adminUiPath(organizationId, "/operation-logs")}>一覧へ戻る</Link>
      }
    >
      <QueryState query={query}>
        {(log) => (
          <DetailList
            items={[
              { label: "発生日時", value: formatDateTime(log.occurred_at) },
              {
                label: "操作",
                value: `${formatAuditAction(log.operation_type)} (${log.operation_type})`,
              },
              { label: "結果", value: formatAuditOutcome(log.result) },
              { label: "操作者", value: log.actor.display_name ?? log.actor.kind },
              {
                label: "対象",
                value:
                  log.target.display_name ?? `${log.target.type} #${log.target.id}`,
              },
              { label: "Request ID", value: log.request_id },
              { label: "User-Agent", value: log.user_agent },
              {
                label: "変更内容",
                value: <pre>{JSON.stringify(log.change_set, null, 2)}</pre>,
              },
              {
                label: "メタデータ",
                value: <pre>{JSON.stringify(log.metadata, null, 2)}</pre>,
              },
            ]}
          />
        )}
      </QueryState>
    </AdminFrame>
  );
}
