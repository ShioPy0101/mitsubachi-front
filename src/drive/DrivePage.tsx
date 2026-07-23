import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  FilePlus,
  FolderPlus,
  MoreVertical,
  Move,
  RefreshCw,
  RotateCcw,
  Search,
  Share2,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import {
  ApiError,
  type DuplicateContentFile,
  type TrashDuplicate,
} from "../api/errors";
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
import {
  createExternalShare,
  regenerateExternalSharePassword,
  type ExternalShare,
} from "../externalShares/api";
import { normalizeAppError, type AppError } from "../errors/appError";
import {
  bulkMove,
  bulkDelete,
  bulkDownload,
  bulkPurge,
  bulkRestore,
  bulkRestorePreview,
  createDirectory,
  deleteDriveItem,
  downloadDriveItem,
  driveKeys,
  fetchDriveItem,
  fetchDriveItems,
  fetchTrash,
  purgeDriveItem,
  searchDriveItems,
  previewUrl,
  renameDriveItem,
  restoreDriveItem,
  restorePreview,
  streamUrl,
  uploadFile,
  normalizeRestorePreview,
  type RestoreConflictResolution,
  type RestorePreviewItem,
  type RestorePreviewRequestItem,
  type RestorePreviewResponse,
} from "./api";

type DriveMode = "drive" | "trash";
const DRIVE_ITEM_MIME = "application/x-mitsubachi-drive-items";
const DRIVE_OPEN_DISTANCE_THRESHOLD = 5;
const FILE_LIST_INITIAL_VIEWPORT_HEIGHT = 640;
const MENU_VIEWPORT_PADDING = 8;
const MENU_OFFSET = 6;

type UploadTask = {
  id: string;
  fileName: string;
  file: File;
  parentId: number | null;
  uploadName: string;
  loaded: number;
  total?: number;
  percent?: number;
  status:
    | "uploading"
    | "processing"
    | "done"
    | "restored"
    | "conflict"
    | "failed"
    | "canceled"
    | "retried";
  message?: string;
  error?: AppError;
  abortController?: AbortController;
  sourceTaskId?: string;
};

type UploadPanelState = "expanded" | "completed" | "dismissed";
type UploadPanelPreference = "auto" | "expanded" | "dismissed";
type TrashDuplicateResolutionState =
  | "choice"
  | "restoring"
  | "restore_parent_missing"
  | "uploading_anyway"
  | "purge_confirm"
  | "purging_and_uploading";

type NameConflictState = {
  kind: "name";
  taskId: string;
  file: File;
  parentId: number | null;
  suggestedName: string;
  message: string;
  duplicateFiles: DuplicateContentFile[];
};
type ActiveContentConflictState = {
  kind: "active_content";
  taskId: string;
  file: File;
  parentId: number | null;
  uploadName: string;
  message: string;
  duplicateFiles: DuplicateContentFile[];
};
type TrashContentConflictState = {
  kind: "trash_content";
  taskId: string;
  file: File;
  parentId: number | null;
  uploadName: string;
  message: string;
  duplicate: TrashDuplicate;
};
type ConflictState =
  NameConflictState | ActiveContentConflictState | TrashContentConflictState;

