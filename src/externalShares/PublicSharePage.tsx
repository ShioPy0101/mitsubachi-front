import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Folder, Lock, Package } from "lucide-react";
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { FileTypeIcon } from "../components/FileTypeIcon";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { useToast } from "../components/ToastProvider";
import {
  bulkDownloadPublicShare,
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
  const query = useQuery({
    queryKey: ["public-share", token],
    queryFn: () => fetchPublicShare(token),
    retry: false,
  });
  const unlockMutation = useMutation({
    mutationFn: () => unlockPublicShare(token, password),
    onSuccess: async () => {
      setPassword("");
      await queryClient.invalidateQueries({ queryKey: ["public-share", token] });
    },
    onError: () =>
      toast.show({ tone: "warn", message: "共有リンクを確認できません。" }),
  });
  const bulkDownloadMutation = useMutation({
    mutationFn: () => bulkDownloadPublicShare(token),
    onError: () =>
      toast.show({ tone: "warn", message: "一括ダウンロードできません。" }),
  });

  if (query.isLoading) return <LoadingIndicator label="共有リンクを読み込んでいます" />;
  if (query.isError) {
    return (
      <main className="public-share-page">
        <ErrorState message="この共有リンクは利用できません。" />
      </main>
    );
  }

  const share = query.data;
  if (!share || share.password_required === true) {
    return (
      <main className="public-share-page public-share-auth">
        <form
          className="public-share-password"
          onSubmit={(event) => {
            event.preventDefault();
            if (password) unlockMutation.mutate();
          }}
        >
          <Lock size={22} aria-hidden="true" />
          <h1>パスワードが必要です</h1>
          <label className="field">
            <span>パスワード</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          <Button type="submit" loading={unlockMutation.isPending} disabled={!password}>
            表示
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
      {share.items.length === 0 ? (
        <EmptyState title="公開対象はありません。" />
      ) : (
        <PublicShareTree
          token={token}
          items={share.items}
          allowDownload={share.allow_download}
        />
      )}
    </main>
  );
}

function PublicShareTree({
  token,
  items,
  allowDownload,
}: {
  token: string;
  items: PublicShareItem[];
  allowDownload: boolean;
}) {
  const roots = useMemo(() => items.filter((item) => !item.parent_id), [items]);
  return (
    <div className="public-share-list">
      {roots.map((item) => (
        <PublicShareItemRow
          key={item.id}
          token={token}
          item={item}
          allItems={items}
          allowDownload={allowDownload}
          depth={0}
        />
      ))}
    </div>
  );
}

function PublicShareItemRow({
  token,
  item,
  allItems,
  allowDownload,
  depth,
}: {
  token: string;
  item: PublicShareItem;
  allItems: PublicShareItem[];
  allowDownload: boolean;
  depth: number;
}) {
  const children = allItems.filter((child) => child.parent_id === item.id);
  return (
    <div className="public-share-row-group">
      <div className="public-share-row" style={{ paddingLeft: `${depth * 20 + 12}px` }}>
        {item.item_type === "directory" ? (
          <Folder size={18} aria-hidden="true" />
        ) : (
          <FileTypeIcon item={item} />
        )}
        <div>
          <strong>{item.name}</strong>
          <span>
            {item.item_type === "directory" ? "フォルダ" : formatSize(item.file_size)}
          </span>
        </div>
        {item.item_type === "file" ? (
          <div className="public-share-actions">
            {safePreview(item) ? (
              <a
                href={publicPreviewUrl(token, item.id)}
                target="_blank"
                rel="noreferrer"
              >
                プレビュー
              </a>
            ) : null}
            {allowDownload ? (
              <a href={publicDownloadUrl(token, item.id)}>
                <Download size={15} aria-hidden="true" />
                ダウンロード
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
      {children.map((child) => (
        <PublicShareItemRow
          key={child.id}
          token={token}
          item={child}
          allItems={allItems}
          allowDownload={allowDownload}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

function safePreview(item: PublicShareItem) {
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
