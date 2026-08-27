import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Download, Eye, Folder, Lock, Package } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { ApiError, ApiNetworkError } from "../api/errors";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { FileTypeIcon } from "../components/FileTypeIcon";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { Modal } from "../components/Modal";
import { useToast } from "../components/ToastProvider";
import {
  bulkDownloadPublicShare,
  fetchPublicShareItems,
  fetchPublicShare,
  publicDownloadUrl,
  publicPreviewUrl,
  unlockPublicShare,
  type PublicShareItem,
} from "./api";

export function PublicSharePage() {
  const token = useParams().token ?? "";
  const queryClient = useQueryClient();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordErrorTone, setPasswordErrorTone] = useState<"warn" | "danger">("warn");
  const [previewItem, setPreviewItem] = useState<PublicShareItem | null>(null);
  const [folderPath, setFolderPath] = useState<PublicShareItem[]>([]);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const currentFolderId = folderPath.at(-1)?.id ?? null;
  const query = useQuery({
    queryKey: ["public-share", token],
    queryFn: () => fetchPublicShare(token),
    retry: false,
  });
  const unlockMutation = useMutation({
    mutationFn: async () => {
      await unlockPublicShare(token, password);
      return fetchPublicShare(token);
    },
    onSuccess: (unlockedShare) => {
      setPassword("");
      setPasswordError(null);
      queryClient.setQueryData(["public-share", token], unlockedShare);
    },
    onError: (error) => {
      setPasswordErrorTone(isSystemUnlockError(error) ? "danger" : "warn");
      setPasswordError(unlockErrorMessage(error));
      window.setTimeout(() => passwordInputRef.current?.focus(), 0);
    },
  });
  const bulkDownloadMutation = useMutation({
    mutationFn: () => bulkDownloadPublicShare(token),
    onError: () =>
      toast.show({ tone: "warn", message: "一括ダウンロードできません。" }),
  });
  const share = query.data;
  const canBrowse = Boolean(share && "items" in share);
  const itemsQuery = useQuery({
    queryKey: ["public-share-items", token, currentFolderId],
    queryFn: () => fetchPublicShareItems(token, currentFolderId),
    enabled: canBrowse,
    retry: false,
  });

  if (query.isLoading) return <LoadingIndicator label="共有リンクを読み込んでいます" />;
  if (query.isError) {
    return (
      <main className="public-share-page">
        <ErrorState message="この共有リンクは利用できません。" />
      </main>
    );
  }

  if (!share || !("items" in share)) {
    return (
      <main className="public-share-page public-share-auth">
        <form
          className="public-share-password"
          onSubmit={(event) => {
            event.preventDefault();
            if (unlockMutation.isPending) return;
            if (!password.trim()) {
              setPasswordErrorTone("warn");
              setPasswordError("パスワードを入力してください");
              passwordInputRef.current?.focus();
              return;
            }
            setPasswordError(null);
            unlockMutation.mutate();
          }}
        >
          <Lock size={22} aria-hidden="true" />
          <h1>パスワードが必要です</h1>
          <label className="field">
            <span>パスワード</span>
            <input
              ref={passwordInputRef}
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (passwordError) setPasswordError(null);
              }}
              autoComplete="current-password"
              aria-invalid={passwordError ? "true" : undefined}
              aria-describedby={
                passwordError ? "public-share-password-error" : undefined
              }
              aria-busy={unlockMutation.isPending ? "true" : undefined}
            />
            {passwordError ? (
              <span
                id="public-share-password-error"
                className={`field-error field-error-${passwordErrorTone}`}
                role="alert"
              >
                {passwordError}
              </span>
            ) : null}
          </label>
          <Button type="submit" loading={unlockMutation.isPending}>
            {unlockMutation.isPending ? "確認中..." : "表示"}
          </Button>
        </form>
      </main>
    );
  }

  return (
    <main className="public-share-page">
      <header className="public-share-header">
        <div>
          <h1>{share.name}</h1>
          {share.expires_at ? <p>有効期限: {formatDate(share.expires_at)}</p> : null}
        </div>
        {share.allow_bulk_download ? (
          <Button
            type="button"
            variant="secondary"
            loading={bulkDownloadMutation.isPending}
            onClick={() => bulkDownloadMutation.mutate()}
          >
            <Package size={16} aria-hidden="true" />
            一括ダウンロード
          </Button>
        ) : null}
      </header>
      <PublicShareBrowser
        token={token}
        items={itemsQuery.data?.items ?? []}
        folderPath={folderPath}
        allowDownload={share.allow_download}
        loading={itemsQuery.isLoading}
        error={itemsQuery.isError}
        onOpenFolder={(item) => setFolderPath((current) => [...current, item])}
        onNavigate={(index) => {
          setFolderPath(index === -1 ? [] : folderPath.slice(0, index + 1));
        }}
        onPreview={setPreviewItem}
      />
      <Modal
        open={previewItem !== null}
        title={previewItem?.name ?? "プレビュー"}
        className="public-share-preview-modal"
        onClose={() => setPreviewItem(null)}
      >
        {previewItem ? <PublicSharePreview token={token} item={previewItem} /> : null}
      </Modal>
    </main>
  );
}

function unlockErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === "invalid_share_password" || error.code === "invalid_password")
      return "パスワードが正しくありません";
    if (error.code === "password_required") return "パスワードを入力してください";
    if (error.code === "share_expired") return "この共有リンクは有効期限が切れています";
    if (error.code === "share_revoked") return "この共有リンクは停止されています";
    if (error.status === 429)
      return "試行回数が上限を超えました。時間をおいて再度お試しください";
    if (error.status >= 500) {
      return "認証処理に失敗しました。時間をおいて再度お試しください";
    }
  }
  if (error instanceof ApiNetworkError) {
    return "認証処理に失敗しました。時間をおいて再度お試しください";
  }
  return "認証処理に失敗しました。時間をおいて再度お試しください";
}

function isSystemUnlockError(error: unknown) {
  return (
    error instanceof ApiNetworkError ||
    (error instanceof ApiError && error.status >= 500)
  );
}

function PublicShareBrowser({
  token,
  items,
  folderPath,
  allowDownload,
  loading,
  error,
  onOpenFolder,
  onNavigate,
  onPreview,
}: {
  token: string;
  items: PublicShareItem[];
  folderPath: PublicShareItem[];
  allowDownload: boolean;
  loading: boolean;
  error: boolean;
  onOpenFolder: (item: PublicShareItem) => void;
  onNavigate: (index: number) => void;
  onPreview: (item: PublicShareItem) => void;
}) {
  return (
    <section className="public-share-browser" aria-label="共有ファイル一覧">
      <nav className="public-share-breadcrumbs" aria-label="共有フォルダ">
        <button
          type="button"
          onClick={() => onNavigate(-1)}
          disabled={folderPath.length === 0}
        >
          共有ルート
        </button>
        {folderPath.map((folder, index) => (
          <span key={folder.id} className="public-share-crumb">
            <ChevronRight size={14} aria-hidden="true" />
            <button
              type="button"
              onClick={() => onNavigate(index)}
              disabled={index === folderPath.length - 1}
            >
              {folder.name}
            </button>
          </span>
        ))}
      </nav>
      <div className="public-share-list" aria-busy={loading ? "true" : undefined}>
        {loading ? <LoadingIndicator label="フォルダを読み込んでいます" /> : null}
        {error ? <ErrorState message="フォルダを読み込めませんでした。" /> : null}
        {!loading && !error && items.length === 0 ? (
          <EmptyState title="このフォルダは空です。" />
        ) : null}
        {!loading && !error && items.length > 0 ? (
          <div className="public-share-grid">
            {items.map((item) => (
              <PublicShareItemCard
                key={item.id}
                token={token}
                item={item}
                allowDownload={allowDownload}
                onOpenFolder={onOpenFolder}
                onPreview={onPreview}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PublicShareItemCard({
  token,
  item,
  allowDownload,
  onOpenFolder,
  onPreview,
}: {
  token: string;
  item: PublicShareItem;
  allowDownload: boolean;
  onOpenFolder: (item: PublicShareItem) => void;
  onPreview: (item: PublicShareItem) => void;
}) {
  const directory = item.item_type === "directory";
  const previewable = safePreview(item);
  const title = directory ? `${item.name} を開く` : `${item.name} をプレビュー`;
  return (
    <article className="public-share-card">
      <button
        type="button"
        className="public-share-card-main"
        onClick={() => {
          if (directory) onOpenFolder(item);
          else if (previewable) onPreview(item);
        }}
        disabled={!directory && !previewable}
        aria-label={title}
      >
        <span className="public-share-card-icon" aria-hidden="true">
          {directory ? <Folder size={30} /> : <FileTypeIcon item={item} />}
        </span>
        <span className="public-share-card-name" title={item.name}>
          {item.name}
        </span>
        <span className="public-share-card-meta">
          {directory ? "フォルダ" : fileKindLabel(item)}
          {!directory ? ` ・ ${formatSize(item.size ?? item.file_size)}` : ""}
        </span>
      </button>
      {!directory ? (
        <div className="public-share-actions">
          {previewable ? (
            <button
              type="button"
              className="public-share-preview-button"
              onClick={() => onPreview(item)}
            >
              <Eye size={15} aria-hidden="true" />
              プレビュー
            </button>
          ) : (
            <span className="public-share-preview-unavailable">プレビュー不可</span>
          )}
          {allowDownload && item.downloadable ? (
            <a href={publicDownloadUrl(token, item.id)}>
              <Download size={15} aria-hidden="true" />
              ダウンロード
            </a>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function safePreview(item: PublicShareItem) {
  if (item.previewable !== undefined) return item.previewable;

  const contentType = item.content_type?.toLowerCase() ?? "";
  const extension = item.extension?.toLowerCase() ?? "";
  return (
    [
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
      "video/mp4",
      "video/webm",
      "audio/mpeg",
      "audio/mp4",
      "audio/ogg",
      "application/pdf",
      "text/plain",
    ].includes(contentType) &&
    [
      "png",
      "jpg",
      "jpeg",
      "gif",
      "webp",
      "mp4",
      "webm",
      "mp3",
      "m4a",
      "ogg",
      "pdf",
      "txt",
    ].includes(extension)
  );
}

function fileKindLabel(item: PublicShareItem) {
  if (item.content_type?.startsWith("image/")) return "画像";
  if (item.content_type?.startsWith("video/")) return "動画";
  if (item.content_type?.startsWith("audio/")) return "音声";
  if (item.content_type === "application/pdf") return "PDF";
  if (item.content_type === "text/plain") return "テキスト";
  return item.extension ? item.extension.toUpperCase() : "ファイル";
}

function PublicSharePreview({ token, item }: { token: string; item: PublicShareItem }) {
  const mediaRef = useRef<HTMLMediaElement | null>(null);

  useEffect(() => {
    return () => {
      const media = mediaRef.current;
      if (!media) return;
      media.pause();
      media.currentTime = 0;
      media.removeAttribute("src");
      media.load();
    };
  }, []);

  if (item.content_type?.startsWith("image/")) {
    return (
      <img
        className="preview-media"
        src={publicPreviewUrl(token, item.id)}
        alt={item.name}
      />
    );
  }
  if (item.content_type === "application/pdf" || item.content_type === "text/plain") {
    return (
      <iframe
        className="preview-frame"
        src={publicPreviewUrl(token, item.id)}
        title={item.name}
      />
    );
  }
  if (item.content_type?.startsWith("video/")) {
    return (
      <video
        ref={(element) => {
          if (element) mediaRef.current = element;
        }}
        className="preview-media"
        src={publicPreviewUrl(token, item.id)}
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
        src={publicPreviewUrl(token, item.id)}
        controls
        preload="metadata"
      />
    );
  }
  return <p>このファイルはプレビューできません。ダウンロードして確認してください。</p>;
}

function formatDate(value?: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatSize(value?: number | null) {
  if (!value) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
