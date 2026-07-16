import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  FilePlus,
  FolderPlus,
  MoreVertical,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import type { DriveItem } from "../api/schemas";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { FileTypeIcon } from "../components/FileTypeIcon";
import { IconButton } from "../components/IconButton";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { Modal } from "../components/Modal";
import { useToast } from "../components/ToastProvider";
import {
  bulkDelete,
  bulkDownload,
  bulkRestore,
  createDirectory,
  deleteDriveItem,
  downloadDriveItem,
  driveKeys,
  fetchDriveItem,
  fetchDriveItems,
  fetchTrash,
  previewUrl,
  renameDriveItem,
  restoreDriveItem,
  streamUrl,
  uploadFile,
} from "./api";

type DriveMode = "drive" | "trash";

export function DrivePage({ mode = "drive" }: { mode?: DriveMode }) {
  const params = useParams();
  const folderId = params.folderId ? Number(params.folderId) : null;
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [dialog, setDialog] = useState<
    "folder" | "rename" | "delete" | "preview" | null
  >(null);
  const [activeItem, setActiveItem] = useState<DriveItem | null>(null);
  const [nameValue, setNameValue] = useState("");

  const listQuery = useQuery({
    queryKey: mode === "trash" ? driveKeys.trash() : driveKeys.list(folderId),
    queryFn: () => (mode === "trash" ? fetchTrash() : fetchDriveItems(folderId)),
  });
  const folderQuery = useQuery({
    queryKey: folderId ? driveKeys.detail(folderId) : ["drive-items", "root"],
    queryFn: () => (folderId ? fetchDriveItem(folderId) : Promise.resolve(null)),
    enabled: mode === "drive" && folderId !== null,
  });

  const items = useMemo(() => listQuery.data ?? [], [listQuery.data]);
  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.includes(item.id)),
    [items, selectedIds],
  );

  const invalidateCurrent = async () => {
    await queryClient.invalidateQueries({
      queryKey: mode === "trash" ? driveKeys.trash() : driveKeys.list(folderId),
    });
  };

  const createMutation = useMutation({
    mutationFn: createDirectory,
    onSuccess: async () => {
      await invalidateCurrent();
      setDialog(null);
      setNameValue("");
      toast.show({ tone: "success", message: "フォルダを作成しました。" });
    },
    onError: (error) => toast.show({ tone: "danger", message: errorMessage(error) }),
  });
  const renameMutation = useMutation({
    mutationFn: renameDriveItem,
    onSuccess: async () => {
      await invalidateCurrent();
      setDialog(null);
      toast.show({ tone: "success", message: "名前を変更しました。" });
    },
    onError: (error) => toast.show({ tone: "danger", message: errorMessage(error) }),
  });
  const uploadMutation = useMutation({
    mutationFn: uploadFile,
    onSuccess: async () => {
      await invalidateCurrent();
      toast.show({ tone: "success", message: "アップロードしました。" });
    },
    onError: (error) => toast.show({ tone: "danger", message: errorMessage(error) }),
  });
  const deleteMutation = useMutation({
    mutationFn: async () =>
      selectedIds.length > 1
        ? bulkDelete(selectedIds)
        : deleteDriveItem(selectedIds[0]),
    onSuccess: async (response) => {
      await invalidateCurrent();
      await queryClient.invalidateQueries({ queryKey: driveKeys.trash() });
      setSelectedIds([]);
      setDialog(null);
      toast.show({
        tone: "success",
        message: response.message ?? "一括操作が完了しました。",
      });
    },
    onError: (error) => toast.show({ tone: "danger", message: errorMessage(error) }),
  });
  const restoreMutation = useMutation({
    mutationFn: async () =>
      selectedIds.length > 1
        ? bulkRestore(selectedIds)
        : restoreDriveItem(selectedIds[0]),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: driveKeys.trash() });
      await queryClient.invalidateQueries({ queryKey: driveKeys.all });
      setSelectedIds([]);
      toast.show({ tone: "success", message: "一括操作が完了しました。" });
    },
    onError: (error) => toast.show({ tone: "danger", message: errorMessage(error) }),
  });
  const bulkDownloadMutation = useMutation({
    mutationFn: () => bulkDownload(selectedIds),
    onError: (error) => toast.show({ tone: "danger", message: errorMessage(error) }),
  });

  const toggleSelected = (id: number) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((itemId) => itemId !== id)
        : [...current, id],
    );
  };

  const openItem = (item: DriveItem) => {
    if (mode === "trash") return;
    if (item.item_type === "directory") {
      setSelectedIds([]);
      void navigate(`/drive/folder/${item.id}`);
      return;
    }
    setActiveItem(item);
    setDialog("preview");
  };

  const handleUpload = (files: FileList | null) => {
    if (!files?.length) return;
    Array.from(files)
      .slice(0, 3)
      .forEach((file) =>
        uploadMutation.mutate({
          file,
          name: file.name.replace(/\.[^.]+$/, ""),
          parentId: folderId,
        }),
      );
  };

  return (
    <section className="drive-page" aria-busy={listQuery.isFetching}>
      <div className="page-header">
        <div className="breadcrumbs" aria-label="パンくず">
          <Link to="/drive">マイドライブ</Link>
          {folderQuery.data ? (
            <span aria-current="page">/ {folderQuery.data.name}</span>
          ) : null}
        </div>
        <h1>
          {mode === "trash" ? "ゴミ箱" : (folderQuery.data?.name ?? "マイドライブ")}
        </h1>
      </div>
      <div className="toolbar">
        {selectedIds.length > 0 ? (
          <>
            <span>{selectedIds.length}件選択中</span>
            {mode === "trash" ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => restoreMutation.mutate()}
              >
                <RotateCcw size={16} aria-hidden="true" />
                復元
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => bulkDownloadMutation.mutate()}
                >
                  <Download size={16} aria-hidden="true" />
                  ダウンロード
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => setDialog("delete")}
                >
                  <Trash2 size={16} aria-hidden="true" />
                  削除
                </Button>
              </>
            )}
            <Button type="button" variant="ghost" onClick={() => setSelectedIds([])}>
              選択解除
            </Button>
          </>
        ) : (
          <>
            {mode === "drive" ? (
              <>
                <Button type="button" onClick={() => setDialog("folder")}>
                  <FolderPlus size={16} aria-hidden="true" />
                  新しいフォルダ
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FilePlus size={16} aria-hidden="true" />
                  アップロード
                </Button>
              </>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              onClick={() => void listQuery.refetch()}
            >
              <RefreshCw size={16} aria-hidden="true" />
              更新
            </Button>
          </>
        )}
        <input
          ref={fileInputRef}
          className="visually-hidden"
          type="file"
          multiple
          onChange={(event) => handleUpload(event.currentTarget.files)}
        />
      </div>
      {listQuery.isLoading ? <LoadingIndicator label="一覧を読み込んでいます" /> : null}
      {listQuery.isError ? (
        <ErrorState
          message={errorMessage(listQuery.error)}
          onRetry={() => void listQuery.refetch()}
        />
      ) : null}
      {!listQuery.isLoading && !listQuery.isError && items.length === 0 ? (
        <EmptyState
          title={mode === "trash" ? "ゴミ箱は空です。" : "このフォルダは空です。"}
          description={
            mode === "drive"
              ? "フォルダ作成またはアップロードから始められます。"
              : undefined
          }
        />
      ) : null}
      {items.length > 0 ? (
        <FileTable
          items={items}
          selectedIds={selectedIds}
          onToggle={toggleSelected}
          onOpen={openItem}
          onRename={(item) => {
            setActiveItem(item);
            setNameValue(item.name);
            setDialog("rename");
          }}
          onDownload={downloadDriveItem}
          trash={mode === "trash"}
        />
      ) : null}
      <Modal
        open={dialog === "folder"}
        title="新しいフォルダ"
        onClose={() => setDialog(null)}
      >
        <NameForm
          value={nameValue}
          submitLabel="作成"
          loading={createMutation.isPending}
          onChange={setNameValue}
          onSubmit={(name) => createMutation.mutate({ name, parentId: folderId })}
        />
      </Modal>
      <Modal
        open={dialog === "rename"}
        title="名前を変更"
        onClose={() => setDialog(null)}
      >
        <NameForm
          value={nameValue}
          submitLabel="変更"
          loading={renameMutation.isPending}
          onChange={setNameValue}
          onSubmit={(name) => {
            if (activeItem && name !== activeItem.name)
              renameMutation.mutate({ id: activeItem.id, name });
          }}
        />
      </Modal>
      <ConfirmDialog
        open={dialog === "delete"}
        title="ゴミ箱へ移動"
        message={
          selectedItems.length === 1
            ? `「${selectedItems[0].name}」をゴミ箱へ移動しますか？`
            : "選択した項目をゴミ箱へ移動しますか？"
        }
        confirmLabel="削除"
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
        onClose={() => setDialog(null)}
      />
      <Modal
        open={dialog === "preview"}
        title={activeItem?.name ?? "プレビュー"}
        onClose={() => setDialog(null)}
      >
        {activeItem ? <Preview item={activeItem} /> : null}
      </Modal>
    </section>
  );
}

