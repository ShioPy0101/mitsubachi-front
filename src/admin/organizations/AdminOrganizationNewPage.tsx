import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "../../components/Button";
import { FieldError } from "../../components/FieldError";
import { useToast } from "../../components/ToastProvider";
import { adminKeys, createOrganization } from "../api";
import { AdminFrame, errorMessage } from "../components/AdminScaffold";

export function AdminOrganizationNewPage() {
  const [name, setName] = useState("");
  const [fieldError, setFieldError] = useState<string>();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: createOrganization,
    onSuccess: async (organization) => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.organizations("") });
      toast.show({ tone: "success", message: "組織を作成しました。" });
      void navigate(`/admin/organizations/${organization.id}`, { replace: true });
    },
    onError: (error) => toast.show({ tone: "danger", message: errorMessage(error) }),
  });
  return (
    <AdminFrame title="組織作成">
      <form
        className="form-stack admin-form"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = name.trim();
          if (!trimmed) {
            setFieldError("組織名を入力してください。");
            return;
          }
          mutation.mutate({ name: trimmed });
        }}
      >
        <label className="field">
          <span>組織名</span>
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setFieldError(undefined);
            }}
            aria-invalid={Boolean(fieldError)}
          />
          <FieldError error={fieldError} />
        </label>
        <Button type="submit" loading={mutation.isPending}>
          作成
        </Button>
      </form>
    </AdminFrame>
  );
}
