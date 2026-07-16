import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Button } from "../../components/Button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useToast } from "../../components/ToastProvider";
import {
  adminKeys,
  deleteAdminDriveItem,
  fetchAdminDriveItem,
  restoreAdminDriveItem,
} from "../api";
import {
  AdminFrame,
  DetailList,
  QueryState,
  errorMessage,
} from "../components/AdminScaffold";

export function AdminDriveItemDetailPage() {
  const id = Number(useParams().driveItemId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: adminKeys.driveItem(id),
    queryFn: () => fetchAdminDriveItem(id),
    enabled: Number.isFinite(id),
  });
  const mutation = useMutation({
    mutationFn: () =>
      query.data?.deleted_at ? restoreAdminDriveItem(id) : deleteAdminDriveItem(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.driveItem(id) });
      await queryClient.invalidateQueries({ queryKey: adminKeys.driveItems("") });
      setConfirmOpen(false);
      toast.show({ tone: "success", message: "ファイル状態を更新しました。" });
    },
    onError: (error) => toast.show({ tone: "danger", message: errorMessage(error) }),
  });
  return (
    <AdminFrame
      title="ファイル詳細"
      actions={<Link to="/admin/drive-items">一覧へ戻る</Link>}
    >
      <QueryState query={query}>
        {(item) => (
          <>
            <DetailList
              items={[
                { label: "ID", value: item.id },
                { label: "Name", value: item.name },
                { label: "Type", value: item.item_type },
                {
                  label: "Organization",
                  value: item.organization_name ?? item.organization_id,
                },
                { label: "Owner", value: item.owner_email ?? item.owner_user_id },
                { label: "Deleted", value: item.deleted_at ?? "—" },
              ]}
            />
            <Button
              type="button"
              variant={item.deleted_at ? "secondary" : "danger"}
              onClick={() => setConfirmOpen(true)}
            >
              {item.deleted_at ? "復元" : "削除"}
            </Button>
            <ConfirmDialog
              open={confirmOpen}
              title={item.deleted_at ? "復元" : "削除"}
              message={`${item.name} の状態を変更しますか？`}
              confirmLabel={item.deleted_at ? "復元" : "削除"}
              danger={!item.deleted_at}
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
