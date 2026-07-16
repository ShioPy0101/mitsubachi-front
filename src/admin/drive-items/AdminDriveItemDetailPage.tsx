import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useAuth } from "../../auth/useAuth";
import { Button } from "../../components/Button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useToast } from "../../components/ToastProvider";
import {
  adminDriveItemDownloadUrl,
  adminDriveItemPreviewUrl,
  adminDriveItemStreamUrl,
  adminKeys,
  type AdminDriveItem,
  deleteAdminDriveItem,
  fetchAdminDriveItem,
  purgeAdminDriveItem,
  restoreAdminDriveItem,
} from "../api";
import {
  AdminFrame,
  DetailList,
  QueryState,
  errorMessage,
} from "../components/AdminScaffold";
import { formatCompactDateTime } from "../components/auditFormat";

export function AdminDriveItemDetailPage() {
  const id = Number(useParams().driveItemId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [purgeConfirmOpen, setPurgeConfirmOpen] = useState(false);
  const auth = useAuth();
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
  const purgeMutation = useMutation({
    mutationFn: purgeAdminDriveItem,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.driveItem(id) });
      await queryClient.invalidateQueries({ queryKey: adminKeys.driveItems("") });
      setPurgeConfirmOpen(false);
      toast.show({ tone: "success", message: "ファイルを完全削除しました。" });
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
                { label: "名前", value: item.name },
                { label: "種別", value: item.item_type },
                {
                  label: "組織",
                  value: item.organization_name ?? item.organization_id,
                },
                {
                  label: "アップロードした人",
                  value: item.owner_email ?? item.owner_user_id ?? "—",
                },
                {
                  label: "アップロード元IP",
                  value: item.upload_ip_address ?? "backend未実装",
                },
                { label: "サイズ", value: formatFileSize(item.file_size) },
                {
                  label: "アップロード日時",
                  value: formatCompactDateTime(item.uploaded_at ?? item.created_at),
                },
                { label: "更新日時", value: formatCompactDateTime(item.updated_at) },
                { label: "削除日時", value: formatCompactDateTime(item.deleted_at) },
              ]}
            />
            <Button
              type="button"
              variant={item.deleted_at ? "secondary" : "danger"}
              onClick={() => setConfirmOpen(true)}
            >
              {item.deleted_at ? "復元" : "削除"}
            </Button>
            {auth.user?.role === "system_admin" ? (
              <>
                <AdminDriveItemFileAccess item={item} />
                {item.deleted_at ? (
                  <section
                    className="system-admin-panel"
                    aria-labelledby="file-purge-title"
                  >
                    <h3 id="file-purge-title">完全削除</h3>
                    <p className="system-admin-note">
                      物理削除は保存済みファイル本体とデータベース上の項目を削除します。復元できません。
                    </p>
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => setPurgeConfirmOpen(true)}
                    >
                      完全削除
                    </Button>
                  </section>
                ) : null}
              </>
            ) : null}
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
            <ConfirmDialog
              open={purgeConfirmOpen}
              title="完全削除"
              message={`「${item.name}」を物理削除します。この操作は取り消せません。`}
              confirmLabel="完全削除"
              danger
              loading={purgeMutation.isPending}
              onConfirm={() => purgeMutation.mutate(item.id)}
              onClose={() => setPurgeConfirmOpen(false)}
            />
          </>
        )}
      </QueryState>
    </AdminFrame>
  );
}

function formatFileSize(value?: number | null) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("ja-JP", {
    style: "unit",
    unit: "byte",
    unitDisplay: "short",
  }).format(value);
}

function AdminDriveItemFileAccess({ item }: { item: AdminDriveItem }) {
  if (item.item_type !== "file") {
    return (
      <section className="system-admin-panel" aria-labelledby="file-access-title">
        <h3 id="file-access-title">実ファイル確認</h3>
        <p className="system-admin-note">
          ディレクトリにはプレビューまたはダウンロード対象の実ファイルがありません。
        </p>
      </section>
    );
  }

  if (item.deleted_at) {
    return (
      <section className="system-admin-panel" aria-labelledby="file-access-title">
        <h3 id="file-access-title">実ファイル確認</h3>
        <p className="system-admin-note">
          削除済みファイルは管理者向け配信APIの対象外です。復元後に確認してください。
        </p>
      </section>
    );
  }

  return (
    <section className="system-admin-panel" aria-labelledby="file-access-title">
      <h3 id="file-access-title">実ファイル確認</h3>
      <p className="system-admin-note">
        system_admin向けの管理者配信APIを使用して、組織をまたいで実ファイルを確認します。
      </p>
      <div className="toolbar">
        <a
          className="button button-secondary"
          href={adminDriveItemPreviewUrl(item.id)}
          target="_blank"
          rel="noreferrer"
        >
          プレビューを開く
        </a>
        <a
          className="button button-secondary"
          href={adminDriveItemStreamUrl(item.id)}
          target="_blank"
          rel="noreferrer"
        >
          ストリームを開く
        </a>
        <a
          className="button button-secondary"
          href={adminDriveItemDownloadUrl(item.id)}
        >
          ダウンロード
        </a>
      </div>
    </section>
  );
}
