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
              {
                label: "操作者",
                value:
                  log.actor.display_name ??
                  metadataText(log.metadata, "actor_display_name") ??
                  metadataText(log.metadata, "actor_email") ??
                  log.actor.kind,
              },
              {
                label: "Organization",
                value:
                  log.organization_name ??
                  metadataText(log.metadata, "organization_name") ??
                  "削除済みOrganization",
              },
              {
                label: "対象",
                value:
                  log.target.display_name ??
                  metadataText(log.metadata, "target_name") ??
                  `${log.target.type ?? metadataText(log.metadata, "target_type") ?? "対象"} #${log.target.id ?? metadataText(log.metadata, "target_id") ?? "不明"}（削除済み）`,
              },
              {
                label: "エラーコード",
                value: metadataText(log.metadata, "error_code"),
              },
              {
                label: "エラーメッセージ",
                value: metadataText(log.metadata, "error_message"),
              },
              {
                label: "HTTP status",
                value:
                  metadataText(log.metadata, "http_status") ??
                  metadataText(log.metadata, "status"),
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

function metadataText(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}
