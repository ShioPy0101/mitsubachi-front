import { LogOut, Menu, Shield, Trash2, UploadCloud, Users } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { clearCsrfToken } from "../api/client";
import { authKeys, logout } from "../auth/api";
import { canUseAdmin } from "../auth/permissions";
import { useAuth } from "../auth/useAuth";
import { IconButton } from "../components/IconButton";
import { useToast } from "../components/ToastProvider";

export function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const auth = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: async () => {
      clearCsrfToken();
      queryClient.removeQueries({ queryKey: authKeys.me });
      await queryClient.invalidateQueries();
      void navigate("/login", { replace: true });
    },
    onError: () => {
      toast.show({ tone: "danger", message: "ログアウトに失敗しました。" });
    },
  });

  return (
    <div className="app-shell">
      <header className="app-header">
        <IconButton
          className="mobile-only"
          label="メニューを開く"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
        >
          <Menu size={20} aria-hidden="true" />
        </IconButton>
        <div className="app-brand">
          <span className="brand-mark" aria-hidden="true">
            M
          </span>
          <span>Mitsubachi Drive</span>
        </div>
        <div className="header-user">
          <span className="org-name">
            {auth.user?.organization?.name ?? "Organization"}
          </span>
          <span className="user-chip">{auth.user?.display_name ?? auth.user?.name ?? "未設定ユーザー"}</span>
          <span className="role-chip">{auth.user?.role}</span>
          <IconButton
            label="ログアウト"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
          >
            <LogOut size={18} aria-hidden="true" />
          </IconButton>
        </div>
      </header>
      <div className="app-body">
        <Sidebar />
        <main className="app-main">
          <Outlet />
        </main>
      </div>
      {drawerOpen ? (
        <div
          className="drawer-layer"
          onKeyDown={(event) => event.key === "Escape" && setDrawerOpen(false)}
        >
          <button
            type="button"
            className="drawer-backdrop"
            aria-label="メニューを閉じる"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="mobile-drawer" aria-label="モバイルメニュー">
            <Sidebar onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const auth = useAuth();
  return (
    <nav className="sidebar" aria-label="メインナビゲーション">
      <NavLink to="/drive" onClick={onNavigate} className="nav-create">
        <UploadCloud size={18} aria-hidden="true" />
        新規アップロード
      </NavLink>
      <NavLink to="/drive" onClick={onNavigate}>
        共有ドライブ
      </NavLink>
      <NavLink to="/trash" onClick={onNavigate}>
        <Trash2 size={18} aria-hidden="true" />
        ゴミ箱
      </NavLink>
      <NavLink to="/settings/group" onClick={onNavigate}>
        <Users size={18} aria-hidden="true" />
        グループ
      </NavLink>
      {canUseAdmin(auth.user) ? (
        <NavLink to="/admin" onClick={onNavigate}>
          <Shield size={18} aria-hidden="true" />
          管理画面
        </NavLink>
      ) : null}
    </nav>
  );
}
