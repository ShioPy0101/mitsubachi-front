import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Button } from "../../components/Button";
import { useToast } from "../../components/ToastProvider";
import {
  adminKeys,
  fetchOrganization,
  updateOrganization,
  type AdminOrganization,
} from "../api";
import { AdminFrame, QueryState, errorMessage } from "../components/AdminScaffold";

export function AdminOrganizationEditPage() {
  const id = Number(useParams().organizationId);
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: adminKeys.organization(id),
    queryFn: () => fetchOrganization(id),
    enabled: Number.isFinite(id),
  });
  const mutation = useMutation({
    mutationFn: updateOrganization,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.organization(id) });
      toast.show({ tone: "success", message: "組織を更新しました。" });
      void navigate(`/admin/organizations/${id}`, { replace: true });
    },
    onError: (error) => toast.show({ tone: "danger", message: errorMessage(error) }),
  });
  return (
    <AdminFrame title="組織編集">
      <QueryState query={query}>
        {(organization) => (
          <OrganizationEditForm
            organization={organization}
            isSaving={mutation.isPending}
            onSave={(name) => mutation.mutate({ id, name })}
          />
        )}
      </QueryState>
    </AdminFrame>
  );
}

function OrganizationEditForm({
  organization,
  isSaving,
  onSave,
}: {
  organization: AdminOrganization;
  isSaving: boolean;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(organization.name);
  return (
    <form
      className="form-stack admin-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) onSave(name.trim());
      }}
    >
      <label className="field">
        <span>組織名</span>
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <Button type="submit" loading={isSaving} disabled={!name.trim()}>
        保存
      </Button>
    </form>
  );
}
