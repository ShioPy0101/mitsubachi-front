import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { adminKeys, fetchAuditEvent } from "../api";
import { AdminFrame, DetailList, QueryState } from "../components/AdminScaffold";
import {
  AuditChangeSetView,
  AuditMetadataView,
  AuditTargetLink,
  formatAuditAction,
  formatAuditOutcome,
  formatDateTime,
} from "../components/auditFormat";

export function AdminAuditEventDetailPage() {
  const id = Number(useParams().auditEventId);
  const query = useQuery({
    queryKey: adminKeys.auditEvent(id),
    queryFn: () => fetchAuditEvent(id),
    enabled: Number.isFinite(id),
  });
  return (
    <AdminFrame
      title="監査イベント詳細"
      actions={<Link to="/admin/audit-events">一覧へ戻る</Link>}
    >
      <QueryState query={query}>
        {(event) => (
          <div className="system-admin-grid">
            <section className="system-admin-panel">
              <h3>イベント概要</h3>
              <DetailList
                items={[
                  { label: "イベントID", value: event.id },
                  { label: "発生日時", value: formatDateTime(event.occurred_at) },
                  {
                    label: "アクション",
                    value: `${formatAuditAction(event.action)} (${event.action})`,
                  },
                  { label: "結果", value: formatAuditOutcome(event.outcome) },
                ]}
              />
            </section>
            <section className="system-admin-panel">
              <h3>実行者</h3>
              <DetailList
                items={[
                  {
                    label: "ユーザー",
                    value: event.actor_user_id ? (
                      <Link to={`/admin/users/${event.actor_user_id}`}>
                        {event.actor_email ?? `ID: ${event.actor_user_id}`}
                      </Link>
                    ) : (
                      "未認証ユーザー/システム/不明"
                    ),
                  },
                ]}
              />
            </section>
            <section className="system-admin-panel">
              <h3>対象</h3>
              <DetailList
                items={[
                  {
                    label: "対象",
                    value: (
                      <AuditTargetLink
                        targetType={event.target_type}
                        targetId={event.target_id}
                      />
                    ),
                  },
                ]}
              />
            </section>
            <section className="system-admin-panel">
              <h3>リクエスト情報</h3>
              <DetailList
                items={[
                  { label: "IPアドレス", value: event.ip_address },
                  { label: "User-Agent", value: event.user_agent },
                  { label: "Request ID", value: event.request_id },
                ]}
              />
            </section>
            <section className="system-admin-panel">
              <h3>変更内容</h3>
              <AuditChangeSetView changeSet={event.change_set} />
            </section>
            <section className="system-admin-panel">
              <h3>メタデータ</h3>
              <AuditMetadataView metadata={event.metadata} />
            </section>
          </div>
        )}
      </QueryState>
    </AdminFrame>
  );
}