function FileTable({
  items,
  selectedIds,
  trash,
  onToggle,
  onOpen,
  onRename,
  onDownload,
}: {
  items: DriveItem[];
  selectedIds: number[];
  trash: boolean;
  onToggle: (id: number) => void;
  onOpen: (item: DriveItem) => void;
  onRename: (item: DriveItem) => void;
  onDownload: (id: number) => void;
}) {
  return (
    <div className="file-list">
      <table>
        <thead>
          <tr>
            <th scope="col">選択</th>
            <th scope="col">名前</th>
            <th scope="col">更新日時</th>
            <th scope="col">サイズ</th>
            <th scope="col">操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className={selectedIds.includes(item.id) ? "selected" : ""}
              tabIndex={0}
              onDoubleClick={() => onOpen(item)}
              onKeyDown={(event) => event.key === "Enter" && onOpen(item)}
            >
              <td>
                <input
                  type="checkbox"
                  aria-label={`${item.name}を選択`}
                  checked={selectedIds.includes(item.id)}
                  onChange={() => onToggle(item.id)}
                />
              </td>
              <td className="file-name-cell">
                <button
                  type="button"
                  className="file-name-button"
                  onClick={() => onOpen(item)}
                >
                  <FileTypeIcon item={item} />
                  <span className="file-name">{displayName(item)}</span>
                </button>
                <span className="mobile-meta">
                  {formatDate(item.updated_at)} ・ {formatSize(item.file_size)}
                </span>
              </td>
              <td>{formatDate(item.updated_at)}</td>
              <td>{formatSize(item.file_size)}</td>
              <td>
                <div className="row-actions">
                  {!trash ? (
                    <>
                      <IconButton
                        label={`${item.name}をダウンロード`}
                        onClick={() => onDownload(item.id)}
                      >
                        <Download size={16} aria-hidden="true" />
                      </IconButton>
                      <IconButton
                        label={`${item.name}の名前を変更`}
                        onClick={() => onRename(item)}
                      >
                        <MoreVertical size={16} aria-hidden="true" />
                      </IconButton>
                    </>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NameForm({
  value,
  submitLabel,
  loading,
  onChange,
  onSubmit,
}: {
  value: string;
  submitLabel: string;
  loading: boolean;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}) {
  const trimmed = value.trim();
  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        if (trimmed) onSubmit(trimmed);
      }}
    >
      <label className="field">
        <span>名前</span>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoFocus
        />
      </label>
      <div className="modal-actions">
        <Button type="submit" loading={loading} disabled={!trimmed}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Preview({ item }: { item: DriveItem }) {
  if (item.content_type?.startsWith("image/")) {
    return <img className="preview-media" src={previewUrl(item.id)} alt={item.name} />;
  }
  if (item.content_type === "application/pdf") {
    return (
      <iframe className="preview-frame" src={previewUrl(item.id)} title={item.name} />
    );
  }
  if (item.content_type?.startsWith("video/")) {
    return (
      <video
        className="preview-media"
        src={streamUrl(item.id)}
        controls
        preload="metadata"
      />
    );
  }
  if (item.content_type?.startsWith("audio/")) {
    return (
      <audio
        className="preview-media"
        src={streamUrl(item.id)}
        controls
        preload="metadata"
      />
    );
  }
  return <p>このファイルはプレビューできません。ダウンロードして確認してください。</p>;
}

function displayName(item: DriveItem) {
  if (item.item_type === "directory" || !item.extension) return item.name;
  return `${item.name}.${item.extension}`;
}

function formatDate(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatSize(value?: number | null) {
  if (!value) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "処理に失敗しました。";
}
