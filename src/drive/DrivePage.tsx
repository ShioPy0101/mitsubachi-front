import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  FilePlus,
  FolderPlus,
  MoreVertical,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { ApiError } from "../api/errors";
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
  searchDriveItems,
  previewUrl,
  renameDriveItem,
  restoreDriveItem,
  streamUrl,
  uploadFile,
} from "./api";

type DriveMode = "drive" | "trash";

type UploadTask = {
  id: string;
  fileName: string;
  loaded: number;
  total?: number;
  percent?: number;
  status: "uploading" | "processing" | "done" | "failed" | "canceled";
  message?: string;
  abortController?: AbortController;
};

type ConflictState = {
  file: File;
  parentId: number | null;
  suggestedName: string;
  message: string;
};

export function DrivePage({ mode = "drive" }: { mode?: DriveMode }) {
  const params = useParams();
  const folderId = params.folderId ? Number(params.folderId) : null;
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const directoryInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const uploadInProgressRef = useRef(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [dialog, setDialog] = useState<
    "folder" | "rename" | "delete" | "preview" | "conflict" | null
  >(null);
  const [activeItem, setActiveItem] = useState<DriveItem | null>(null);
  const [nameValue, setNameValue] = useState("");
  const [searchInput, setSearchInput] = useState(searchParams.get("q") ?? "");
  const searchScope =
    searchParams.get("scope") === "organization" ? "organization" : "current";
  const searchTerm = searchParams.get("q")?.trim() ?? "";
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [conflict, setConflict] = useState<ConflictState | null>(null);

  const listQuery = useQuery({
    queryKey: mode === "trash" ? driveKeys.trash() : driveKeys.list(folderId),
    queryFn: () => (mode === "trash" ? fetchTrash() : fetchDriveItems(folderId)),
  });
  const folderQuery = useQuery({
    queryKey: folderId ? driveKeys.detail(folderId) : ["drive-items", "root"],
    queryFn: () => (folderId ? fetchDriveItem(folderId) : Promise.resolve(null)),
    enabled: mode === "drive" && folderId !== null,
  });
  const searchQuery = useQuery({
    queryKey: ["drive-items", "search", { folderId, searchTerm, searchScope }],
    queryFn: () =>
      searchDriveItems({
        query: searchTerm,
        parentId: folderId,
        scope: searchScope,
      }),
    enabled: mode === "drive" && searchTerm.length > 0,
  });

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      if (searchInput.trim()) {
        next.set("q", searchInput.trim());
        next.set("scope", searchScope);
      } else {
        next.delete("q");
        next.delete("scope");
      }
      setSearchParams(next, { replace: true });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [searchInput, searchParams, searchScope, setSearchParams]);

  const visibleQuery = searchTerm ? searchQuery : listQuery;
  const items = useMemo(
    () => (searchTerm ? searchQuery.data?.data : listQuery.data) ?? [],
    [listQuery.data, searchQuery.data, searchTerm],
  );
  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.includes(item.id)),
    [items, selectedIds],
  );

  const invalidateCurrent = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: mode === "trash" ? driveKeys.trash() : driveKeys.list(folderId),
    });
  }, [folderId, mode, queryClient]);

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

  const updateUploadTask = useCallback((id: string, patch: Partial<UploadTask>) => {
    setUploadTasks((current) =>
      current.map((task) => (task.id === id ? { ...task, ...patch } : task)),
    );
  }, []);

  const uploadSingleFile = useCallback(
    async (file: File, parentId: number | null, nameOverride?: string) => {
      const taskId = `${Date.now()}-${Math.random()}`;
      const abortController = new AbortController();
      setUploadTasks((current) => [
        ...current,
        {
          id: taskId,
          fileName: file.name,
          loaded: 0,
          total: file.size,
          percent: 0,
          status: "uploading",
          abortController,
        },
      ]);

      try {
        await uploadFile({
          file,
          name: nameOverride ?? file.name.replace(/\.[^.]+$/, ""),
          parentId,
          signal: abortController.signal,
          onProgress: (progress) => updateUploadTask(taskId, progress),
        });
        updateUploadTask(taskId, { status: "processing", percent: 100 });
        updateUploadTask(taskId, { status: "done", message: "完了" });
        return true;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          updateUploadTask(taskId, { status: "canceled", message: "キャンセルしました" });
          return false;
        }
        updateUploadTask(taskId, {
          status: "failed",
          message: errorMessage(error),
        });
        if (isNameConflict(error)) {
          setConflict({
            file,
            parentId,
            suggestedName: nextAvailableName(file.name),
            message: `「${file.name}」はすでに存在します。別の名前を入力してください。`,
          });
          setNameValue(nextAvailableName(file.name).replace(/\.[^.]+$/, ""));
          setDialog("conflict");
        }
        return false;
      }
    },
    [updateUploadTask],
  );

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (mode !== "drive" || files.length === 0) return;

      if (uploadInProgressRef.current) {
        toast.show({
          tone: "info",
          message: "アップロード中です。完了してから再度実行してください。",
        });
        return;
      }

      uploadInProgressRef.current = true;
      setIsUploading(true);
      let succeeded = 0;

      try {
        for (const file of files) {
          if (await uploadSingleFile(file, folderId)) succeeded += 1;
        }

        if (succeeded > 0) await invalidateCurrent();

        toast.show({
          tone: succeeded === files.length ? "success" : succeeded > 0 ? "info" : "danger",
          message:
            succeeded === files.length
              ? `${succeeded}件アップロードしました。`
              : succeeded > 0
                ? `${succeeded}件アップロードしました。${files.length - succeeded}件失敗しました。`
                : "アップロードに失敗しました。",
        });
      } finally {
        uploadInProgressRef.current = false;
        setIsUploading(false);
      }
    },
    [folderId, invalidateCurrent, mode, toast, uploadSingleFile],
  );

  const ensureDirectoryPath = useCallback(
    async (segments: string[]) => {
      let parentId = folderId;
      for (const segment of segments) {
        const siblings = await fetchDriveItems(parentId);
        const existing = siblings.find(
          (item) => item.item_type === "directory" && item.name === segment,
        );
        if (existing) {
          parentId = existing.id;
          continue;
        }
        const created = await createDirectory({ name: segment, parentId });
        parentId = created.id;
      }
      return parentId;
    },
    [folderId],
  );

  const uploadDirectory = useCallback(
    async (files: File[]) => {
      const safeFiles = files.filter((file) => safeRelativePath(file));
      if (safeFiles.length !== files.length) {
        toast.show({ tone: "danger", message: "安全でないパスを含むファイルは除外しました。" });
      }
      if (safeFiles.length === 0) return;
      if (uploadInProgressRef.current) {
        toast.show({ tone: "info", message: "アップロード中です。完了してから再度実行してください。" });
        return;
      }

      uploadInProgressRef.current = true;
      setIsUploading(true);
      let succeeded = 0;
      try {
        for (const file of safeFiles) {
          const segments = relativePathSegments(file);
          const fileParentId = await ensureDirectoryPath(segments.slice(0, -1));
          if (await uploadSingleFile(file, fileParentId)) succeeded += 1;
        }
        if (succeeded > 0) await invalidateCurrent();
        toast.show({
          tone: succeeded === safeFiles.length ? "success" : "info",
          message: `${succeeded} / ${safeFiles.length} 件アップロードしました。`,
        });
      } finally {
        uploadInProgressRef.current = false;
        setIsUploading(false);
      }
    },
    [ensureDirectoryPath, invalidateCurrent, toast, uploadSingleFile],
  );

  const handleUpload = (files: FileList | null) => {
    if (!files?.length) return;
    void uploadFiles(Array.from(files));
  };

  const handleDirectoryUpload = (files: FileList | null) => {
    if (!files?.length) return;
    void uploadDirectory(Array.from(files));
  };

  const handleDragEnter = (event: React.DragEvent<HTMLElement>) => {
    if (mode !== "drive" || !hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingFiles(true);
  };

  const handleDragOver = (event: React.DragEvent<HTMLElement>) => {
    if (mode !== "drive" || !hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = uploadInProgressRef.current ? "none" : "copy";
  };

  const handleDragLeave = (event: React.DragEvent<HTMLElement>) => {
    if (mode !== "drive" || !hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingFiles(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLElement>) => {
    if (mode !== "drive" || !hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);

    const files = filesFromDataTransfer(event.dataTransfer);
    if (files.length === 0) {
      toast.show({
        tone: "info",
        message: "アップロードできるファイルがありません。",
      });
      return;
    }

    void uploadFiles(files);
  };

  useEffect(() => {
    const preventFileOpen = (event: DragEvent) => {
      if (!event.dataTransfer || !hasFiles(event.dataTransfer)) return;
      event.preventDefault();
    };

    window.addEventListener("dragover", preventFileOpen);
    window.addEventListener("drop", preventFileOpen);
    return () => {
      window.removeEventListener("dragover", preventFileOpen);
      window.removeEventListener("drop", preventFileOpen);
    };
  }, []);

  return (
    <section
      className={`drive-page ${isDraggingFiles ? "drag-active" : ""}`.trim()}
      aria-busy={visibleQuery.isFetching || isUploading}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {mode === "drive" && isDraggingFiles ? (
        <div className="drop-overlay" role="status" aria-live="polite">
          <FilePlus size={20} aria-hidden="true" />
          <span>ここにファイルをドロップしてアップロード</span>
        </div>
      ) : null}
      <div className="page-header">
        <div className="breadcrumbs" aria-label="パンくず">
          <Link to="/drive">共有ドライブ</Link>
          {folderQuery.data ? (
            <span aria-current="page">/ {folderQuery.data.name}</span>
          ) : null}
        </div>
        <h1>
          {mode === "trash" ? "ゴミ箱" : (folderQuery.data?.name ?? "共有ドライブ")}
        </h1>
      </div>
      {mode === "drive" ? (
        <form
          className="drive-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            const next = new URLSearchParams(searchParams);
            if (searchInput.trim()) next.set("q", searchInput.trim());
            else next.delete("q");
            next.set("scope", searchScope);
            setSearchParams(next);
          }}
        >
          <label className="field drive-search-field">
            <span>ファイル・フォルダーを検索</span>
            <div className="search-input">
              <Search size={16} aria-hidden="true" />
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="ファイル名、拡張子、作成者名"
              />
              {searchInput ? (
                <IconButton label="検索を解除" onClick={() => setSearchInput("")}>
                  <X size={16} aria-hidden="true" />
                </IconButton>
              ) : null}
            </div>
          </label>
          <label className="field scope-field">
            <span>検索範囲</span>
            <select
              value={searchScope}
              onChange={(event) => {
                const next = new URLSearchParams(searchParams);
                next.set("scope", event.target.value);
                setSearchParams(next);
              }}
            >
              <option value="current">現在のフォルダー</option>
              <option value="organization">グループ全体</option>
            </select>
          </label>
        </form>
      ) : null}
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
                  loading={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FilePlus size={16} aria-hidden="true" />
                  ファイルアップロード
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  loading={isUploading}
                  onClick={() => directoryInputRef.current?.click()}
                >
                  <UploadCloud size={16} aria-hidden="true" />
                  フォルダーアップロード
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
          disabled={isUploading}
          onChange={(event) => {
            handleUpload(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />
        <input
          ref={directoryInputRef}
          className="visually-hidden"
          type="file"
          multiple
          disabled={isUploading}
          onChange={(event) => {
            handleDirectoryUpload(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
          {...{ webkitdirectory: "" }}
        />
      </div>
      {uploadTasks.length > 0 ? (
        <UploadProgressPanel
          tasks={uploadTasks}
          onCancel={(task) => task.abortController?.abort()}
        />
      ) : null}
      {visibleQuery.isLoading ? <LoadingIndicator label="一覧を読み込んでいます" /> : null}
      {visibleQuery.isError ? (
        <ErrorState
          message={errorMessage(visibleQuery.error)}
          onRetry={() => void visibleQuery.refetch()}
        />
      ) : null}
      {!visibleQuery.isLoading && !visibleQuery.isError && items.length === 0 ? (
        <EmptyState
          title={searchTerm ? "検索結果はありません。" : mode === "trash" ? "ゴミ箱は空です。" : "このフォルダは空です。"}
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
          searchMode={Boolean(searchTerm)}
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
      <Modal
        open={dialog === "conflict"}
        title="名前の重複"
        onClose={() => setDialog(null)}
      >
        {conflict ? (
          <NameForm
            value={nameValue}
            submitLabel="名前を変更して再試行"
            loading={isUploading}
            message={conflict.message}
            onChange={setNameValue}
            onSubmit={(name) => {
              setDialog(null);
              void uploadSingleFile(conflict.file, conflict.parentId, name).then(
                async (succeeded) => {
                  if (succeeded) await invalidateCurrent();
                },
              );
            }}
          />
        ) : null}
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
        {dialog === "preview" && activeItem ? <Preview item={activeItem} /> : null}
      </Modal>
    </section>
  );
}

function FileTable({
  items,
  selectedIds,
  trash,
  searchMode,
  onToggle,
  onOpen,
  onRename,
  onDownload,
}: {
  items: DriveItem[];
  selectedIds: number[];
  trash: boolean;
  searchMode: boolean;
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
            <th scope="col">作成者</th>
            <th scope="col">更新日時</th>
            <th scope="col">サイズ</th>
            <th scope="col">操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className={`${selectedIds.includes(item.id) ? "selected" : ""} ${item.item_type === "directory" ? "directory-row" : ""}`.trim()}
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
                  {item.owner_display_name ?? "不明"} ・ {formatDate(item.updated_at)} ・ {formatSize(item.file_size)}
                  {searchMode && item.parent_name ? ` ・ ${item.parent_name}` : ""}
                </span>
                {searchMode && item.parent_name ? (
                  <span className="file-location">場所: {item.parent_name}</span>
                ) : null}
              </td>
              <td>{item.owner_display_name ?? "不明"}</td>
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
  message,
  onChange,
  onSubmit,
}: {
  value: string;
  submitLabel: string;
  loading: boolean;
  message?: string;
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
      {message ? <p className="form-message">{message}</p> : null}
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

function UploadProgressPanel({
  tasks,
  onCancel,
}: {
  tasks: UploadTask[];
  onCancel: (task: UploadTask) => void;
}) {
  const total = tasks.reduce((sum, task) => sum + (task.total ?? 0), 0);
  const loaded = tasks.reduce((sum, task) => sum + task.loaded, 0);
  const percent = total ? Math.round((loaded / total) * 100) : undefined;
  return (
    <section className="upload-progress" aria-label="アップロード進捗">
      <div className="upload-progress-header">
        <h2>アップロード状況</h2>
        <span>
          {tasks.filter((task) => task.status === "done").length} / {tasks.length} 件完了
        </span>
      </div>
      <ProgressBar percent={percent} />
      <ul>
        {tasks.map((task) => (
          <li key={task.id}>
            <div>
              <strong>{task.fileName}</strong>
              <span>
                {formatSize(task.loaded)} / {formatSize(task.total)}{" "}
                {task.percent !== undefined ? `${task.percent}%` : ""}
              </span>
              <span>{uploadStatusText(task)}</span>
            </div>
            {task.status === "uploading" ? (
              <Button type="button" variant="ghost" onClick={() => onCancel(task)}>
                キャンセル
              </Button>
            ) : null}
            <ProgressBar percent={task.percent} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProgressBar({ percent }: { percent?: number }) {
  return (
    <div className="progress-bar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} role="progressbar">
      <span style={{ width: `${percent ?? 100}%` }} />
    </div>
  );
}

function Preview({ item }: { item: DriveItem }) {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const stopMedia = useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;
    media.pause();
    media.currentTime = 0;
    media.removeAttribute("src");
    media.load();
  }, []);

  useEffect(() => stopMedia, [stopMedia]);

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
        ref={(element) => {
          if (element) mediaRef.current = element;
        }}
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
        ref={(element) => {
          if (element) mediaRef.current = element;
        }}
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

function uploadStatusText(task: UploadTask) {
  if (task.status === "processing") return "アップロード完了。サーバーで処理しています。";
  if (task.status === "done") return "完了";
  if (task.status === "failed") return task.message ?? "失敗";
  if (task.status === "canceled") return "キャンセルしました";
  return "アップロード中";
}

function isNameConflict(error: unknown) {
  return error instanceof ApiError && error.status === 409 && error.code === "name_conflict";
}

function nextAvailableName(filename: string) {
  const match = /^(.*?)(\.[^.]+)?$/.exec(filename);
  const base = match?.[1] || filename;
  const extension = match?.[2] ?? "";
  return `${base} (2)${extension}`;
}

function relativePathSegments(file: File) {
  const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  return (relativePath || file.name).split(/[\\/]+/).filter(Boolean);
}

function safeRelativePath(file: File) {
  return relativePathSegments(file).every(
    (part) =>
      part !== "." &&
      part !== ".." &&
      Array.from(part).every((char) => {
        const code = char.charCodeAt(0);
        return code > 31 && code !== 127;
      }),
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "処理に失敗しました。";
}

function hasFiles(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.types).includes("Files");
}

function filesFromDataTransfer(dataTransfer: DataTransfer) {
  if (dataTransfer.items.length > 0) {
    return Array.from(dataTransfer.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
  }

  return Array.from(dataTransfer.files);
}
