import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Button } from "../../components/Button";
import { useToast } from "../../components/ToastProvider";
import {
  adminKeys,
  createOrganizationInvite,
  fetchOrganization,
  type OrganizationInvite,
} from "../api";
import {
  AdminFrame,
  DetailList,
  QueryState,
  errorMessage,
} from "../components/AdminScaffold";
import { formatDateTime } from "../components/auditFormat";

export function AdminOrganizationInviteNewPage() {
  const organizationId = Number(useParams().organizationId);
  const [expiresAt, setExpiresAt] = useState("");
  const [invite, setInvite] = useState<OrganizationInvite | null>(null);
  const toast = useToast();
  const query = useQuery({
    queryKey: adminKeys.organization(organizationId),
    queryFn: () => fetchOrganization(organizationId),
    enabled: Number.isFinite(organizationId),
  });
  const mutation = useMutation({
    mutationFn: createOrganizationInvite,
    onSuccess: (created) => {
      setInvite(created);
      toast.show({ tone: "success", message: "招待コードを発行しました。" });
    },
    onError: (error) => toast.show({ tone: "danger", message: errorMessage(error) }),
  });
  return (
    <AdminFrame
      title="招待コード発行"
      actions={
        <Link to={`/admin/organizations/${organizationId}`}>組織詳細へ戻る</Link>
      }
    >
      <QueryState query={query}>
        {(organization) => (
          <div className="system-admin-grid">
            <DetailList
              items={[
                { label: "対象組織", value: organization.name },
                { label: "組織ID", value: organization.id },
              ]}
            />
            <form
              className="form-stack admin-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!expiresAt) return;
                mutation.mutate({
                  organizationId,
                  expiresAt: new Date(expiresAt).toISOString(),
                });
              }}
            >
              <label className="field">
                <span>有効期限</span>
                <input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                />
              </label>
              <Button type="submit" loading={mutation.isPending} disabled={!expiresAt}>
                発行
              </Button>
            </form>
            {invite ? <InviteResult invite={invite} /> : null}
          </div>
        )}
      </QueryState>
    </AdminFrame>
  );
}

function InviteResult({ invite }: { invite: OrganizationInvite }) {
  const toast = useToast();
  return (
    <section className="system-admin-panel" aria-labelledby="invite-result-title">
      <h3 id="invite-result-title">発行結果</h3>
      <DetailList
        items={[
          { label: "招待コード", value: <code>{invite.code}</code> },
          { label: "対象組織", value: invite.organization_name },
          { label: "有効期限", value: formatDateTime(invite.expires_at) },
          { label: "発行日時", value: formatDateTime(invite.created_at) },
        ]}
      />
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          void navigator.clipboard.writeText(invite.code).then(() => {
            toast.show({ tone: "success", message: "招待コードをコピーしました。" });
          });
        }}
      >
        コピー
      </Button>
    </section>
  );
}