type Breadcrumb = NonNullable<DriveItem["breadcrumbs"]>[number];
type MoveDialogState = {
  items: DriveItem[];
  destinationId: number | null;
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
    | "folder"
    | "rename"
    | "delete"
    | "purge"
    | "preview"
    | "conflict"
    | "restorePreview"
    | "move"
    | "externalShare"
    | "duplicateBulkUpload"
    | null
  >(null);
  const [activeItem, setActiveItem] = useState<DriveItem | null>(null);
  const [moveDialog, setMoveDialog] = useState<MoveDialogState | null>(null);
  const [createdShare, setCreatedShare] = useState<ExternalShare | null>(null);
  const [nameValue, setNameValue] = useState("");
  const [searchInput, setSearchInput] = useState(searchParams.get("q") ?? "");
  const searchScope =
    searchParams.get("scope") === "organization" ? "organization" : "current";
  const searchTerm = searchParams.get("q")?.trim() ?? "";
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const [uploadPanelPreference, setUploadPanelPreference] =
    useState<UploadPanelPreference>("auto");
  const [isUploading, setIsUploading] = useState(false);
  const [isBulkDuplicateProcessing, setIsBulkDuplicateProcessing] = useState(false);
  const [bulkDuplicateSummary, setBulkDuplicateSummary] = useState<{
    completed: number;
    failed: number;
  } | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [trashDuplicateResolution, setTrashDuplicateResolution] =
    useState<TrashDuplicateResolutionState>("choice");
  const [restorePreviewState, setRestorePreviewState] =
    useState<RestorePreviewResponse | null>(null);
  const [restorePreviewIds, setRestorePreviewIds] = useState<number[]>([]);
  const [restorePreviewLoading, setRestorePreviewLoading] = useState(false);
  const [restoreSubmitting, setRestoreSubmitting] = useState(false);
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
  const moveDestinationQuery = useQuery({
    queryKey: moveDialog?.destinationId
      ? driveKeys.detail(moveDialog.destinationId)
      : ["drive-items", "move-root"],
    queryFn: () =>
      moveDialog?.destinationId
        ? fetchDriveItem(moveDialog.destinationId)
        : Promise.resolve<DriveItem | null>(null),
    enabled: dialog === "move" && Boolean(moveDialog?.destinationId),
  });
  const moveDestinationItemsQuery = useQuery({
    queryKey: ["drive-items", "move-candidates", moveDialog?.destinationId ?? null],
    queryFn: () => fetchDriveItems(moveDialog?.destinationId ?? null),
    enabled: dialog === "move" && moveDialog !== null,
  });

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      if (searchInput.trim()) {
        next.set("q", searchInput.trim());
        next.set("scope", searchScope);
      } else {
        next.delete("q");
        if (searchScope === "organization") next.set("scope", searchScope);
        else next.delete("scope");
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
  const visibleError =
    lastError ??
    (visibleQuery.isError
      ? normalizeAppError(visibleQuery.error, {
          operation: searchTerm ? "検索" : "一覧取得",
          page: pageLabel,
        })
      : null);
  const uploadPanelState = useMemo<UploadPanelState>(() => {
    if (uploadPanelPreference === "dismissed") return "dismissed";
    if (uploadPanelPreference === "expanded") return "expanded";
    const visibleTasks = uploadTasks.filter((task) => task.status !== "retried");
    if (
      visibleTasks.length > 0 &&
      visibleTasks.every((task) => task.status === "done" || task.status === "restored")
    ) {
      return "completed";
    }
    return "expanded";
  }, [uploadPanelPreference, uploadTasks]);
  const unresolvedDuplicateContentTasks = useMemo(
    () =>
      uploadTasks.filter(
        (task) =>
          task.status === "conflict" &&
          task.error !== undefined &&
          isDuplicateContentError(task.error),
      ),
    [uploadTasks],
  );

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
      toast.show({
        tone: appError.level === "warn" ? "warn" : appError.level,
        message: appError.message,
      });
      if (appError.status === 401) void navigate("/login");
      if (appError.status === 404) void invalidateCurrent();
      return appError;
    },
    [invalidateCurrent, navigate, pageLabel, toast],
  );
  const openExternalShareDialog = useCallback((sharingItems: DriveItem[]) => {
    if (sharingItems.length === 0) return;
    setSelectedIds(sharingItems.map((item) => item.id));
    setCreatedShare(null);
    setDialog("externalShare");
  }, []);

  const openMoveDialog = useCallback((movingItems: DriveItem[]) => {
    if (movingItems.length === 0) return;
    setMoveDialog({
      items: movingItems,
      destinationId: movingItems[0]?.parent_id ?? null,
    });
    setDialog("move");
  }, []);

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
      captureError(error, "フォルダー作成", {
        itemType: "directory",
        itemName: nameValue,
      });
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
    onError: (error) =>
      captureError(error, selectedIds.length > 1 ? "一括削除" : "削除"),
  });
  const purgeMutation = useMutation({
    mutationFn: async () => {
      if (selectedIds.length > 1) await bulkPurge(selectedIds);
      else await purgeDriveItem(selectedIds[0]);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: driveKeys.trash() });
      await queryClient.invalidateQueries({ queryKey: driveKeys.all });
      setSelectedIds([]);
      setDialog(null);
      setLastError(null);
      toast.show({ tone: "success", message: "完全削除しました。" });
    },
    onError: (error) =>
      captureError(error, selectedIds.length > 1 ? "一括完全削除" : "完全削除"),
  });
  const executeRestorePreview = useCallback(
    async (preview: RestorePreviewResponse, ids: number[]) => {
      setRestoreSubmitting(true);
      try {
        if (ids.length > 1) await bulkRestore(ids, preview.confirmationToken);
        else await restoreDriveItem(ids[0], preview.confirmationToken);
        await queryClient.invalidateQueries({ queryKey: driveKeys.trash() });
        await queryClient.invalidateQueries({ queryKey: driveKeys.all });
        setSelectedIds([]);
        setDialog(null);
        setRestorePreviewState(null);
        setRestorePreviewIds([]);
        setLastError(null);
        toast.show({ tone: "success", message: "復元しました。" });
      } catch (error) {
        if (
          error instanceof ApiError &&
          (error.code === "restore_state_changed" ||
            error.code === "restore_preview_stale")
        ) {
          const latestPreview = normalizeRestorePreview(error.rawDetails);
          setRestorePreviewState(latestPreview);
          setDialog("restorePreview");
          toast.show({
            tone: "warn",
            message: "確認後に復元先の状態が変更されました。内容を再確認してください",
          });
          return;
        }
        captureError(error, ids.length > 1 ? "一括復元" : "復元");
      } finally {
        setRestoreSubmitting(false);
      }
    },
    [captureError, queryClient, toast],
  );

  const refreshRestorePreview = useCallback(
    async (ids: number[], items?: RestorePreviewRequestItem[]) => {
      const preview =
        ids.length > 1
          ? await bulkRestorePreview(ids, items)
          : await restorePreview(ids[0], items);
      setRestorePreviewState(preview);
      setRestorePreviewIds(ids);
      return preview;
    },
    [],
  );

  const openRestorePreview = useCallback(async () => {
    if (selectedIds.length === 0 || restorePreviewLoading) return;
    setRestorePreviewLoading(true);
    try {
      const ids = [...selectedIds];
      const preview = await refreshRestorePreview(ids);
      if (preview.summary.conflictCount === 0 && preview.summary.skippedCount === 0) {
        await executeRestorePreview(preview, ids);
        return;
      }
      setDialog("restorePreview");
      setLastError(null);
    } catch (error) {
      captureError(error, selectedIds.length > 1 ? "一括復元確認" : "復元確認");
    } finally {
      setRestorePreviewLoading(false);
    }
  }, [
    captureError,
    executeRestorePreview,
    refreshRestorePreview,
    restorePreviewLoading,
    selectedIds,
  ]);

  const changeRestoreResolution = useCallback(
    async (itemId: number, resolution: RestoreConflictResolution) => {
      if (!restorePreviewState || restorePreviewIds.length === 0) return;
      setRestorePreviewLoading(true);
      try {
        const items = restorePreviewPayload(restorePreviewState).map((item) =>
          item.itemId === itemId ? { ...item, resolution } : item,
        );
        await refreshRestorePreview(restorePreviewIds, items);
      } catch (error) {
        captureError(error, "復元内容確認");
      } finally {
        setRestorePreviewLoading(false);
      }
    },
    [captureError, refreshRestorePreview, restorePreviewIds, restorePreviewState],
  );

  const applyRestoreResolutionToAll = useCallback(
    async (resolution: RestoreConflictResolution) => {
      if (!restorePreviewState || restorePreviewIds.length === 0) return;
      setRestorePreviewLoading(true);
      try {
        const items = restorePreviewPayload(restorePreviewState).map((item) => ({
          ...item,
          resolution,
        }));
        await refreshRestorePreview(restorePreviewIds, items);
      } catch (error) {
        captureError(error, "復元内容確認");
      } finally {
        setRestorePreviewLoading(false);
      }
    },
    [captureError, refreshRestorePreview, restorePreviewIds, restorePreviewState],
  );
  const bulkDownloadMutation = useMutation({
    mutationFn: () => bulkDownload(selectedIds),
    onError: (error) => captureError(error, "一括ダウンロード"),
  });
  const externalShareMutation = useMutation({
    mutationFn: createExternalShare,
    onSuccess: (share) => {
      setCreatedShare(share);
      setLastError(null);
      toast.show({ tone: "success", message: "公開リンクを作成しました。" });
    },
    onError: (error) => captureError(error, "外部公開"),
  });
  const regenerateExternalSharePasswordMutation = useMutation({
    mutationFn: regenerateExternalSharePassword,
    onSuccess: (share) => {
      setCreatedShare((current) => (current ? { ...current, ...share } : share));
      setLastError(null);
      toast.show({ tone: "success", message: "パスワードを再発行しました。" });
    },
    onError: (error) => captureError(error, "パスワード再発行"),
  });
  const moveMutation = useMutation({
    mutationFn: async ({
      ids,
      parentId,
    }: {
      ids: number[];
      parentId: number | null;
      targetName: string;
      source: "drag" | "dialog";
    }) => bulkMove(ids, parentId),
    onSuccess: async () => {
      await invalidateCurrent();
      await queryClient.invalidateQueries({ queryKey: driveKeys.all });
      setSelectedIds([]);
      setDialog(null);
      setMoveDialog(null);
      setDraggingIds([]);
      setDragOverFolderId(null);
      setDragOverBreadcrumbId(null);
      setLastError(null);
      toast.show({ tone: "success", message: "移動しました。" });
    },
    onError: (error, variables) => {
      const operation =
        variables.source === "drag"
          ? variables.ids.length > 1
            ? "一括ドラッグ移動"
            : "ドラッグ移動"
          : variables.ids.length > 1
            ? "一括移動"
            : "移動";
      return captureError(error, operation, {
        targetFolder: variables.targetName,
      });
    },
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
      options: {
        allowDuplicateContent?: boolean;
        duplicateContentAction?: "upload_anyway";
        nameConflictAction?: "auto_rename";
        operationId?: string;
        allowTrashDuplicate?: boolean;
        replaceTrashedDriveItemId?: number;
        suppressActiveContentDialog?: boolean;
        taskId?: string;
        sourceTaskId?: string;
      } = {},
    ) => {
      const taskId = options.taskId ?? `${Date.now()}-${Math.random()}`;
      const abortController = new AbortController();
      const uploadName = nameOverride ?? file.name.replace(/\.[^.]+$/, "");
      setUploadPanelPreference("auto");
      setUploadTasks((current) => {
        if (options.taskId) {
          return current.map((task) =>
            task.id === options.taskId
              ? {
                  ...task,
                  file,
                  parentId,
                  uploadName,
                  loaded: 0,
                  total: file.size,
                  percent: 0,
                  status: "uploading",
                  message: undefined,
                  error: undefined,
                  abortController,
                }
              : task,
          );
        }
        return [
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
            sourceTaskId: options.sourceTaskId,
          },
        ];
      });

      try {
        await uploadFile({
          file,
          name: uploadName,
          parentId,
          allowDuplicateContent: options.allowDuplicateContent,
          duplicateContentAction: options.duplicateContentAction,
          nameConflictAction: options.nameConflictAction,
          operationId: options.operationId,
          allowTrashDuplicate: options.allowTrashDuplicate,
          replaceTrashedDriveItemId: options.replaceTrashedDriveItemId,
          signal: abortController.signal,
          onProgress: (progress) => updateUploadTask(taskId, progress),
        });
        updateUploadTask(taskId, { status: "processing", percent: 100 });
        updateUploadTask(taskId, { status: "done", message: "完了" });
        return "done";
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          updateUploadTask(taskId, {
            status: "canceled",
            message: "キャンセルしました",
          });
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
            kind: "name",
            taskId,
            file,
            parentId,
            suggestedName,
            message: appError.message,
            duplicateFiles: error instanceof ApiError ? error.duplicateFiles : [],
          });
          setNameValue(suggestedName);
          setLastError(null);
          updateUploadTask(taskId, {
            status: "conflict",
            message: appError.message,
            error: appError,
          });
          setDialog("conflict");
          return "conflict";
        }
        if (isActiveContentConflict(error)) {
          setConflict({
            kind: "active_content",
            taskId,
            file,
            parentId,
            uploadName,
            message: appError.message,
            duplicateFiles: error instanceof ApiError ? error.duplicateFiles : [],
          });
          setLastError(null);
          updateUploadTask(taskId, {
            status: "conflict",
            message: appError.message,
            error: appError,
          });
          if (!options.suppressActiveContentDialog) setDialog("conflict");
          return "conflict";
        }
        if (
          isTrashContentConflict(error) &&
          error instanceof ApiError &&
          error.trashDuplicate
        ) {
          setConflict({
            kind: "trash_content",
            taskId,
            file,
            parentId,
            uploadName,
            message: appError.message,
            duplicate: error.trashDuplicate,
          });
          setTrashDuplicateResolution("choice");
          setLastError(null);
          updateUploadTask(taskId, {
            status: "conflict",
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
          const result = await uploadSingleFile(file, folderId, undefined, {
            suppressActiveContentDialog: files.length > 1,
          });
          if (result === "done") succeeded += 1;
          if (result === "conflict") conflicted += 1;
        }

        if (succeeded > 0) await invalidateCurrent();

        toast.show({
          tone:
            succeeded === files.length
              ? "success"
              : succeeded > 0 || conflicted > 0
                ? "info"
                : "danger",
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

  const restoreTrashDuplicate = useCallback(
    async (currentConflict: TrashContentConflictState) => {
      setIsUploading(true);
      setTrashDuplicateResolution("restoring");
      updateUploadTask(currentConflict.taskId, { message: "復元しています..." });
      try {
        await restoreDriveItem(
          currentConflict.duplicate.restoreTarget?.id ?? currentConflict.duplicate.id,
        );
        updateUploadTask(currentConflict.taskId, {
          status: "restored",
          loaded: currentConflict.file.size,
          percent: 100,
          message: "ゴミ箱から復元済み",
          error: undefined,
          abortController: undefined,
        });
        setDialog(null);
        setConflict(null);
        setLastError(null);
        await queryClient.invalidateQueries({ queryKey: driveKeys.trash() });
        await queryClient.invalidateQueries({ queryKey: driveKeys.all });
        toast.show({
          tone: "success",
          message: `「${currentConflict.duplicate.displayName}」をゴミ箱から復元しました`,
        });
      } catch (error) {
        if (isInvalidParentError(error)) {
          const message = "復元先フォルダが見つかりません";
          setTrashDuplicateResolution("restore_parent_missing");
          setLastError(null);
          updateUploadTask(currentConflict.taskId, {
            status: "conflict",
            message,
            error: undefined,
          });
          toast.show({
            tone: "warn",
            message: "元の保存先に復元できません。操作を選択してください。",
          });
          return;
        }
        const appError = captureError(error, "ゴミ箱から復元", {
          itemName: currentConflict.duplicate.displayName,
        });
        updateUploadTask(currentConflict.taskId, {
          status: "conflict",
          message: appError.message,
          error: appError,
        });
        await queryClient.invalidateQueries({ queryKey: driveKeys.all });
      } finally {
        setIsUploading(false);
      }
    },
    [captureError, queryClient, toast, updateUploadTask],
  );

  const replaceTrashDuplicateWithUpload = useCallback(
    async (currentConflict: TrashContentConflictState) => {
      setTrashDuplicateResolution("purging_and_uploading");
      setDialog(null);
      setConflict(null);
      const result = await uploadSingleFile(
        currentConflict.file,
        currentConflict.parentId,
        currentConflict.uploadName,
        {
          replaceTrashedDriveItemId: currentConflict.duplicate.id,
          taskId: currentConflict.taskId,
        },
      );
      if (result === "done") {
        await invalidateCurrent();
        await queryClient.invalidateQueries({ queryKey: driveKeys.trash() });
        toast.show({
          tone: "success",
          message: `「${currentConflict.file.name}」をアップロードしました`,
        });
      }
    },
    [invalidateCurrent, queryClient, toast, uploadSingleFile],
  );

  const cancelUploadConflict = useCallback(
    (currentConflict: ConflictState) => {
      updateUploadTask(currentConflict.taskId, {
        status: "canceled",
        message: "キャンセルしました",
        abortController: undefined,
      });
      setDialog(null);
      setConflict(null);
      setTrashDuplicateResolution("choice");
      toast.show({
        tone: "info",
        message: `「${currentConflict.file.name}」のアップロードをキャンセルしました`,
      });
    },
    [toast, updateUploadTask],
  );

  const excludeDuplicateContentTasks = useCallback(
    (tasks: UploadTask[]) => {
      if (tasks.length === 0 || isBulkDuplicateProcessing) return;
      setUploadTasks((current) =>
        current.map((task) =>
          tasks.some((candidate) => candidate.id === task.id)
            ? {
                ...task,
                status: "canceled",
                message: "同じ内容のため除外しました",
                abortController: undefined,
              }
            : task,
        ),
      );
      if (conflict && tasks.some((task) => task.id === conflict.taskId)) {
        setDialog(null);
        setConflict(null);
      }
      setBulkDuplicateSummary(null);
      toast.show({
        tone: "info",
        message: `同じ内容の${tasks.length}件をアップロード対象から除外しました。`,
      });
    },
    [conflict, isBulkDuplicateProcessing, toast],
  );

  const uploadDuplicateContentTasks = useCallback(
    async (tasks: UploadTask[]) => {
      if (tasks.length === 0 || isBulkDuplicateProcessing) return;
      const operationId = createUploadOperationId("duplicate-content-bulk");
      uploadInProgressRef.current = true;
      setIsBulkDuplicateProcessing(true);
      setIsUploading(true);
      setDialog(null);
      setConflict(null);
      setBulkDuplicateSummary(null);
      setUploadTasks((current) =>
        current.map((task) =>
          tasks.some((candidate) => candidate.id === task.id)
            ? {
                ...task,
                status: "retried",
                message: "一括再試行済み",
                abortController: undefined,
              }
            : task,
        ),
      );

      let completed = 0;
      let failed = 0;
      try {
        for (const task of tasks) {
          const result = await uploadSingleFile(
            task.file,
            task.parentId,
            task.uploadName,
            {
              allowDuplicateContent: true,
              duplicateContentAction: "upload_anyway",
              nameConflictAction: "auto_rename",
              operationId,
              sourceTaskId: task.id,
            },
          );
          if (result === "done") completed += 1;
          else failed += 1;
        }
        if (completed > 0) await invalidateCurrent();
        setBulkDuplicateSummary({ completed, failed });
        toast.show({
          tone: failed > 0 ? "warn" : "success",
          message:
            failed > 0
              ? `一括アップロードが完了しました。完了: ${completed}件、失敗: ${failed}件。`
              : `${completed}件をアップロードしました。`,
        });
      } finally {
        setIsBulkDuplicateProcessing(false);
        setIsUploading(false);
        uploadInProgressRef.current = false;
      }
    },
    [invalidateCurrent, isBulkDuplicateProcessing, toast, uploadSingleFile],
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
        toast.show({
          tone: "danger",
          message: "安全でないパスを含むファイルは除外しました。",
        });
      }
      if (safeFiles.length === 0) return;
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
        for (const file of safeFiles) {
          const segments = relativePathSegments(file);
          const fileParentId = await ensureDirectoryPath(segments.slice(0, -1));
          const result = await uploadSingleFile(file, fileParentId, undefined, {
            suppressActiveContentDialog: true,
          });
          if (result === "done") succeeded += 1;
          if (result === "conflict") conflicted += 1;
        }
        if (succeeded > 0) await invalidateCurrent();
        toast.show({
          tone:
            succeeded === safeFiles.length
              ? "success"
              : succeeded > 0 || conflicted > 0
                ? "info"
                : "danger",
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

      if (
        files.some(
          (file) => (file as File & { webkitRelativePath?: string }).webkitRelativePath,
        )
      ) {
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
      moveMutation.mutate({
        ids: itemIds,
        parentId: targetParentId,
        targetName,
        source: "drag",
      });
    },
    [items, moveMutation, pageLabel],
  );

  const moveItems = useCallback(
    (movingItems: DriveItem[], targetParentId: number | null, targetName: string) => {
      if (movingItems.length === 0 || moveMutation.isPending) return;
      if (movingItems.every((item) => (item.parent_id ?? null) === targetParentId)) {
        const appError = normalizeAppError(new Error("同じ場所へは移動できません。"), {
          operation: movingItems.length > 1 ? "一括移動" : "移動",
          page: pageLabel,
          safeDetails: { targetFolder: targetName },
        });
        setLastError(appError);
        return;
      }
      moveMutation.mutate({
        ids: movingItems.map((item) => item.id),
        parentId: targetParentId,
        targetName,
        source: "dialog",
      });
    },
    [moveMutation, pageLabel],
  );

  const startItemDrag = useCallback(
    (event: React.DragEvent, item: DriveItem) => {
      if (mode === "trash") return;
      if (isNoDragTarget(event.target)) {
        event.preventDefault();
        return;
      }
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
        <p className="drag-status" role="status">
          {draggingIds.length > 0 ? <>{draggingIds.length}件を移動中</> : <>(^_-)-☆</>}
        </p>
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
              <>
                <Button
                  type="button"
                  variant="secondary"
                  loading={restorePreviewLoading || restoreSubmitting}
                  onClick={() => void openRestorePreview()}
                >
                  <RotateCcw size={16} aria-hidden="true" />
                  復元
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => setDialog("purge")}
                >
                  <Trash2 size={16} aria-hidden="true" />
                  完全削除
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => openMoveDialog(selectedItems)}
                >
                  <Move size={16} aria-hidden="true" />
                  移動
                </Button>
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
                  variant="secondary"
                  onClick={() => openExternalShareDialog(selectedItems)}
                >
                  <Share2 size={16} aria-hidden="true" />
                  外部公開
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
          state={uploadPanelState}
          duplicateContentTasks={unresolvedDuplicateContentTasks}
          duplicateContentSummary={bulkDuplicateSummary}
          bulkDuplicateProcessing={isBulkDuplicateProcessing}
          onBulkUploadDuplicateContent={() => setDialog("duplicateBulkUpload")}
          onExcludeDuplicateContent={() =>
            excludeDuplicateContentTasks(unresolvedDuplicateContentTasks)
          }
          onCancel={(task) => task.abortController?.abort()}
          onRetry={(task) =>
            void uploadSingleFile(task.file, task.parentId, task.uploadName)
          }
          onShowDetails={() => setUploadPanelPreference("expanded")}
          onDismiss={() => {
            setUploadTasks([]);
            setUploadPanelPreference("dismissed");
          }}
          onRemoveTask={(task) =>
            setUploadTasks((current) =>
              current.filter((candidate) => candidate.id !== task.id),
            )
          }
          onClearCompleted={() =>
            setUploadTasks((current) =>
              current.filter(
                (task) => task.status !== "done" && task.status !== "restored",
              ),
            )
          }
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
      {visibleQuery.isLoading ? (
        <LoadingIndicator label="一覧を読み込んでいます" />
      ) : null}
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
          title={
            searchTerm
              ? "検索結果はありません。"
              : mode === "trash"
                ? "ゴミ箱は空です。"
                : "このフォルダは空です。"
          }
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
          onMove={(item) => openMoveDialog([item])}
          onExternalShare={(item) => openExternalShareDialog([item])}
          onDownload={downloadDriveItem}
          onDragStart={startItemDrag}
          onDragEnd={endItemDrag}
          onDropToFolder={(event, item) => {
            const payload = dragMovePayload(event.dataTransfer);
            if (!payload) return;
            moveDraggedItems(payload.itemIds, item.id, item.name);
          }}
          onDragOverFolder={setDragOverFolderId}
          onOpenParent={(parentId) =>
            void navigate(parentId === null ? "/drive" : `/drive/folder/${parentId}`)
          }
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
        title={conflictTitle(conflict, trashDuplicateResolution)}
        onClose={() => {
          if (conflict && !isUploading) cancelUploadConflict(conflict);
        }}
      >
        {conflict?.kind === "name" ? (
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
                taskId: conflict.taskId,
              }).then(async (succeeded) => {
                if (succeeded === "done") await invalidateCurrent();
              });
            }}
          />
        ) : null}
        {conflict?.kind === "active_content" ? (
          <ActiveContentConflictDialog
            conflict={conflict}
            loading={isUploading}
            onOpenDuplicateLocation={(parentId) => {
              setDialog(null);
              setConflict(null);
              void navigate(parentId === null ? "/drive" : `/drive/folder/${parentId}`);
            }}
            onUploadAnyway={() => {
              setDialog(null);
              void uploadSingleFile(
                conflict.file,
                conflict.parentId,
                conflict.uploadName,
                {
                  taskId: conflict.taskId,
                  allowDuplicateContent: true,
                  duplicateContentAction: "upload_anyway",
                  nameConflictAction: "auto_rename",
                  operationId: createUploadOperationId("duplicate-content-single"),
                },
              ).then(async (succeeded) => {
                if (succeeded === "done") await invalidateCurrent();
              });
            }}
            onCancel={() => cancelUploadConflict(conflict)}
          />
        ) : null}
        {conflict?.kind === "trash_content" ? (
          <TrashContentConflictDialog
            conflict={conflict}
            resolutionState={trashDuplicateResolution}
            loading={isUploading}
            onRestore={() => void restoreTrashDuplicate(conflict)}
            onOpenTrash={() => {
              setDialog(null);
              setConflict(null);
              void navigate("/trash");
            }}
            onStartPurgeUpload={() => setTrashDuplicateResolution("purge_confirm")}
            onConfirmPurgeUpload={() => void replaceTrashDuplicateWithUpload(conflict)}
            onBack={() => setTrashDuplicateResolution("restore_parent_missing")}
            onCancel={() => cancelUploadConflict(conflict)}
          />
        ) : null}
      </Modal>
      <Modal
        open={dialog === "duplicateBulkUpload"}
        title="同じ内容でもすべてアップロード"
        onClose={() => {
          if (!isBulkDuplicateProcessing) setDialog(null);
        }}
      >
        <DuplicateContentBulkConfirm
          count={unresolvedDuplicateContentTasks.length}
          loading={isBulkDuplicateProcessing}
          onCancel={() => setDialog(null)}
          onConfirm={() =>
            void uploadDuplicateContentTasks(unresolvedDuplicateContentTasks)
          }
        />
      </Modal>
      <Modal
        open={dialog === "restorePreview"}
        title={
          restorePreviewIds.length > 1
            ? `復元内容の確認（${restorePreviewIds.length}件）`
            : "復元内容の確認"
        }
        onClose={() => {
          if (restoreSubmitting) return;
          setDialog(null);
          setRestorePreviewState(null);
          setRestorePreviewIds([]);
        }}
      >
        {restorePreviewState ? (
          <RestorePreviewDialog
            preview={restorePreviewState}
            loading={restorePreviewLoading || restoreSubmitting}
            onApplyAll={(resolution) => void applyRestoreResolutionToAll(resolution)}
            onChangeResolution={(itemId, resolution) =>
              void changeRestoreResolution(itemId, resolution)
            }
            onCancel={() => {
              setDialog(null);
              setRestorePreviewState(null);
              setRestorePreviewIds([]);
            }}
            onSubmit={() =>
              void executeRestorePreview(restorePreviewState, restorePreviewIds)
            }
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
      <ConfirmDialog
        open={dialog === "purge"}
        title="完全削除"
        message={
          selectedItems.length === 1
            ? `「${selectedItems[0].name}」を完全に削除します。この操作は取り消せません。`
            : "選択した項目を完全に削除します。この操作は取り消せません。"
        }
        confirmLabel="完全削除"
        danger
        loading={purgeMutation.isPending}
        onConfirm={() => purgeMutation.mutate()}
        onClose={() => setDialog(null)}
      />
      <Modal
        open={dialog === "externalShare"}
        title={
          createdShare?.share_url ? "公開リンクを作成しました" : "外部公開リンクを作成"
        }
        onClose={() => {
          setDialog(null);
          setCreatedShare(null);
        }}
      >
        <ExternalShareDialog
          items={selectedItems}
          createdShare={createdShare}
          loading={externalShareMutation.isPending}
          regeneratingPassword={regenerateExternalSharePasswordMutation.isPending}
          onRegeneratePassword={(id) => {
            if (
              window.confirm(
                "現在のパスワードは無効になります。新しいパスワードを再発行しますか？",
              )
            ) {
              regenerateExternalSharePasswordMutation.mutate(id);
            }
          }}
          onSubmit={(input) => externalShareMutation.mutate(input)}
        />
      </Modal>
      <Modal
        open={dialog === "preview"}
        title={activeItem?.name ?? "プレビュー"}
        onClose={() => setDialog(null)}
      >
        {dialog === "preview" && activeItem ? <Preview item={activeItem} /> : null}
      </Modal>
      <Modal
        open={dialog === "move"}
        title="移動先を選択"
        onClose={() => {
          setDialog(null);
          setMoveDialog(null);
        }}
      >
        {moveDialog ? (
          <MoveDestinationDialog
            movingItems={moveDialog.items}
            destinationId={moveDialog.destinationId}
            destination={moveDestinationQuery.data ?? null}
            candidates={(moveDestinationItemsQuery.data ?? []).filter(
              (item) => item.item_type === "directory" && !item.deleted_at,
            )}
            loading={
              moveDestinationItemsQuery.isLoading || moveDestinationQuery.isLoading
            }
            error={moveDestinationItemsQuery.error ?? moveDestinationQuery.error}
            moving={moveMutation.isPending}
            onRetry={() => {
              void moveDestinationItemsQuery.refetch();
              if (moveDialog.destinationId !== null)
                void moveDestinationQuery.refetch();
            }}
            onDestinationChange={(destinationId) =>
              setMoveDialog((current) => current && { ...current, destinationId })
            }
            onMove={(destinationId, destinationName) =>
              moveItems(moveDialog.items, destinationId, destinationName)
            }
          />
        ) : null}
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
  onMove,
  onExternalShare,
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
  onMove: (item: DriveItem) => void;
  onExternalShare: (item: DriveItem) => void;
  onDownload: (id: number) => void;
  onDragStart: (event: React.DragEvent, item: DriveItem) => void;
  onDragEnd: () => void;
  onDropToFolder: (event: React.DragEvent, item: DriveItem) => void;
  onDragOverFolder: (id: number | null) => void;
  onOpenParent: (parentId: number | null) => void;
  draggingIds: number[];
  dragOverFolderId: number | null;
}) {
  const listViewportRef = useRef<HTMLDivElement>(null);
  const [openMenu, setOpenMenu] = useState<{
    id: number;
    anchor: HTMLButtonElement;
  } | null>(null);
  const pointerStartRef = useRef<{
    id: number;
    x: number;
    y: number;
    dragged: boolean;
  } | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getItemKey: (index) => items[index]?.id ?? index,
    getScrollElement: () => listViewportRef.current,
    estimateSize: () => 64,
    overscan: 8,
    initialRect: { width: 0, height: FILE_LIST_INITIAL_VIEWPORT_HEIGHT },
    observeElementRect: (instance, callback) => {
      const element = instance.scrollElement;
      if (!element) return undefined;

      const measure = () => {
        const rect = element.getBoundingClientRect();
        // 初回レイアウトが未確定でも空描画を避け、実ブラウザではResizeObserverの値へ更新する。
        callback({
          width: rect.width || element.clientWidth,
          height:
            rect.height || element.clientHeight || FILE_LIST_INITIAL_VIEWPORT_HEIGHT,
        });
      };
      measure();

      if (typeof ResizeObserver === "undefined") return undefined;
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => observer.disconnect();
    },
  });
  const virtualRows = rowVirtualizer.getVirtualItems();

  useEffect(() => {
    if (openMenu === null) return;
    const close = () => setOpenMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [openMenu]);

  const handleCentralPointerDown = (event: React.PointerEvent, item: DriveItem) => {
    if (trash || isNoDragTarget(event.target)) return;
    pointerStartRef.current = {
      id: item.id,
      x: event.clientX,
      y: event.clientY,
      dragged: false,
    };
  };

  const handleCentralPointerUp = (event: React.PointerEvent, item: DriveItem) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start || start.id !== item.id || start.dragged) return;
    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (distance < DRIVE_OPEN_DISTANCE_THRESHOLD) onOpen(item);
  };

  const handleCentralKeyDown = (event: React.KeyboardEvent, item: DriveItem) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onOpen(item);
  };

  return (
    <div className="file-list">
      <div ref={listViewportRef} className="file-list-viewport">
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
          <tbody style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
            {virtualRows.map((virtualRow) => {
              const item = items[virtualRow.index];
              if (!item) return null;
              return (
                <tr
                  key={item.id}
                  ref={rowVirtualizer.measureElement}
                  data-index={virtualRow.index}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className={[
                    selectedIds.includes(item.id) ? "selected" : "",
                    item.item_type === "directory" ? "directory-row" : "",
                    draggingIds.includes(item.id) ? "dragging-row" : "",
                    dragOverFolderId === item.id ? "drop-target" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  tabIndex={0}
                  onDragOver={(event) => {
                    if (item.item_type !== "directory" || draggingIds.length === 0)
                      return;
                    if (draggingIds.includes(item.id)) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    onDragOverFolder(item.id);
                  }}
                  onDragLeave={() => onDragOverFolder(null)}
                  onDrop={(event) => {
                    if (item.item_type !== "directory" || draggingIds.length === 0)
                      return;
                    if (!dragMovePayload(event.dataTransfer)) return;
                    event.preventDefault();
                    onDropToFolder(event, item);
                  }}
                >
                  <td className="file-select-cell">
                    <input
                      data-no-drag
                      type="checkbox"
                      aria-label={`${item.name}を選択`}
                      checked={selectedIds.includes(item.id)}
                      onChange={() => onToggle(item.id)}
                    />
                  </td>
                  <td className="drive-item-drag-cell" colSpan={4}>
                    <div
                      className="drive-item-info-action"
                      role="button"
                      tabIndex={trash ? -1 : 0}
                      aria-label={`${displayName(item)}を開く`}
                      draggable={!trash}
                      onPointerDown={(event) => handleCentralPointerDown(event, item)}
                      onPointerUp={(event) => handleCentralPointerUp(event, item)}
                      onPointerCancel={() => {
                        pointerStartRef.current = null;
                      }}
                      onKeyDown={(event) => handleCentralKeyDown(event, item)}
                      onDragStart={(event) => {
                        if (pointerStartRef.current?.id === item.id) {
                          pointerStartRef.current.dragged = true;
                        }
                        onDragStart(event, item);
                      }}
                      onDragEnd={onDragEnd}
                    >
                      <div className="file-name-cell">
                        <span className="file-name-content">
                          <FileTypeIcon item={item} />
                          <span className="file-name">{displayName(item)}</span>
                        </span>
                        <span className="mobile-meta">
                          {item.owner_display_name ?? "不明"} ・{" "}
                          {formatDate(item.updated_at)} ・ {formatSize(item.file_size)}
                          {searchMode && item.parent_name
                            ? ` ・ ${item.parent_name}`
                            : ""}
                        </span>
                        {searchMode && item.parent_name ? (
                          <button
                            data-no-drag
                            type="button"
                            className="file-location"
                            onClick={() => onOpenParent(item.parent_id ?? null)}
                          >
                            場所: {item.parent_name}
                          </button>
                        ) : null}
                      </div>
                      <span className="drive-item-owner">
                        {item.owner_display_name ?? "不明"}
                      </span>
                      <span className="drive-item-updated">
                        {formatDate(item.updated_at)}
                      </span>
                      <span className="drive-item-size">
                        {formatSize(item.file_size)}
                      </span>
                    </div>
                  </td>
                  <td className="file-actions-cell">
                    <div className="row-actions">
                      {!trash ? (
                        <>
                          <IconButton
                            data-no-drag
                            label={`${item.name}をダウンロード`}
                            onClick={() => onDownload(item.id)}
                          >
                            <Download size={16} aria-hidden="true" />
                          </IconButton>
                          <IconButton
                            data-no-drag
                            label={`${item.name}の操作メニュー`}
                            aria-haspopup="menu"
                            aria-expanded={openMenu?.id === item.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              const anchor = event.currentTarget;
                              setOpenMenu((current) =>
                                current?.id === item.id
                                  ? null
                                  : { id: item.id, anchor },
                              );
                            }}
                          >
                            <MoreVertical size={16} aria-hidden="true" />
                          </IconButton>
                          {openMenu?.id === item.id ? (
                            <ItemActionMenu
                              anchor={openMenu.anchor}
                              item={item}
                              onClose={() => setOpenMenu(null)}
                              onMove={onMove}
                              onRename={onRename}
                              onExternalShare={onExternalShare}
                            />
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ItemActionMenu({
  anchor,
  item,
  onClose,
  onMove,
  onRename,
  onExternalShare,
}: {
  anchor: HTMLButtonElement;
  item: DriveItem;
  onClose: () => void;
  onMove: (item: DriveItem) => void;
  onRename: (item: DriveItem) => void;
  onExternalShare: (item: DriveItem) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    placement: "top" | "bottom";
    ready: boolean;
  }>({ top: 0, left: 0, placement: "bottom", ready: false });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const anchorRect = anchor.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const spaceBelow =
      viewportHeight - anchorRect.bottom - MENU_OFFSET - MENU_VIEWPORT_PADDING;
    const spaceAbove = anchorRect.top - MENU_OFFSET - MENU_VIEWPORT_PADDING;
    const opensUp = menuRect.height > spaceBelow && spaceAbove > spaceBelow;
    const top = opensUp
      ? Math.max(MENU_VIEWPORT_PADDING, anchorRect.top - menuRect.height - MENU_OFFSET)
      : Math.min(
          viewportHeight - menuRect.height - MENU_VIEWPORT_PADDING,
          anchorRect.bottom + MENU_OFFSET,
        );
    const left = Math.min(
      Math.max(MENU_VIEWPORT_PADDING, anchorRect.right - menuRect.width),
      viewportWidth - menuRect.width - MENU_VIEWPORT_PADDING,
    );

    setPosition({
      top,
      left,
      placement: opensUp ? "top" : "bottom",
      ready: true,
    });
  }, [anchor]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target) || anchor.contains(target)) return;
      onClose();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={menuRef}
      className="item-menu"
      role="menu"
      data-no-drag
      data-placement={position.placement}
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        visibility: position.ready ? "visible" : "hidden",
      }}
    >
      <button
        type="button"
        role="menuitem"
        data-no-drag
        onClick={() => {
          onClose();
          onMove(item);
        }}
      >
        <Move size={16} aria-hidden="true" />
        移動
      </button>
      <button
        type="button"
        role="menuitem"
        data-no-drag
        onClick={() => {
          onClose();
          onExternalShare(item);
        }}
      >
        <Share2 size={16} aria-hidden="true" />
        外部公開
      </button>
      <button
        type="button"
        role="menuitem"
        data-no-drag
        onClick={() => {
          onClose();
          onRename(item);
        }}
      >
        <MoreVertical size={16} aria-hidden="true" />
        名前を変更
      </button>
    </div>,
    document.body,
  );
}

function ExternalShareDialog({
  items,
  createdShare,
  loading,
  regeneratingPassword,
  onRegeneratePassword,
  onSubmit,
}: {
  items: DriveItem[];
  createdShare: ExternalShare | null;
  loading: boolean;
  regeneratingPassword: boolean;
  onRegeneratePassword: (id: number) => void;
  onSubmit: (input: {
    name: string;
    driveItemIds: number[];
    expiresAt: string | null;
    allowDownload: boolean;
    allowBulkDownload: boolean;
    passwordProtected: boolean;
    folderShareMode: "snapshot" | "dynamic";
  }) => void;
}) {
  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("7");
  const [allowDownload, setAllowDownload] = useState(true);
  const [allowBulkDownload, setAllowBulkDownload] = useState(true);
  const [passwordProtected, setPasswordProtected] = useState(false);
  const [followFolders, setFollowFolders] = useState(false);
  const hasFolder = items.some((item) => item.item_type === "directory");
  const effectiveName = name || defaultExternalShareName(items);

  if (createdShare?.share_url) {
    return (
      <div className="external-share-result">
        <input readOnly value={createdShare.share_url} aria-label="公開URL" />
        {createdShare.generated_password ? (
          <>
            <label className="field">
              <span>パスワード</span>
              <input
                readOnly
                value={createdShare.generated_password}
                aria-label="生成されたパスワード"
              />
            </label>
            <p className="external-share-once-note">
              このパスワードは再表示できません。安全な方法で共有してください。
            </p>
          </>
        ) : null}
        <div className="modal-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              void navigator.clipboard?.writeText(createdShare.share_url ?? "")
            }
          >
            <Copy size={16} aria-hidden="true" />
            URLをコピー
          </Button>
          {createdShare.generated_password ? (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  void navigator.clipboard?.writeText(
                    createdShare.generated_password ?? "",
                  )
                }
              >
                <Copy size={16} aria-hidden="true" />
                パスワードをコピー
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  void navigator.clipboard?.writeText(
                    `公開URL: ${createdShare.share_url}\nパスワード: ${createdShare.generated_password}`,
                  )
                }
              >
                <Copy size={16} aria-hidden="true" />
                まとめてコピー
              </Button>
            </>
          ) : null}
          <Button
            type="button"
            onClick={() =>
              window.open(createdShare.share_url, "_blank", "noopener,noreferrer")
            }
          >
            <ExternalLink size={16} aria-hidden="true" />
            リンクを開く
          </Button>
          {createdShare.password_required ? (
            <Button
              type="button"
              variant="secondary"
              loading={regeneratingPassword}
              onClick={() => onRegeneratePassword(createdShare.id)}
            >
              <RefreshCw size={16} aria-hidden="true" />
              パスワードを再発行
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <form
      className="form-stack external-share-form"
      onSubmit={(event) => {
        event.preventDefault();
        const expiresAt = expiresInDays
          ? new Date(
              Date.now() + Number(expiresInDays) * 24 * 60 * 60 * 1000,
            ).toISOString()
          : null;
        onSubmit({
          name: effectiveName.trim(),
          driveItemIds: items.map((item) => item.id),
          expiresAt,
          allowDownload,
          allowBulkDownload: allowDownload && allowBulkDownload,
          passwordProtected,
          folderShareMode: hasFolder && followFolders ? "dynamic" : "snapshot",
        });
      }}
    >
      <div className="external-share-targets">
        <span>公開対象</span>
        <ul>
          {items.slice(0, 6).map((item) => (
            <li key={item.id}>{displayName(item)}</li>
          ))}
        </ul>
        <strong>合計 {items.length}件</strong>
      </div>
      <label className="field">
        <span>公開名</span>
        <input
          value={effectiveName}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="field">
        <span>有効期限</span>
        <select
          value={expiresInDays}
          onChange={(event) => setExpiresInDays(event.target.value)}
        >
          <option value="1">1日間</option>
          <option value="7">7日間</option>
          <option value="30">30日間</option>
          <option value="">無期限</option>
        </select>
      </label>
      <fieldset className="check-stack">
        <legend>ダウンロード</legend>
        <label>
          <input
            type="checkbox"
            checked={allowDownload}
            onChange={(event) => setAllowDownload(event.target.checked)}
          />
          個別ダウンロードを許可
        </label>
        <label>
          <input
            type="checkbox"
            checked={allowBulkDownload}
            disabled={!allowDownload}
            onChange={(event) => setAllowBulkDownload(event.target.checked)}
          />
          一括ダウンロードを許可
        </label>
      </fieldset>
      <fieldset className="check-stack">
        <legend>パスワード保護</legend>
        <label>
          <input
            type="checkbox"
            checked={passwordProtected}
            onChange={(event) => setPasswordProtected(event.target.checked)}
          />
          パスワード保護を有効にする
        </label>
      </fieldset>
      {hasFolder ? (
        <fieldset className="check-stack">
          <legend>フォルダ内の今後の変更を共有に反映する</legend>
          <label>
            <input
              type="checkbox"
              checked={followFolders}
              onChange={(event) => setFollowFolders(event.target.checked)}
            />
            反映する
          </label>
          <p>
            {followFolders
              ? "今後追加されるファイルも公開対象になります。"
              : "共有作成時点のファイルだけを公開します。"}
          </p>
        </fieldset>
      ) : null}
      <div className="modal-actions">
        <Button
          type="submit"
          loading={loading}
          disabled={!effectiveName.trim() || items.length === 0}
        >
          公開リンクを作成
        </Button>
      </div>
    </form>
  );
}

function defaultExternalShareName(items: DriveItem[]) {
  if (items.length === 1) return displayName(items[0]);
  return `${new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long" })} 共有データ`;
}

function MoveDestinationDialog({
  movingItems,
  destinationId,
  destination,
  candidates,
  loading,
  error,
  moving,
  onRetry,
  onDestinationChange,
  onMove,
}: {
  movingItems: DriveItem[];
  destinationId: number | null;
  destination: DriveItem | null;
  candidates: DriveItem[];
  loading: boolean;
  error: unknown;
  moving: boolean;
  onRetry: () => void;
  onDestinationChange: (id: number | null) => void;
  onMove: (id: number | null, name: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const breadcrumbs = destination?.breadcrumbs ?? [{ id: null, name: "共有ドライブ" }];
  const disabledReason = moveDestinationDisabledReason(
    movingItems,
    destinationId,
    breadcrumbs,
  );
  const filteredCandidates = candidates.filter((candidate) =>
    candidate.name.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()),
  );
  const parentCrumb = breadcrumbs.at(-2);
  const destinationName = destination?.name ?? "共有ドライブ";

  return (
    <div className="move-dialog" data-no-drag>
      <p className="move-dialog-summary">{movingItems.length}件の項目を移動</p>
      <nav className="move-breadcrumbs" aria-label="移動先">
        {breadcrumbs.map((crumb, index) => {
          const current = index === breadcrumbs.length - 1;
          return (
            <span key={crumb.id ?? "root"}>
              {index > 0 ? <span aria-hidden="true">/</span> : null}
              <button
                type="button"
                data-no-drag
                disabled={current}
                aria-current={current ? "page" : undefined}
                onClick={() => onDestinationChange(crumb.id)}
              >
                {crumb.name}
              </button>
            </span>
          );
        })}
      </nav>
      <div className="move-dialog-controls">
        <Button
          type="button"
          variant="secondary"
          disabled={destinationId === null}
          onClick={() => onDestinationChange(parentCrumb?.id ?? null)}
        >
          <ChevronUp size={16} aria-hidden="true" />
          一つ上へ
        </Button>
        <Button type="button" variant="ghost" onClick={() => onDestinationChange(null)}>
          共有ドライブへ
        </Button>
      </div>
      <label className="field">
        <span>ディレクトリ名検索</span>
        <input
          data-no-drag
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="移動先フォルダを絞り込み"
        />
      </label>
      {error ? (
        <ErrorState message={errorMessage(error)} onRetry={onRetry} />
      ) : (
        <ul className="move-candidate-list" aria-busy={loading}>
          {loading ? <LoadingIndicator label="移動先を読み込んでいます" /> : null}
          {!loading && filteredCandidates.length === 0 ? (
            <p className="move-empty">直下に移動先候補のフォルダはありません。</p>
          ) : null}
          {filteredCandidates.map((candidate) => {
            const reason = moveDestinationDisabledReason(movingItems, candidate.id, [
              ...breadcrumbs,
              { id: candidate.id, name: candidate.name },
            ]);
            return (
              <li key={candidate.id}>
                <button
                  type="button"
                  className="move-candidate"
                  data-no-drag
                  disabled={Boolean(reason)}
                  title={reason ?? `${candidate.name}を開く`}
                  onClick={() => onDestinationChange(candidate.id)}
                >
                  <FileTypeIcon item={candidate} />
                  <span>{candidate.name}</span>
                  {reason ? <small>{reason}</small> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {disabledReason ? (
        <p className="form-message form-message-warn">{disabledReason}</p>
      ) : null}
      <div className="modal-actions">
        <Button
          type="button"
          loading={moving}
          disabled={Boolean(disabledReason)}
          onClick={() => onMove(destinationId, destinationName)}
        >
          ここに移動
        </Button>
      </div>
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
      {message ? (
        <p className={`form-message form-message-${messageTone}`}>{message}</p>
      ) : null}
      {duplicateFiles.length > 0 ? (
        <div className="duplicate-files" aria-label="同じ内容の既存ファイル">
          <ul>
            {duplicateFiles.map((file) => (
              <li key={file.id}>
                <div>
                  <strong>{file.name}</strong>
                  <span>
                    保存先:{" "}
                    {file.deleted ? "ごみ箱" : (file.parent_name ?? "共有ドライブ")}
                  </span>
                  {file.owner_display_name ? (
                    <span>アップロード者: {file.owner_display_name}</span>
                  ) : null}
                  {file.created_at ? (
                    <span>作成日時: {formatDate(file.created_at)}</span>
                  ) : null}
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

function RestorePreviewDialog({
  preview,
  loading,
  onApplyAll,
  onChangeResolution,
  onCancel,
  onSubmit,
}: {
  preview: RestorePreviewResponse;
  loading: boolean;
  onApplyAll: (resolution: RestoreConflictResolution) => void;
  onChangeResolution: (itemId: number, resolution: RestoreConflictResolution) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const conflictItems = preview.items.filter(
    (item) => item.conflictType !== "none" || item.after.resolution === "skip",
  );
  const hasNameConflict = conflictItems.some((item) =>
    item.conflictType.includes("name_conflict"),
  );
  const hasSkippable = conflictItems.length > 0;

  return (
    <div className="restore-preview form-stack">
      <div className="restore-preview-summary" aria-label="復元内容サマリー">
        <span>競合 {preview.summary.conflictCount} 件</span>
        <span>復元可能 {preview.summary.restorableCount} 件</span>
        <span>スキップ {preview.summary.skippedCount} 件</span>
        <span>名前変更 {preview.summary.renameCount} 件</span>
        <span>
          ゴミ箱へ移動{" "}
          {preview.summary.trashExistingCount ?? preview.summary.purgeExistingCount} 件
        </span>
      </div>
      {conflictItems.length > 1 ? (
        <div className="restore-preview-bulk-actions">
          {hasNameConflict ? (
            <Button
              type="button"
              variant="secondary"
              disabled={loading}
              onClick={() => onApplyAll("rename")}
            >
              すべて自動リネーム
            </Button>
          ) : null}
          {hasNameConflict ? (
            <Button
              type="button"
              variant="secondary"
              disabled={loading}
              onClick={() => onApplyAll("trash_existing")}
            >
              すべて現在の同名項目をゴミ箱へ移して復元
            </Button>
          ) : null}
          {hasSkippable ? (
            <Button
              type="button"
              variant="ghost"
              disabled={loading}
              onClick={() => onApplyAll("skip")}
            >
              すべてスキップ
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="restore-preview-list">
        {conflictItems.map((item) => (
          <article
            key={item.itemId}
            className={`restore-preview-card ${item.after.resolution === "skip" ? "is-skipped" : ""}`.trim()}
          >
            <header>
              <div>
                <strong>{item.before.name}</strong>
                <span>{item.itemType === "directory" ? "フォルダー" : "ファイル"}</span>
              </div>
              <span className={`status-pill status-${item.conflictType}`}>
                {restoreConflictLabel(item)}
              </span>
            </header>
            {item.itemType === "directory" ? (
              <p className="form-message form-message-info">
                配下 {item.childrenCount}{" "}
                件を含めて確認します。競合する配下項目は一覧に表示されます。
              </p>
            ) : null}
            <div className="restore-preview-compare">
              <section>
                <h3>処理前</h3>
                <dl>
                  <div>
                    <dt>元の名前</dt>
                    <dd>{item.before.name}</dd>
                  </div>
                  <div>
                    <dt>元の親フォルダ</dt>
                    <dd>{item.before.parentPath ?? "不明"}</dd>
                  </div>
                  <div>
                    <dt>現在の状態</dt>
                    <dd>
                      {item.before.state === "trashed" ? "ゴミ箱" : item.before.state}
                    </dd>
                  </div>
                  <div>
                    <dt>競合理由</dt>
                    <dd>{item.before.reason ?? "競合なし"}</dd>
                  </div>
                  <div>
                    <dt>復元可能</dt>
                    <dd>{item.before.restorable ? "可能" : "確認が必要"}</dd>
                  </div>
                </dl>
              </section>
              <section>
                <h3>処理後</h3>
                <dl>
                  <div>
                    <dt>最終的な名前</dt>
                    <dd
                      className={
                        item.before.name !== item.after.name ? "changed-value" : ""
                      }
                    >
                      {item.after.name ?? "復元しない"}
                    </dd>
                  </div>
                  <div>
                    <dt>実際の復元先</dt>
                    <dd
                      className={
                        item.before.parentPath !== item.after.parentPath
                          ? "changed-value"
                          : ""
                      }
                    >
                      {item.after.parentPath ?? "未選択"}
                    </dd>
                  </div>
                  <div>
                    <dt>解決方法</dt>
                    <dd>{restoreResolutionLabel(item.after.resolution)}</dd>
                  </div>
                  <div>
                    <dt>復元後の状態</dt>
                    <dd>{item.after.restorable ? "通常領域" : "スキップ"}</dd>
                  </div>
                  <div>
                    <dt>既存項目への影響</dt>
                    <dd
                      className={
                        (item.after.existingItemWillBeTrashed ??
                        item.after.existingItemWillBePurged)
                          ? "danger-value"
                          : ""
                      }
                    >
                      {item.after.impact}
                    </dd>
                  </div>
                </dl>
              </section>
            </div>
            {(item.after.existingItemWillBeTrashed ??
              item.after.existingItemWillBePurged) &&
            item.after.existingItem ? (
              <p className="form-message form-message-warn">
                「{item.after.existingItem.name}」をゴミ箱へ移動します。
                {item.after.existingItem.purgeNote}
              </p>
            ) : null}
            {item.conflictType.includes("missing_parent") ? (
              <p className="form-message form-message-warn">
                元の復元先が存在しません。ルートに復元するか、別のフォルダを選択してください。
              </p>
            ) : null}
            <label className="field">
              <span>解決方法</span>
              <select
                value={item.after.resolution}
                disabled={loading}
                onChange={(event) =>
                  onChangeResolution(
                    item.itemId,
                    event.target.value as RestoreConflictResolution,
                  )
                }
              >
                {item.conflictType.includes("name_conflict") ? (
                  <option value="rename">別名で復元</option>
                ) : null}
                {item.conflictType.includes("name_conflict") ? (
                  <option value="trash_existing">
                    現在の同名項目をゴミ箱へ移して復元
                  </option>
                ) : null}
                {item.conflictType.includes("missing_parent") ? (
                  <option value="restore_to_root">共有ドライブのルートに復元</option>
                ) : null}
                <option value="select_destination">別のフォルダを選択</option>
                <option value="skip">この項目をスキップ</option>
              </select>
            </label>
          </article>
        ))}
      </div>
      <div className="modal-actions">
        <Button type="button" variant="ghost" disabled={loading} onClick={onCancel}>
          キャンセル
        </Button>
        <Button
          type="button"
          loading={loading}
          disabled={
            preview.items.every((item) => item.after.resolution === "skip") ||
            preview.items.some((item) => !item.after.restorable)
          }
          onClick={onSubmit}
        >
          復元実行
        </Button>
      </div>
    </div>
  );
}

function ActiveContentConflictDialog({
  conflict,
  loading,
  onOpenDuplicateLocation,
  onUploadAnyway,
  onCancel,
}: {
  conflict: ActiveContentConflictState;
  loading: boolean;
  onOpenDuplicateLocation: (parentId: number | null) => void;
  onUploadAnyway: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="form-stack">
      <p className="form-message form-message-info">{conflict.message}</p>
      {conflict.duplicateFiles.length > 0 ? (
        <div className="duplicate-files" aria-label="同じ内容の既存ファイル">
          <ul>
            {conflict.duplicateFiles.map((file) => (
              <li key={file.id}>
                <div>
                  <strong>{file.name}</strong>
                  <span>保存先: {file.parent_name ?? "共有ドライブ"}</span>
                  <span>アップロード者: {file.owner_display_name ?? "不明"}</span>
                  {file.created_at ? (
                    <span>作成日時: {formatDate(file.created_at)}</span>
                  ) : null}
                  <span>サイズ: {formatSize(file.file_size)}</span>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={loading}
                  onClick={() => onOpenDuplicateLocation(file.parent_id)}
                >
                  既存ファイルを開く
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="modal-actions">
        <Button type="button" disabled={loading} onClick={onUploadAnyway}>
          同じ内容でもアップロード
        </Button>
        <Button type="button" variant="ghost" disabled={loading} onClick={onCancel}>
          キャンセル
        </Button>
      </div>
    </div>
  );
}

function TrashContentConflictDialog({
  conflict,
  resolutionState,
  loading,
  onRestore,
  onOpenTrash,
  onStartPurgeUpload,
  onConfirmPurgeUpload,
  onBack,
  onCancel,
}: {
  conflict: TrashContentConflictState;
  resolutionState: TrashDuplicateResolutionState;
  loading: boolean;
  onRestore: () => void;
  onOpenTrash: () => void;
  onStartPurgeUpload: () => void;
  onConfirmPurgeUpload: () => void;
  onBack: () => void;
  onCancel: () => void;
}) {
  const duplicate = conflict.duplicate;
  if (resolutionState === "purge_confirm") {
    return (
      <div className="form-stack">
        <p>
          ゴミ箱内の「{duplicate.displayName}
          」を完全削除し、新しいファイルをアップロードします。完全削除したファイルは復元できません。
        </p>
        <div className="modal-actions">
          <Button
            type="button"
            variant="danger"
            loading={loading}
            onClick={onConfirmPurgeUpload}
          >
            {loading
              ? "完全削除してアップロードしています..."
              : "完全削除してアップロード"}
          </Button>
          <Button type="button" variant="ghost" disabled={loading} onClick={onBack}>
            戻る
          </Button>
        </div>
      </div>
    );
  }

  const parentLabel =
    resolutionState === "restore_parent_missing"
      ? "削除済み、または存在しません"
      : (duplicate.originalParent?.path ?? "元の保存先不明");

  return (
    <div className="form-stack trash-duplicate-dialog">
      {resolutionState === "restore_parent_missing" ? (
        <>
          <p className="trash-duplicate-warning">
            ゴミ箱内の同一ファイルは、削除前の保存先フォルダが存在しないため復元できません。ゴミ箱で確認するか、ゴミ箱内の元ファイルを完全削除してから新規アップロードできます。
          </p>
          <p className="form-message form-message-warn">
            この操作を行うと、ゴミ箱内の元ファイルは復元できなくなります。
          </p>
        </>
      ) : (
        <>
          <p>
            アップロードしようとしているファイルと同じ内容のファイルが、組織内のゴミ箱にあります。ゴミ箱内のファイルを復元するか、ゴミ箱で確認できます。
          </p>
          <p className="form-message form-message-info">
            復元したファイルは、削除前の保存先に戻ります。
          </p>
        </>
      )}
      <dl className="duplicate-details" aria-label="ゴミ箱内の既存ファイル">
        <div>
          <dt>ファイル名</dt>
          <dd>{duplicate.displayName}</dd>
        </div>
        <div>
          <dt>元の保存先</dt>
          <dd>{parentLabel}</dd>
        </div>
        <div>
          <dt>アップロード者</dt>
          <dd>{duplicate.uploadedBy?.displayName ?? "不明"}</dd>
        </div>
        <div>
          <dt>削除日時</dt>
          <dd>{formatDate(duplicate.deletedAt ?? undefined)}</dd>
        </div>
        <div>
          <dt>サイズ</dt>
          <dd>{formatSize(duplicate.fileSize)}</dd>
        </div>
      </dl>
      <div className="modal-actions trash-duplicate-actions">
        {resolutionState === "restore_parent_missing" ? null : (
          <Button
            type="button"
            className="trash-duplicate-primary"
            loading={loading}
            onClick={onRestore}
          >
            {loading ? "復元しています..." : restoreButtonLabel(duplicate)}
          </Button>
        )}
        <Button
          type="button"
          className="trash-duplicate-secondary"
          variant="secondary"
          disabled={loading}
          onClick={onOpenTrash}
        >
          <span aria-label="ゴミ箱で確認">
            ゴミ箱で
            <br />
            確認
          </span>
        </Button>
        {resolutionState === "restore_parent_missing" ? (
          <Button
            type="button"
            className="trash-duplicate-primary"
            variant="danger"
            disabled={loading}
            onClick={onStartPurgeUpload}
          >
            元のファイルを完全削除して、新規にアップロードする
          </Button>
        ) : null}
        <Button
          type="button"
          className="trash-duplicate-cancel"
          variant="ghost"
          disabled={loading}
          onClick={onCancel}
        >
          キャンセル
        </Button>
      </div>
    </div>
  );
}

function DuplicateContentBulkConfirm({
  count,
  loading,
  onCancel,
  onConfirm,
}: {
  count: number;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="form-stack">
      <p>
        同じ内容のファイルがすでに存在する{count}
        件を、新しいファイルとしてアップロードします。
        <br />
        ファイル名も重複する場合は自動的に名前を変更します。
      </p>
      <p className="form-message form-message-info">
        既存ファイルは上書きまたは削除されません。
      </p>
      <div className="modal-actions">
        <Button type="button" variant="ghost" disabled={loading} onClick={onCancel}>
          キャンセル
        </Button>
        <Button
          type="button"
          loading={loading}
          disabled={count === 0}
          onClick={onConfirm}
        >
          {count}件をアップロード
        </Button>
      </div>
    </div>
  );
}

function UploadProgressPanel({
  tasks,
  state,
  duplicateContentTasks,
  duplicateContentSummary,
  bulkDuplicateProcessing,
  onBulkUploadDuplicateContent,
  onExcludeDuplicateContent,
  onCancel,
  onRetry,
  onShowDetails,
  onDismiss,
  onRemoveTask,
  onClearCompleted,
}: {
  tasks: UploadTask[];
  state: UploadPanelState;
  duplicateContentTasks: UploadTask[];
  duplicateContentSummary: { completed: number; failed: number } | null;
  bulkDuplicateProcessing: boolean;
  onBulkUploadDuplicateContent: () => void;
  onExcludeDuplicateContent: () => void;
  onCancel: (task: UploadTask) => void;
  onRetry: (task: UploadTask) => void;
  onShowDetails: () => void;
  onDismiss: () => void;
  onRemoveTask: (task: UploadTask) => void;
  onClearCompleted: () => void;
}) {
  const visibleTasks = tasks.filter((task) => task.status !== "retried");
  const total = visibleTasks.reduce((sum, task) => sum + (task.total ?? 0), 0);
  const loaded = visibleTasks.reduce((sum, task) => sum + task.loaded, 0);
  const percent = total ? Math.round((loaded / total) * 100) : undefined;
  const completedCount = visibleTasks.filter(
    (task) => task.status === "done" || task.status === "restored",
  ).length;
  const hasCompleted = completedCount > 0;
  const duplicateContentCount = duplicateContentTasks.length;
  if (state === "dismissed") return null;
  if (state === "completed") {
    return (
      <section
        className="upload-progress upload-progress-compact"
        aria-label="アップロード進捗"
      >
        <div>
          <h2>{completedCount}件のアップロードが完了しました</h2>
          <span>すべてのファイルをアップロードしました。</span>
        </div>
        <div className="upload-progress-actions">
          <Button type="button" variant="secondary" onClick={onShowDetails}>
            詳細を表示
          </Button>
          <Button type="button" variant="ghost" onClick={onDismiss}>
            閉じる
          </Button>
        </div>
      </section>
    );
  }
  return (
    <section className="upload-progress" aria-label="アップロード進捗">
      <div className="upload-progress-header">
        <div>
          <h2>アップロード状況</h2>
          <span>
            {completedCount} / {visibleTasks.length} 件完了
          </span>
        </div>
        {hasCompleted ? (
          <Button type="button" variant="ghost" onClick={onClearCompleted}>
            完了済みを非表示
          </Button>
        ) : null}
      </div>
      {duplicateContentCount > 0 || duplicateContentSummary ? (
        <div className="upload-bulk-actions" aria-label="同じ内容の一括操作">
          {duplicateContentSummary ? (
            <p>
              一括処理結果: 完了: {duplicateContentSummary.completed}件 / 失敗:{" "}
              {duplicateContentSummary.failed}件
            </p>
          ) : null}
          {duplicateContentCount > 0 ? (
            <div>
              <Button
                type="button"
                disabled={bulkDuplicateProcessing}
                loading={bulkDuplicateProcessing}
                onClick={onBulkUploadDuplicateContent}
              >
                同じ内容でもすべてアップロード（{duplicateContentCount}件）
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={bulkDuplicateProcessing}
                onClick={onExcludeDuplicateContent}
              >
                同じ内容の項目をすべて除外（{duplicateContentCount}件）
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      <ProgressBar percent={percent} />
      <ul>
        {visibleTasks.map((task) => (
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
            {task.status === "failed" || task.status === "canceled" ? (
              <Button type="button" variant="secondary" onClick={() => onRetry(task)}>
                再試行
              </Button>
            ) : null}
            {task.status === "done" || task.status === "restored" ? (
              <Button type="button" variant="ghost" onClick={() => onRemoveTask(task)}>
                削除
              </Button>
            ) : null}
            <ProgressBar percent={task.percent} />
            {task.error ? (
              <ErrorReportPanel error={task.error} onRetry={() => onRetry(task)} />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProgressBar({ percent }: { percent?: number }) {
  return (
    <div
      className="progress-bar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      role="progressbar"
    >
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatSize(value?: number | null) {
  if (value === undefined || value === null) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function uploadStatusText(task: UploadTask) {
  if (task.status === "processing")
    return "アップロード完了。サーバーで処理しています。";
  if (task.status === "done") return "完了";
  if (task.status === "restored") return "ゴミ箱から復元済み";
  if (task.status === "conflict") return task.message ?? "確認が必要です";
  if (task.status === "failed") return task.message ?? "失敗";
  if (task.status === "canceled") return task.message ?? "キャンセルしました";
  return "アップロード中";
}

function restorePreviewPayload(
  preview: RestorePreviewResponse,
): RestorePreviewRequestItem[] {
  return preview.items.map((item) => ({
    itemId: item.itemId,
    resolution: item.after.resolution,
    destinationParentId: item.after.parentId,
    expectedName: item.after.name,
    expectedExistingItemId: item.existingItemId,
  }));
}

function restoreConflictLabel(item: RestorePreviewItem) {
  if (item.conflictType === "name_conflict_and_missing_parent")
    return "同名競合 / 親フォルダなし";
  if (item.conflictType === "active_content_duplicate_and_missing_parent")
    return "同一内容 / 親フォルダなし";
  if (item.conflictType === "name_conflict") return "同名競合";
  if (item.conflictType === "active_content_duplicate") return "同一内容";
  if (item.conflictType === "missing_parent") return "親フォルダなし";
  return "競合なし";
}

function restoreResolutionLabel(resolution: RestoreConflictResolution) {
  if (resolution === "trash_existing") return "現在の同名項目をゴミ箱へ移して復元";
  if (resolution === "restore") return "そのまま復元";
  if (resolution === "select_destination") return "別のフォルダを選択";
  if (resolution === "restore_to_root") return "共有ドライブのルートに復元";
  if (resolution === "skip") return "この項目をスキップ";
  return "自動リネームして復元";
}

function conflictTitle(
  conflict: ConflictState | null,
  trashResolutionState: TrashDuplicateResolutionState,
) {
  if (conflict?.kind === "trash_content") {
    if (trashResolutionState === "restore_parent_missing")
      return "元の保存先に復元できません";
    if (trashResolutionState === "purge_confirm")
      return "元のファイルを完全削除しますか？";
    return "同じ内容のファイルがゴミ箱にあります";
  }
  if (conflict?.kind === "active_content") return "同じ内容のファイルがあります";
  return "名前の重複";
}

function restoreButtonLabel(duplicate: TrashDuplicate) {
  if (duplicate.restoreTarget?.type === "directory") return "フォルダごと復元する";
  return "復元する";
}

function isNameConflict(error: unknown) {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    (error.code === "duplicate_name" || error.code === "name_conflict")
  );
}

function isActiveContentConflict(error: unknown) {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    (error.code === "active_content_duplicate" || error.code === "duplicate_content")
  );
}

function isDuplicateContentError(error: AppError) {
  return (
    error.code === "duplicate_content" || error.code === "active_content_duplicate"
  );
}

function isTrashContentConflict(error: unknown) {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    error.code === "trash_content_duplicate"
  );
}

function isInvalidParentError(error: unknown) {
  return error instanceof ApiError && error.code === "invalid_parent";
}

function suggestedUploadName(
  error: unknown,
  file: File,
  items: DriveItem[],
  parentId: number | null,
) {
  if (
    error instanceof ApiError &&
    typeof error.safeDetails?.suggested_name === "string"
  ) {
    return error.safeDetails.suggested_name;
  }
  const existingFilenames = items
    .filter(
      (item) => (item.parent_id ?? null) === parentId && item.item_type === "file",
    )
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

function createUploadOperationId(prefix: string) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

function relativePathSegments(file: File) {
  const relativePath = (file as File & { webkitRelativePath?: string })
    .webkitRelativePath;
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

function isNoDragTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  const interactive = target.closest(
    "button, a, input, select, textarea, [role='button'], [data-no-drag]",
  );
  const centralAction = target.closest(".drive-item-info-action");
  if (centralAction) return Boolean(interactive && interactive !== centralAction);
  return Boolean(interactive);
}

function moveDestinationDisabledReason(
  movingItems: DriveItem[],
  destinationId: number | null,
  destinationBreadcrumbs: Breadcrumb[],
) {
  if (movingItems.some((item) => item.id === destinationId)) {
    return "移動対象自身へは移動できません。";
  }
  if (movingItems.every((item) => (item.parent_id ?? null) === destinationId)) {
    return "現在と同じ場所です。";
  }

  const movingDirectoryIds = new Set(
    movingItems.filter((item) => item.item_type === "directory").map((item) => item.id),
  );
  if (
    destinationId !== null &&
    destinationBreadcrumbs.some(
      (crumb) => crumb.id !== null && movingDirectoryIds.has(crumb.id),
    )
  ) {
    return "フォルダーを自身の配下へは移動できません。";
  }

  return null;
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

async function filesFromEntry(
  entry: BrowserFileSystemEntry,
  parentPath: string,
): Promise<File[]> {
  const path = parentPath ? `${parentPath}/${entry.name}` : entry.name;
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      (entry as BrowserFileSystemFileEntry).file(resolve, reject);
    });
    Object.defineProperty(file, "webkitRelativePath", {
      value: path,
      configurable: true,
    });
    return [file];
  }

  const directory = entry as BrowserFileSystemDirectoryEntry;
  const children = await readAllDirectoryEntries(directory);
  const nestedFiles = await Promise.all(
    children.map((child) => filesFromEntry(child, path)),
  );
  return nestedFiles.flat();
}

async function readAllDirectoryEntries(directory: BrowserFileSystemDirectoryEntry) {
  const reader = directory.createReader();
  const entries: BrowserFileSystemEntry[] = [];

  while (true) {
    // Chromium系ではreadEntries()が一度に最大100件程度しか返さないため、空になるまで読む。
    const chunk = await new Promise<BrowserFileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (chunk.length === 0) break;
    entries.push(...chunk);
  }

  return entries;
}
