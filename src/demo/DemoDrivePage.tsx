import { useQuery } from "@tanstack/react-query";
import { fetchDemoItems } from "./api";
import { Download, FileText, Folder, UploadCloud } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
import { StatusBadge } from "../components/StatusBadge";
import { endDemoSession, hasDemoSession } from "./session";
import "./demo.css";

export function DemoDrivePage() {
  const navigate = useNavigate();
  const [folder, setFolder] = useState<string | null>(null);
  const [restriction, setRestriction] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["demo", "items"],
    queryFn: fetchDemoItems,
    enabled: hasDemoSession(),
    retry: false,
  });
  const samples = query.data ?? [];
  if (!hasDemoSession()) return <Navigate to="/login" replace />;

  return (
    <div className="app-shell">
      <header className="app-header">
        <StatusBadge tone="warning">demo</StatusBadge>
        <strong>Mitsubachi</strong>
        <Button
          variant="ghost"
          onClick={() => {
            endDemoSession();
            void navigate("/login");
          }}
        >
          デモを終了
        </Button>
      </header>
      <main
        className="app-main demo-drive"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          setRestriction("アップロード");
        }}
      >
        <div className="page-header">
          <h1>デモテナント</h1>
          <p>
            demo@tenant.example ·
            表示用のサンプルです。フォルダーやファイルに実体はありません。
          </p>
        </div>
        <nav className="breadcrumbs" aria-label="フォルダーの階層">
          <button className="text-button" onClick={() => setFolder(null)}>
            マイドライブ
          </button>
          {folder && (
            <span aria-current="page">
              {" "}
              / {samples.find((item) => item.id === folder)?.name}
            </span>
          )}
        </nav>
        <div className="toolbar demo-toolbar">
          <Button onClick={() => setRestriction("アップロード")}>
            <UploadCloud size={16} aria-hidden="true" />
            アップロード
          </Button>
          <Button variant="secondary" onClick={() => setRestriction("ダウンロード")}>
            <Download size={16} aria-hidden="true" />
            一括ダウンロード
          </Button>
        </div>
        {query.isPending && <p role="status">サンプルを読み込んでいます…</p>}
        {query.error && (
          <div role="alert">
            <p>{query.error.message}</p>
            <Button onClick={() => void query.refetch()}>再試行</Button>
          </div>
        )}
        <ul className="demo-items" aria-label="サンプルフォルダーとファイル">
          {samples
            .filter((item) => item.parent === folder)
            .map((item) => (
              <li key={item.id} className="demo-item">
                {item.size ? (
                  <FileText size={20} aria-hidden="true" />
                ) : (
                  <Folder size={20} aria-hidden="true" />
                )}
                {item.size ? (
                  <span className="demo-item-name">{item.name}</span>
                ) : (
                  <button
                    className="text-button demo-item-name"
                    onClick={() => setFolder(item.id)}
                  >
                    {item.name}
                  </button>
                )}
                {item.size && (
                  <>
                    <span>{item.size}</span>
                    <Button
                      variant="ghost"
                      aria-label={`${item.name}をダウンロード`}
                      onClick={() => setRestriction("ダウンロード")}
                    >
                      <Download size={16} aria-hidden="true" />
                      <span>ダウンロード</span>
                    </Button>
                  </>
                )}
              </li>
            ))}
        </ul>
        <Link to="/login">ログイン画面に戻る</Link>
      </main>
      <Modal
        open={restriction !== null}
        title="デモテナントの操作制限"
        onClose={() => setRestriction(null)}
      >
        <p>デモテナントのため、{restriction}はできません。</p>
        <p>サンプルのフォルダーやファイルの閲覧をお試しください。</p>
        <Button onClick={() => setRestriction(null)}>閉じる</Button>
      </Modal>
    </div>
  );
}
