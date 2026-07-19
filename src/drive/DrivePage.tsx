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

import { ApiError, type DuplicateContentFile } from "../api/errors";
import type { DriveItem } from "../api/schemas";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { ErrorReportPanel } from "../components/ErrorReportPanel";
import { FileTypeIcon } from "../components/FileTypeIcon";
import { IconButton } from "../components/IconButton";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { Modal } from "../components/Modal";
import { useToast } from "../components/ToastProvider";
import { normalizeAppError, type AppError } from "../errors/appError";
import {
  bulkMove,
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
const DRIVE_ITEM_MIME = "application/x-mitsubachi-drive-items";

type UploadTask = {
  id: string;
  fileName: string;
  file: File;
  parentId: number | null;
  uploadName: string;
  loaded: number;
  total?: number;
  percent?: number;
  status: "uploading" | "processing" | "done" | "failed" | "canceled";
  message?: string;
  error?: AppError;
  abortController?: AbortController;
};

type ConflictState = {
  file: File;
  parentId: number | null;
  suggestedName: string;
  message: string;
  duplicateFiles: DuplicateContentFile[];
};

type Breadcrumb = NonNullable<DriveItem["breadcrumbs"]>[number];

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
  const [nameConflictMessage, setNameConflictMessage] = useState<string | null>(null);
  const [lastError, setLastError] = useState<AppError | null>(null);
  const [draggingIds, setDraggingIds] = useState<number[]>([]);
  const [dragOverFolderId, setDragOverFolderId] = useState<number | null>(null);
  const [dragOverBreadcrumbId, setDragOverBreadcrumbId] = useState<number | null>(null);

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
  const breadcrumbs = useMemo<Breadcrumb[]>(
    () => folderQuery.data?.breadcrumbs ?? [{ id: null, name: "共有ドライブ" }],
    [folderQuery.data?.breadcrumbs],
  );
  const pageLabel = breadcrumbs.map((crumb) => crumb.name).join(" / ");
  const visibleError = lastError ?? (visibleQuery.isError
    ? normalizeAppError(visibleQuery.error, {
        operation: searchTerm ? "検索" : "一覧取得",
        page: pageLabel,
      })
    : null);

  const invalidateCurrent = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: mode === "trash" ? driveKeys.trash() : driveKeys.list(folderId),
    });
  }, [folderId, mode, queryClient]);

  const captureError = useCallback(
    (
      error: unknown,
      operation: string,
      safeDetails?: Record<string, string | number | boolean | null | undefined>,
    ) => {
      const appError = normalizeAppError(error, {
        operation,
        page: pageLabel,
        safeDetails,
      });
      setLastError(appError);
      toast.show({ tone: appError.level === "warn" ? "warn" : appError.level, message: appError.message });
      if (appError.status === 401) void navigate("/login");
      if (appError.status === 404) void invalidateCurrent();
      return appError;
    },
    [invalidateCurrent, navigate, pageLabel, toast],
  );

  const createMutation = useMutation({
    mutationFn: createDirectory,
    onMutate: () => {
      setNameConflictMessage(null);
    },
    onSuccess: async () => {
      await invalidateCurrent();
      setDialog(null);
      setNameValue("");
      setNameConflictMessage(null);
      setLastError(null);
      toast.show({ tone: "success", message: "フォルダを作成しました。" });
    },
    onError: (error) => {
      if (isNameConflict(error)) {
        const appError = normalizeAppError(error, {
          operation: "フォルダー作成",
          page: pageLabel,
          safeDetails: { itemType: "directory", itemName: nameValue },
        });
        setNameConflictMessage(appError.message);
        setLastError(null);
        setConflict(null);
        setDialog("folder");
        return;
      }
      captureError(error, "フォルダー作成", { itemType: "directory", itemName: nameValue });
    },
  });
  const renameMutation = useMutation({
    mutationFn: renameDriveItem,
    onMutate: () => {
      setNameConflictMessage(null);
    },
    onSuccess: async () => {
      await invalidateCurrent();
      setDialog(null);
      setNameConflictMessage(null);
      setLastError(null);
      toast.show({ tone: "success", message: "名前を変更しました。" });
    },
    onError: (error) => {
      if (isNameConflict(error)) {
        const appError = normalizeAppError(error, {
          operation: "リネーム",
          page: pageLabel,
          safeDetails: {
            itemType: activeItem?.item_type,
            itemName: nameValue,
          },
        });
        setNameConflictMessage(appError.message);
        setLastError(null);
        setDialog("rename");
        return;
      }
      captureError(error, "リネーム", {
        itemType: activeItem?.item_type,
        itemName: nameValue,
      });
    },
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
      setLastError(null);
      toast.show({
        tone: "success",
        message: response.message ?? "一括操作が完了しました。",
      });
    },
    onError: (error) => captureError(error, selectedIds.length > 1 ? "一括削除" : "削除"),
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
      setLastError(null);
      toast.show({ tone: "success", message: "一括操作が完了しました。" });
    },
    onError: (error) => captureError(error, selectedIds.length > 1 ? "一括復元" : "復元"),
  });
  const bulkDownloadMutation = useMutation({
    mutationFn: () => bulkDownload(selectedIds),
    onError: (error) => captureError(error, "一括ダウンロード"),
  });
  const moveMutation = useMutation({
    mutationFn: async ({ ids, parentId }: { ids: number[]; parentId: number | null; targetName: string }) =>
      bulkMove(ids, parentId),
    onSuccess: async () => {
      await invalidateCurrent();
      await queryClient.invalidateQueries({ queryKey: driveKeys.all });
      setSelectedIds([]);
      setDraggingIds([]);
      setDragOverFolderId(null);
      setDragOverBreadcrumbId(null);
      setLastError(null);
      toast.show({ tone: "success", message: "移動しました。" });
    },
    onError: (error, variables) =>
      captureError(error, variables.ids.length > 1 ? "一括ドラッグ移動" : "ドラッグ移動", {
        targetFolder: variables.targetName,
      }),
    onSettled: () => {
      setDraggingIds([]);
      setDragOverFolderId(null);
      setDragOverBreadcrumbId(null);
    },
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
    async (
      file: File,
      parentId: number | null,
      nameOverride?: string,
      options: { allowDuplicateContent?: boolean } = {},
    ) => {
      const taskId = `${Date.now()}-${Math.random()}`;
      const abortController = new AbortController();
      const uploadName = nameOverride ?? file.name.replace(/\.[^.]+$/, "");
      setUploadTasks((current) => [
        ...current,
        {
          id: taskId,
          fileName: file.name,
          file,
          parentId,
      uploadName,
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
          name: uploadName,
          parentId,
          allowDuplicateContent: options.allowDuplicateContent,
          signal: abortController.signal,
          onProgress: (progress) => updateUploadTask(taskId, progress),
        });
        updateUploadTask(taskId, { status: "processing", percent: 100 });
        updateUploadTask(taskId, { status: "done", message: "完了" });
        return "done";
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          updateUploadTask(taskId, { status: "canceled", message: "キャンセルしました" });
          return "failed";
        }
        const appError = normalizeAppError(error, {
          operation: "ファイルアップロード",
          page: pageLabel,
          safeDetails: { itemType: "file", itemName: file.name },
        });
        if (isNameConflict(error)) {
          const suggestedName = suggestedUploadName(error, file, items, parentId);
          setConflict({
            file,
            parentId,
            suggestedName,
            message: appError.message,
            duplicateFiles: error instanceof ApiError ? error.duplicateFiles : [],
          });
          setNameValue(suggestedName);
          setLastError(null);
          updateUploadTask(taskId, {
            status: "failed",
            message: appError.message,
            error: appError,
          });
          setDialog("conflict");
          return "conflict";
        }
        setLastError(appError);
        updateUploadTask(taskId, {
          status: "failed",
          message: appError.message,
          error: appError,
        });
        return "failed";
      }
    },
    [items, pageLabel, updateUploadTask],
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
      let conflicted = 0;

      try {
        for (const file of files) {
          const result = await uploadSingleFile(file, folderId);
          if (result === "done") succeeded += 1;
          if (result === "conflict") conflicted += 1;
        }

        if (succeeded > 0) await invalidateCurrent();

        toast.show({
          tone: succeeded === files.length ? "success" : succeeded > 0 || conflicted > 0 ? "info" : "danger",
          message:
            succeeded === files.length
              ? `${succeeded}件アップロードしました。`
              : succeeded > 0
                ? `${succeeded}件アップロードしました。${files.length - succeeded}件失敗しました。`
                : conflicted > 0
                  ? "同名または同一内容のファイルがあります。名前を確認してください。"
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
      let conflicted = 0;
      try {
        for (const file of safeFiles) {
          const segments = relativePathSegments(file);
          const fileParentId = await ensureDirectoryPath(segments.slice(0, -1));
          const result = await uploadSingleFile(file, fileParentId);
          if (result === "done") succeeded += 1;
          if (result === "conflict") conflicted += 1;
        }
        if (succeeded > 0) await invalidateCurrent();
        toast.show({
          tone: succeeded === safeFiles.length ? "success" : succeeded > 0 || conflicted > 0 ? "info" : "danger",
          message:
            conflicted > 0 && succeeded === 0
              ? "同名または同一内容のファイルがあります。名前を確認してください。"
              : `${succeeded} / ${safeFiles.length} 件アップロードしました。`,
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

    void filesFromDataTransfer(event.dataTransfer).then((files) => {
      if (files.length === 0) {
        toast.show({
          tone: "info",
          message: "アップロードできるファイルがありません。",
        });
        return;
      }

      if (files.some((file) => (file as File & { webkitRelativePath?: string }).webkitRelativePath)) {
        void uploadDirectory(files);
      } else {
        void uploadFiles(files);
      }
    });
  };

  const moveDraggedItems = useCallback(
    (itemIds: number[], targetParentId: number | null, targetName: string) => {
      if (itemIds.length === 0 || moveMutation.isPending) return;
      const movingItems = items.filter((item) => itemIds.includes(item.id));
      if (movingItems.every((item) => (item.parent_id ?? null) === targetParentId)) {
        const appError = normalizeAppError(new Error("同じ場所へは移動できません。"), {
          operation: itemIds.length > 1 ? "一括移動" : "移動",
          page: pageLabel,
          safeDetails: { targetFolder: targetName },
        });
        setLastError(appError);
        return;
      }
      moveMutation.mutate({ ids: itemIds, parentId: targetParentId, targetName });
    },
    [items, moveMutation, pageLabel],
  );

  const startItemDrag = useCallback(
    (event: React.DragEvent, item: DriveItem) => {
      if (mode === "trash") return;
      const ids = selectedIds.includes(item.id) ? selectedIds : [item.id];
      setDraggingIds(ids);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(DRIVE_ITEM_MIME, JSON.stringify({ itemIds: ids }));
      event.dataTransfer.setData("text/plain", `${ids.length}件を移動`);
    },
    [mode, selectedIds],
  );

  const endItemDrag = useCallback(() => {
    setDraggingIds([]);
    setDragOverFolderId(null);
    setDragOverBreadcrumbId(null);
  }, []);

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
        <nav className="breadcrumbs" aria-label="パンくず">
          {breadcrumbs.map((crumb, index) => {
            const current = index === breadcrumbs.length - 1;
            const to = crumb.id === null ? "/drive" : `/drive/folder/${crumb.id}`;
            return (
              <span
                key={crumb.id ?? "root"}
                className={`breadcrumb-item ${dragOverBreadcrumbId === crumb.id ? "drop-target" : ""}`.trim()}
                onDragOver={(event) => {
                  if (draggingIds.length === 0 || current) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDragOverBreadcrumbId(crumb.id);
                }}
                onDragLeave={() => setDragOverBreadcrumbId(null)}
                onDrop={(event) => {
                  if (draggingIds.length === 0 || current) return;
                  const payload = dragMovePayload(event.dataTransfer);
                  if (!payload) return;
                  event.preventDefault();
                  moveDraggedItems(payload.itemIds, crumb.id, crumb.name);
                }}
              >
                {index > 0 ? <span aria-hidden="true">/</span> : null}
                {current ? (
                  <span aria-current="page">{crumb.name}</span>
                ) : (
                  <Link to={to}>{crumb.name}</Link>
                )}
              </span>
            );
          })}
        </nav>
        {draggingIds.length > 0 ? (
          <p className="drag-status" role="status">{draggingIds.length}件を移動中</p>
        ) : null}
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
          onRetry={(task) => void uploadSingleFile(task.file, task.parentId, task.uploadName)}
        />
      ) : null}
      {visibleError ? (
        <ErrorReportPanel
          error={visibleError}
          onRetry={() => {
            if (visibleError.operation?.includes("検索")) void searchQuery.refetch();
            else void visibleQuery.refetch();
          }}
        />
      ) : null}
      {visibleQuery.isLoading ? <LoadingIndicator label="一覧を読み込んでいます" /> : null}
      {visibleQuery.isError ? (
        <ErrorState
          message={errorMessage(visibleQuery.error)}
          onRetry={() => {
            captureError(visibleQuery.error, searchTerm ? "検索" : "一覧取得");
            void visibleQuery.refetch();
          }}
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
            setNameConflictMessage(null);
            setDialog("rename");
          }}
          onDownload={downloadDriveItem}
          onDragStart={startItemDrag}
          onDragEnd={endItemDrag}
          onDropToFolder={(event, item) => {
            const payload = dragMovePayload(event.dataTransfer);
            if (!payload) return;
            moveDraggedItems(payload.itemIds, item.id, item.name);
          }}
          onDragOverFolder={setDragOverFolderId}
          onOpenParent={(parentId) => void navigate(parentId === null ? "/drive" : `/drive/folder/${parentId}`)}
          draggingIds={draggingIds}
          dragOverFolderId={dragOverFolderId}
          trash={mode === "trash"}
          searchMode={Boolean(searchTerm)}
        />
      ) : null}
      <Modal
        open={dialog === "folder"}
        title="新しいフォルダ"
        onClose={() => {
          setDialog(null);
          setNameConflictMessage(null);
        }}
      >
        <NameForm
          value={nameValue}
          submitLabel="作成"
          loading={createMutation.isPending}
          message={dialog === "folder" ? (nameConflictMessage ?? undefined) : undefined}
          messageTone="info"
          onChange={setNameValue}
          onSubmit={(name) => createMutation.mutate({ name, parentId: folderId })}
        />
      </Modal>
      <Modal
        open={dialog === "rename"}
        title="名前を変更"
        onClose={() => {
          setDialog(null);
          setNameConflictMessage(null);
        }}
      >
        <NameForm
          value={nameValue}
          submitLabel="変更"
          loading={renameMutation.isPending}
          message={dialog === "rename" ? (nameConflictMessage ?? undefined) : undefined}
          messageTone="info"
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
            messageTone="info"
            duplicateFiles={conflict.duplicateFiles}
            onOpenDuplicateLocation={(parentId) => {
              setDialog(null);
              void navigate(parentId === null ? "/drive" : `/drive/folder/${parentId}`);
            }}
            onChange={setNameValue}
            onSubmit={(name) => {
              setDialog(null);
              void uploadSingleFile(conflict.file, conflict.parentId, name, {
                allowDuplicateContent: conflict.duplicateFiles.length > 0,
              }).then(
                async (succeeded) => {
                  if (succeeded === "done") await invalidateCurrent();
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
  onDragStart,
  onDragEnd,
  onDropToFolder,
  onDragOverFolder,
  onOpenParent,
  draggingIds,
  dragOverFolderId,
}: {
  items: DriveItem[];
  selectedIds: number[];
  trash: boolean;
  searchMode: boolean;
  onToggle: (id: number) => void;
  onOpen: (item: DriveItem) => void;
  onRename: (item: DriveItem) => void;
  onDownload: (id: number) => void;
  onDragStart: (event: React.DragEvent, item: DriveItem) => void;
  onDragEnd: () => void;
  onDropToFolder: (event: React.DragEvent, item: DriveItem) => void;
  onDragOverFolder: (id: number | null) => void;
  onOpenParent: (parentId: number | null) => void;
  draggingIds: number[];
  dragOverFolderId: number | null;
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
              className={[
                selectedIds.includes(item.id) ? "selected" : "",
                item.item_type === "directory" ? "directory-row" : "",
                draggingIds.includes(item.id) ? "dragging-row" : "",
                dragOverFolderId === item.id ? "drop-target" : "",
              ].filter(Boolean).join(" ")}
              tabIndex={0}
              draggable={!trash}
              onDragStart={(event) => onDragStart(event, item)}
              onDragEnd={onDragEnd}
              onDragOver={(event) => {
                if (item.item_type !== "directory" || draggingIds.length === 0) return;
                if (draggingIds.includes(item.id)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                onDragOverFolder(item.id);
              }}
              onDragLeave={() => onDragOverFolder(null)}
              onDrop={(event) => {
                if (item.item_type !== "directory" || draggingIds.length === 0) return;
                if (!dragMovePayload(event.dataTransfer)) return;
                event.preventDefault();
                onDropToFolder(event, item);
              }}
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
                  <button
                    type="button"
                    className="file-location"
                    onClick={() => onOpenParent(item.parent_id ?? null)}
                  >
                    場所: {item.parent_name}
                  </button>
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
  messageTone = "danger",
  duplicateFiles = [],
  onOpenDuplicateLocation,
  onChange,
  onSubmit,
}: {
  value: string;
  submitLabel: string;
  loading: boolean;
  message?: string;
  messageTone?: "info" | "warn" | "danger";
  duplicateFiles?: DuplicateContentFile[];
  onOpenDuplicateLocation?: (parentId: number | null) => void;
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
      {message ? <p className={`form-message form-message-${messageTone}`}>{message}</p> : null}
      {duplicateFiles.length > 0 ? (
        <div className="duplicate-files" aria-label="同じ内容の既存ファイル">
          <ul>
            {duplicateFiles.map((file) => (
              <li key={file.id}>
                <div>
                  <strong>{file.name}</strong>
                  <span>保存先: {file.deleted ? "ごみ箱" : (file.parent_name ?? "共有ドライブ")}</span>
                  {file.owner_display_name ? <span>アップロード者: {file.owner_display_name}</span> : null}
                  {file.created_at ? <span>作成日時: {formatDate(file.created_at)}</span> : null}
                  <span>サイズ: {formatSize(file.file_size)}</span>
                </div>
                {!file.deleted && onOpenDuplicateLocation ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => onOpenDuplicateLocation(file.parent_id)}
                  >
                    保存先を開く
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
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
  onRetry,
}: {
  tasks: UploadTask[];
  onCancel: (task: UploadTask) => void;
  onRetry: (task: UploadTask) => void;
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
            {task.status === "failed" ? (
              <Button type="button" variant="secondary" onClick={() => onRetry(task)}>
                再試行
              </Button>
            ) : null}
            <ProgressBar percent={task.percent} />
            {task.error ? <ErrorReportPanel error={task.error} onRetry={() => onRetry(task)} /> : null}
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
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    (error.code === "duplicate_name" || error.code === "name_conflict" || error.code === "duplicate_content")
  );
}

function suggestedUploadName(
  error: unknown,
  file: File,
  items: DriveItem[],
  parentId: number | null,
) {
  if (error instanceof ApiError && typeof error.safeDetails?.suggested_name === "string") {
    return error.safeDetails.suggested_name;
  }
  const existingFilenames = items
    .filter((item) => (item.parent_id ?? null) === parentId && item.item_type === "file")
    .map(displayName);
  return nextAvailableUploadName(file.name, existingFilenames);
}

function nextAvailableUploadName(filename: string, existingFilenames: string[]) {
  const match = /^(.*?)(\.[^.]+)?$/.exec(filename);
  const base = match?.[1] || filename;
  const extension = match?.[2] ?? "";
  const existing = new Set(existingFilenames);
  if (!existing.has(`${base}${extension}`)) return base;

  let index = 1;
  while (existing.has(`${base}（${index}）${extension}`)) {
    index += 1;
  }
  return `${base}（${index}）`;
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

function dragMovePayload(dataTransfer: DataTransfer) {
  const raw = dataTransfer.getData(DRIVE_ITEM_MIME);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (isDragMovePayload(parsed)) {
      return { itemIds: parsed.itemIds };
    }
  } catch {
    return null;
  }

  return null;
}

function isDragMovePayload(value: unknown): value is { itemIds: number[] } {
  if (typeof value !== "object" || value === null || !("itemIds" in value)) {
    return false;
  }
  const itemIds = value.itemIds;
  return Array.isArray(itemIds) && itemIds.every((id) => Number.isInteger(id));
}

async function filesFromDataTransfer(dataTransfer: DataTransfer) {
  const entries: BrowserFileSystemEntry[] = [];
  for (const item of Array.from(dataTransfer.items)) {
    const entryItem = item as DataTransferItem & {
      webkitGetAsEntry?: () => unknown;
    };
    const entry = entryItem.webkitGetAsEntry?.();
    if (isBrowserFileSystemEntry(entry)) entries.push(entry);
  }

  if (entries.some((entry) => entry.isDirectory)) {
    const files = await Promise.all(entries.map((entry) => filesFromEntry(entry, "")));
    return files.flat();
  }

  if (dataTransfer.items.length > 0) {
    return Array.from(dataTransfer.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
  }

  return Array.from(dataTransfer.files);
}

type BrowserFileSystemEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
};

function isBrowserFileSystemEntry(value: unknown): value is BrowserFileSystemEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    "isFile" in value &&
    "isDirectory" in value &&
    "name" in value
  );
}

type BrowserFileSystemFileEntry = BrowserFileSystemEntry & {
  file: (success: (file: File) => void, failure: (error: DOMException) => void) => void;
};

type BrowserFileSystemDirectoryEntry = BrowserFileSystemEntry & {
  createReader: () => {
    readEntries: (
      success: (entries: BrowserFileSystemEntry[]) => void,
      failure: (error: DOMException) => void,
    ) => void;
  };
};

async function filesFromEntry(entry: BrowserFileSystemEntry, parentPath: string): Promise<File[]> {
  const path = parentPath ? `${parentPath}/${entry.name}` : entry.name;
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      (entry as BrowserFileSystemFileEntry).file(resolve, reject);
    });
    Object.defineProperty(file, "webkitRelativePath", { value: path, configurable: true });
    return [file];
  }

  const directory = entry as BrowserFileSystemDirectoryEntry;
  const children = await new Promise<BrowserFileSystemEntry[]>((resolve, reject) => {
    directory.createReader().readEntries(resolve, reject);
  });
  const nestedFiles = await Promise.all(
    children.map((child) => filesFromEntry(child, path)),
  );
  return nestedFiles.flat();
}
