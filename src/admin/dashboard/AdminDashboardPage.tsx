import { useQuery } from "@tanstack/react-query";

import { adminKeys, fetchDashboard } from "../api";
import { AdminFrame, QueryState } from "../components/AdminScaffold";

export function AdminDashboardPage() {
  const query = useQuery({ queryKey: adminKeys.dashboard(), queryFn: fetchDashboard });
  return (
    <AdminFrame title="ダッシュボード">
      <QueryState query={query}>
        {(data) => (
          <div className="metric-grid">
            <Metric label="Organizations" value={data.organizations_count} />
            <Metric label="Users" value={data.users_count} />
            <Metric label="ActiveUsers" value={data.active_users_count} />
            <Metric label="DriveItems" value={data.drive_items_count} />
            <Metric label="Files" value={data.files_count} />
            <Metric label="Directories" value={data.directories_count} />
          </div>
        )}
      </QueryState>
    </AdminFrame>
  );
}

function Metric({ label, value }: { label: string; value?: number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value ?? "—"}</strong>
    </div>
  );
}
