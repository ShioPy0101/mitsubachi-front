import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  adminKeys,
  adminOrganizationIdFromParam,
  adminUiPath,
  fetchUsers,
} from "../api";
import {
  AdminFrame,
  AdminSearch,
  PaginatedState,
  adminQueryString,
} from "../components/AdminScaffold";

export function AdminUsersPage() {
  const [params] = useSearchParams();
  const organizationId = adminOrganizationIdFromParam(useParams().organizationId);
  const queryString = adminQueryString(params);
  const query = useQuery({
    queryKey: adminKeys.users(organizationId, queryString),
    queryFn: () => fetchUsers(queryString, organizationId),
  });
  return (
    <AdminFrame title="ユーザー">
      <AdminSearch
        fields={[
          { name: "q", label: "検索" },
          ...(organizationId === null
            ? [{ name: "organization_id", label: "組織ID" }]
            : []),
          {
            name: "role",
            label: "Role",
            options: [
              { value: "member", label: "member" },
              { value: "organization_admin", label: "organization_admin" },
              { value: "system_admin", label: "system_admin" },
            ],
          },
          {
            name: "status",
            label: "Status",
            options: [
              { value: "active", label: "有効" },
              { value: "suspended", label: "停止中" },
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
                <th>Email</th>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((user) => (
                <tr key={user.id}>
                  <td>{user.id}</td>
                  <td>{user.email}</td>
                  <td>{user.name ?? "—"}</td>
                  <td>{user.role}</td>
                  <td>{user.suspended ? "停止中" : "有効"}</td>
                  <td>
                    <Link to={adminUiPath(organizationId, `/users/${user.id}`)}>
                      詳細
                    </Link>
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
