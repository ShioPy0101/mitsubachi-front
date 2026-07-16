import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { adminKeys, fetchOrganization } from "../api";
import { AdminFrame, DetailList, QueryState } from "../components/AdminScaffold";

export function AdminOrganizationDetailPage() {
  const id = Number(useParams().organizationId);
  const query = useQuery({
    queryKey: adminKeys.organization(id),
    queryFn: () => fetchOrganization(id),
    enabled: Number.isFinite(id),
  });
  return (
    <AdminFrame
      title="組織詳細"
      actions={
        <>
          <Link to="/admin/organizations">一覧へ戻る</Link>
          <Link to={`/admin/organizations/${id}/edit`}>編集</Link>
          <Link to={`/admin/organizations/${id}/invites/new`}>招待コードを発行</Link>
        </>
      }
    >
      <QueryState query={query}>
        {(organization) => (
          <DetailList
            items={[
              { label: "ID", value: organization.id },
              { label: "Name", value: organization.name },
              { label: "Users", value: organization.users_count },
              { label: "DriveItems", value: organization.drive_items_count },
              { label: "Storage", value: organization.storage_bytes },
              { label: "Created", value: organization.created_at },
            ]}
          />
        )}
      </QueryState>
    </AdminFrame>
  );
}
