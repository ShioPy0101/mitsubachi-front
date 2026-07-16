import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Button } from "../../components/Button";
import { useToast } from "../../components/ToastProvider";
import { adminKeys, fetchUser, updateUser, type AdminUser } from "../api";
import { AdminFrame, QueryState, errorMessage } from "../components/AdminScaffold";

export function AdminUserEditPage() {
  const id = Number(useParams().userId);
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: adminKeys.user(id),
    queryFn: () => fetchUser(id),
    enabled: Number.isFinite(id),
  });
  const mutation = useMutation({
    mutationFn: updateUser,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.user(id) });
      toast.show({ tone: "success", message: "ユーザーを更新しました。" });
      void navigate(`/admin/users/${id}`, { replace: true });
    },
    onError: (error) => toast.show({ tone: "danger", message: errorMessage(error) }),
  });
  return (
    <AdminFrame title="ユーザー編集">
      <QueryState query={query}>
        {(user) => (
          <UserEditForm
            user={user}
            isSaving={mutation.isPending}
            onSave={(form) =>
              mutation.mutate({
                id,
                name: form.name,
                email: form.email,
                role: form.role,
                organizationId: form.organizationId
                  ? Number(form.organizationId)
                  : undefined,
              })
            }
          />
        )}
      </QueryState>
    </AdminFrame>
  );
}

function UserEditForm({
  user,
  isSaving,
  onSave,
}: {
  user: AdminUser;
  isSaving: boolean;
  onSave: (form: {
    name: string;
    email: string;
    role: AdminUser["role"];
    organizationId: string;
  }) => void;
}) {
  const [form, setForm] = useState({
    name: user.name ?? "",
    email: user.email,
    role: user.role,
    organizationId: user.organization_id ? String(user.organization_id) : "",
  });

  return (
    <form
      className="form-stack admin-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(form);
      }}
    >
      <label className="field">
        <span>Name</span>
        <input
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
      </label>
      <label className="field">
        <span>Email</span>
        <input
          type="email"
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
        />
      </label>
      <label className="field">
        <span>Role</span>
        <select
          value={form.role}
          onChange={(event) =>
            setForm({ ...form, role: event.target.value as AdminUser["role"] })
          }
        >
          <option value="member">member</option>
          <option value="organization_admin">organization_admin</option>
          <option value="system_admin">system_admin</option>
        </select>
      </label>
      <label className="field">
        <span>Organization ID</span>
        <input
          value={form.organizationId}
          onChange={(event) => setForm({ ...form, organizationId: event.target.value })}
        />
      </label>
      <Button type="submit" loading={isSaving}>
        保存
      </Button>
    </form>
  );
}
