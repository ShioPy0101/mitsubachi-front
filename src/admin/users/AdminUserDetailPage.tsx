import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { Button } from "../../components/Button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useToast } from "../../components/ToastProvider";
import { useState } from "react";
import { adminKeys, fetchUser, suspendUser, unsuspendUser } from "../api";
import {
  AdminFrame,
  DetailList,
  QueryState,
  errorMessage,
} from "../components/AdminScaffold";

export function AdminUserDetailPage() {
  const id = Number(useParams().userId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: adminKeys.user(id),
    queryFn: () => fetchUser(id),
    enabled: Number.isFinite(id),
  });
  const mutation = useMutation({
    mutationFn: () => (query.data?.suspended ? unsuspendUser(id) : suspendUser(id)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.user(id) });
      setConfirmOpen(false);
      toast.show({ tone: "success", message: "ユーザー状態を更新しました。" });
    },
    onError: (error) => toast.show({ tone: "danger", message: errorMessage(error) }),
  });
  return (
    <AdminFrame
      title="ユーザー詳細"
      actions={
        <>
          <Link to="/admin/users">一覧へ戻る</Link>
          <Link to={`/admin/users/${id}/edit`}>編集</Link>
        </>
      }
    >
      <QueryState query={query}>
        {(user) => (
          <>
            <DetailList
              items={[
                { label: "ID", value: user.id },
                { label: "Email", value: user.email },
                { label: "Name", value: user.name },
                { label: "Role", value: user.role },
                {
                  label: "Organization",
                  value: user.organization_name ?? user.organization_id,
                },
                { label: "Status", value: user.suspended ? "停止中" : "有効" },
              ]}
            />
            <Button
              type="button"
              variant={user.suspended ? "secondary" : "danger"}
              onClick={() => setConfirmOpen(true)}
            >
              {user.suspended ? "停止解除" : "停止"}
            </Button>
            <ConfirmDialog
              open={confirmOpen}
              title={user.suspended ? "停止解除" : "ユーザー停止"}
              message={`${user.email} の状態を変更しますか？`}
              confirmLabel={user.suspended ? "停止解除" : "停止"}
              danger={!user.suspended}
              loading={mutation.isPending}
              onConfirm={() => mutation.mutate()}
              onClose={() => setConfirmOpen(false)}
            />
          </>
        )}
      </QueryState>
    </AdminFrame>
  );
}
