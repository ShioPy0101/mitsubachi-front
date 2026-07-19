import { useQuery } from "@tanstack/react-query";

import { ErrorState } from "./components/ErrorState";
import { LoadingIndicator } from "./components/LoadingIndicator";
import { fetchGroup, groupKeys } from "./groupApi";

export function GroupDashboardPage() {
  const groupQuery = useQuery({
    queryKey: groupKeys.detail,
    queryFn: fetchGroup,
  });

  if (groupQuery.isLoading) return <LoadingIndicator label="グループを読み込んでいます" />;
  if (groupQuery.isError) {
    return (
      <ErrorState
        message={groupQuery.error instanceof Error ? groupQuery.error.message : undefined}
        onRetry={() => void groupQuery.refetch()}
      />
    );
  }
  if (!groupQuery.data) return null;

  const group = groupQuery.data;
  return (
    <section className="group-dashboard" aria-labelledby="group-title">
      <div className="page-header">
        <p className="breadcrumbs">グループ</p>
        <h1 id="group-title">{group.name}</h1>
        {group.description ? <p>{group.description}</p> : null}
      </div>
      <div className="group-summary">
        <div>
          <span>メンバー数</span>
          <strong>{group.member_count}</strong>
        </div>
        <div>
          <span>自分の権限</span>
          <strong>{group.current_user_role}</strong>
        </div>
      </div>
      <section className="admin-section" aria-labelledby="members-title">
        <div className="admin-section-header">
          <h2 id="members-title">メンバー</h2>
        </div>
        <div className="file-list">
          <table>
            <thead>
              <tr>
                <th scope="col">表示名</th>
                <th scope="col">ロール</th>
                <th scope="col">参加日時</th>
                <th scope="col">状態</th>
              </tr>
            </thead>
            <tbody>
              {group.members.map((member) => (
                <tr key={member.id}>
                  <td>{member.display_name}</td>
                  <td>{member.role}</td>
                  <td>{member.joined_at ? formatDate(member.joined_at) : "-"}</td>
                  <td>{member.suspended ? "停止中" : "利用中"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
