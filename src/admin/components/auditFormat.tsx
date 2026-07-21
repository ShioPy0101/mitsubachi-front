import { Link } from "react-router-dom";

const sensitiveKeyPattern =
  /password|password_confirmation|token|access_token|refresh_token|csrf_token|authenticity_token|authorization|cookie|session|secret|api_key|invite_code|magic_link|private_key/i;

const actionLabels: Record<string, string> = {
  "organization.create": "組織を作成",
  "organization.update": "組織を更新",
  "organization_invite.create": "招待コードを発行",
  "user.update": "ユーザー情報を更新",
  "user.role_change": "ユーザー権限を変更",
  "user.suspend": "ユーザーを停止",
  "user.unsuspend": "ユーザーの停止を解除",
  "drive_item.delete": "ファイルを削除",
  "drive_item.restore": "ファイルを復元",
  "drive_item.create": "ファイルを作成",
  "drive_item.update": "ファイルを更新",
  "drive_item.bulk_delete": "ファイルを一括削除",
  "drive_item.bulk_restore": "ファイルを一括復元",
  "drive_item.bulk_move": "ファイルを一括移動",
  "drive_item.preview": "ファイルをプレビュー",
  "drive_item.download": "ファイルをダウンロード",
  "auth.login_link.create": "ログインリンクを発行",
  "auth.registration_link.create": "登録リンクを発行",
  "auth.login": "ログイン",
  "auth.verify": "ログイン認証",
  "auth.failure": "ログイン失敗",
  "authorization.denied": "アクセス拒否",
  "audit_log.index": "管理監査ログを閲覧",
  "audit_log.show": "管理監査ログ詳細を閲覧",
  "admin.audit_log.view": "監査ログを閲覧",
};

const targetLabels: Record<string, string> = {
  User: "ユーザー",
  Organization: "組織",
  DriveItem: "ファイル",
  OrganizationInvite: "招待コード",
  AdminAuditLog: "管理監査ログ",
};

const outcomeLabels: Record<string, string> = {
  success: "成功",
  failure: "失敗",
  denied: "拒否",
};

export function formatAuditAction(action: string) {
  return actionLabels[action] ?? action;
}

export function formatAuditTargetType(targetType?: string | null) {
  if (!targetType) return "—";
  return targetLabels[targetType] ?? targetType;
}

export function formatAuditOutcome(outcome: string) {
  return outcomeLabels[outcome] ?? outcome;
}

export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "long",
    timeStyle: "medium",
    timeZone: "Asia/Tokyo",
  }).format(date);
}

export function formatCompactDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Tokyo",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}/${get("month")}/${get("day")} ${get("hour")}:${get(
    "minute",
  )}:${get("second")}`;
}

export function summarizeChangeSet(
  changeSet?: Record<string, [unknown, unknown]> | null,
) {
  if (!changeSet || Object.keys(changeSet).length === 0) return "—";
  const keys = Object.keys(changeSet).filter((key) => {
    const [before, after] = changeSet[key] ?? [];
    return JSON.stringify(before) !== JSON.stringify(after);
  });
  if (keys.length === 0) return "—";
  if (keys.length === 1) {
    const key = keys[0];
    const [before, after] = changeSet[key] ?? [];
    return `${key}: ${formatValue(before)} → ${formatValue(after)}`;
  }
  return `${keys.length}項目を変更`;
}

export function AuditChangeSetView({
  changeSet,
}: {
  changeSet?: Record<string, [unknown, unknown]> | null;
}) {
  if (!changeSet || Object.keys(changeSet).length === 0)
    return <p>変更内容はありません。</p>;
  const rows = Object.entries(changeSet).filter(
    ([, [before, after]]) => JSON.stringify(before) !== JSON.stringify(after),
  );
  if (rows.length === 0) return <p>変更内容はありません。</p>;
  return (
    <table className="admin-table">
      <thead>
        <tr>
          <th scope="col">項目</th>
          <th scope="col">変更前</th>
          <th scope="col">変更後</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([key, [before, after]]) => (
          <tr key={key}>
            <td>{key}</td>
            <td>{formatValue(before, key)}</td>
            <td>{formatValue(after, key)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function AuditMetadataView({
  metadata,
}: {
  metadata?: Record<string, unknown> | null;
}) {
  if (!metadata || Object.keys(metadata).length === 0)
    return <p>追加情報はありません。</p>;
  return (
    <dl className="detail-list">
      {Object.entries(metadata).map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{formatValue(value, key)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function AuditTargetLink({
  targetType,
  targetId,
}: {
  targetType?: string | null;
  targetId?: number | null;
}) {
  if (!targetType || !targetId) return <>{formatAuditTargetType(targetType)}</>;
  const href = targetHref(targetType, targetId);
  const label = `${formatAuditTargetType(targetType)} ${targetId}`;
  return href ? <Link to={href}>{label}</Link> : <>{label}</>;
}

export function targetHref(targetType: string, targetId: number) {
  if (targetType === "User") return `/admin/users/${targetId}`;
  if (targetType === "Organization") return `/admin/organizations/${targetId}`;
  if (targetType === "DriveItem") return `/admin/drive-items/${targetId}`;
  return null;
}

export function formatValue(value: unknown, key = ""): string {
  if (sensitiveKeyPattern.test(key)) return "********";
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string")
    return sensitiveKeyPattern.test(value) ? "********" : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(maskSensitive(value));
}

export function maskSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => maskSensitive(item));
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      sensitiveKeyPattern.test(key) ? "********" : maskSensitive(item),
    ]),
  );
}
