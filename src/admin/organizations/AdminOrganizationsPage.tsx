import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";

import { useAuth } from "../../auth/useAuth";
import { canUseSystemAdmin } from "../../auth/permissions";
import { adminKeys, fetchOrganizations } from "../api";
import {
  AdminFrame,
  AdminSearch,
  PaginatedState,
  adminQueryString,
} from "../components/AdminScaffold";

export function AdminOrganizationsPage() {
  const [params] = useSearchParams();
  const auth = useAuth();
  const queryString = adminQueryString(params);
  const query = useQuery({
    queryKey: adminKeys.organizations(queryString),
    queryFn: () => fetchOrganizations(queryString),
  });
  return (
    <AdminFrame
      title="組織"
      actions={
        canUseSystemAdmin(auth.user) ? (
          <Link className="button button-primary" to="/admin/organizations/new">
            組織作成
          </Link>
        ) : null
      }
    >
      <AdminSearch
        fields={[
          { name: "q", label: "検索" },
          {
            name: "sort",
            label: "並び替え",
            options: [
              { value: "created_at", label: "作成日時" },
              { value: "name", label: "名前" },
            ],
          },
          {
            name: "direction",
            label: "方向",
            options: [
              { value: "desc", label: "降順" },
              { value: "asc", label: "昇順" },
            ],
          },
        ]}
      />
      <PaginatedState query={query}>
        {(data) => (
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Users</th>
                <th>Storage</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((organization) => (
                <tr key={organization.id}>
                  <td>{organization.id}</td>
                  <td>{organization.name}</td>
                  <td>{organization.users_count ?? "—"}</td>
                  <td>{organization.storage_bytes ?? "—"}</td>
                  <td>
                    <Link to={`/admin/organizations/${organization.id}`}>詳細</Link>
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
