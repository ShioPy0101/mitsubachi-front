import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { adminKeys, fetchAuditLog } from "../api";
import { AdminFrame, DetailList, QueryState } from "../components/AdminScaffold";
import {
  AuditChangeSetView,
  AuditTargetLink,
  formatAuditAction,
  formatAuditTargetType,
  formatDateTime,
} from "../components/auditFormat";

export function AdminAuditLogDetailPage() {
  const id = Number(useParams().auditLogId);
  const query = useQuery({
    queryKey: adminKeys.auditLog(id),
    queryFn: () => fetchAuditLog(id),
    enabled: Number.isFinite(id),
  });
  return (
    <AdminFrame
      title="管理監査ログ詳細"
      actions={<Link to="/admin/audit-logs">一覧へ戻る</Link>}
    >
      <QueryState query={query}>
        {(log) => (
          <div className="system-admin-grid">
            <section className="system-admin-panel">
              <h3>基本情報</h3>
              <DetailList
                items={[
                  { label: "ログID", value: log.id },
                  { label: "発生日時", value: formatDateTime(log.created_at) },
                  {
                    label: "操作",
                    value: `${formatAuditAction(log.action)} (${log.action})`,
                  },
                ]}
              />
            </section>
            <section className="system-admin-panel">
              <h3>操作者</h3>
              <DetailList
                items={[
                  {
                    label: "ユーザー",
                    value: log.actor_user_id ? (
                      <Link to={`/admin/users/${log.actor_user_id}`}>
                        {log.actor_email ?? `ID: ${log.actor_user_id}`}
                      </Link>
                    ) : (
                      "不明な操作者"
                    ),
                  },
                  { label: "ユーザーID", value: log.actor_user_id },
                ]}
              />
            </section>
            <section className="system-admin-panel">
              <h3>組織</h3>
              <DetailList
                items={[
                  {
                    label: "組織",
                    value: log.organization_id ? (
                      <Link to={`/admin/organizations/${log.organization_id}`}>
                        {log.organization_name ?? `ID: ${log.organization_id}`}
                      </Link>
                    ) : (
                      "—"
                    ),
                  },
                ]}
              />
            </section>
            <section className="system-admin-panel">
              <h3>操作対象</h3>
              <DetailList
                items={[
                  { label: "対象種別", value: formatAuditTargetType(log.target_type) },
                  {
                    label: "対象",
                    value: (
                      <AuditTargetLink
                        targetType={log.target_type}
                        targetId={log.target_id}
                      />
                    ),
                  },
                ]}
              />
            </section>
            <section className="system-admin-panel">
              <h3>変更内容</h3>
              <AuditChangeSetView changeSet={log.change_set} />
            </section>
            <section className="system-admin-panel">
              <h3>追加情報</h3>
              <DetailList
                items={[
                  { label: "IPアドレス", value: log.ip_address },
                  { label: "User-Agent", value: log.user_agent },
                ]}
              />
            </section>
          </div>
        )}
      </QueryState>
    </AdminFrame>
  );
}
