import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  adminKeys,
  adminOrganizationIdFromParam,
  adminUiPath,
  fetchDriveItemAccessLog,
} from "../api";
import { AdminFrame, DetailList, QueryState } from "../components/AdminScaffold";
import { formatDateTime } from "../components/logFormat";
export function DriveItemAccessLogDetailPage() {
  const params = useParams();
  const id = Number(params.driveItemAccessLogId);
  const organizationId = adminOrganizationIdFromParam(params.organizationId);
  const query = useQuery({
    queryKey: adminKeys.driveItemAccessLog(organizationId, id),
    queryFn: () => fetchDriveItemAccessLog(id, organizationId),
    enabled: Number.isFinite(id),
  });
  return (
    <AdminFrame
      title="ファイルアクセス履歴詳細"
      actions={
        <Link to={adminUiPath(organizationId, "/file-access-logs")}>一覧へ戻る</Link>
      }
    >
      <QueryState query={query}>
        {(log) => (
          <DetailList
            items={[
              { label: "発生日時", value: formatDateTime(log.occurred_at) },
              { label: "利用者", value: log.actor.display_name ?? log.actor.kind },
              { label: "アクセス種別", value: log.action },
              {
                label: "ファイル",
                value: log.drive_item.filename ?? "削除済みファイル",
              },
              { label: "Request ID", value: log.request_id },
              { label: "Batch ID", value: log.batch_id },
              { label: "User-Agent", value: log.user_agent },
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
