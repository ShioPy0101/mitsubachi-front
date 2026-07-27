import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";

import {
  adminKeys,
  adminOrganizationIdFromParam,
  adminUiPath,
  fetchAdminDriveItems,
} from "../api";
import {
  AdminFrame,
  AdminSearch,
  PaginatedState,
  adminQueryString,
} from "../components/AdminScaffold";

export function AdminDriveItemsPage() {
  const [params] = useSearchParams();
  const organizationId = adminOrganizationIdFromParam(useParams().organizationId);
  const queryString = adminQueryString(params);
  const query = useQuery({
    queryKey: adminKeys.driveItems(organizationId, queryString),
    queryFn: () => fetchAdminDriveItems(queryString, organizationId),
  });
  return (
    <AdminFrame title="ファイル">
      <AdminSearch
        fields={[
          { name: "q", label: "検索" },
          ...(organizationId === null
            ? [{ name: "organization_id", label: "組織ID" }]
            : []),
          { name: "user_id", label: "所有者ID" },
          {
            name: "item_type",
            label: "種別",
            options: [
              { value: "file", label: "file" },
              { value: "directory", label: "directory" },
            ],
          },
          {
            name: "deleted",
            label: "削除状態",
            options: [
              { value: "active", label: "有効" },
              { value: "deleted", label: "削除済み" },
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
                <th>Type</th>
                <th>Organization</th>
                <th>Deleted</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>{item.name}</td>
                  <td>{item.item_type}</td>
                  <td>{item.organization_name ?? item.organization_id}</td>
                  <td>{item.deleted_at ? "削除済み" : "—"}</td>
                  <td>
                    <Link to={adminUiPath(organizationId, `/drive-items/${item.id}`)}>
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
