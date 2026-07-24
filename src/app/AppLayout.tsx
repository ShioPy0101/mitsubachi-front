import {
  LogOut,
  Menu,
  Shield,
  Trash2,
  UploadCloud,
  UserRound,
  Users,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
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
  const location = useLocation();
  const toast = useToast();
  const selectedOrganizationId = selectedOrganizationIdFor(
    location.pathname,
    auth.user,
  );
  const selectedMembership = auth.user?.memberships.find(
    (membership) => membership.organization.id === selectedOrganizationId,
  );
  const organizationName =
    selectedMembership?.organization.name ??
    auth.user?.organization?.name ??
    "Organization";
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
          {auth.user?.memberships.length ? (
            <select
              className="organization-switcher"
              aria-label="Organizationを切り替え"
              value={selectedOrganizationId ?? ""}
              onChange={(event) => {
                const nextOrganizationId = Number(event.target.value);
                void navigate(`/organizations/${nextOrganizationId}/drive`);
              }}
            >
              {auth.user.memberships.map((membership) => (
                <option
                  key={membership.organization.id}
                  value={membership.organization.id}
                >
                  {membership.organization.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="org-name">{organizationName}</span>
          )}
          <span className="user-chip">
            {auth.user?.display_name ?? auth.user?.name ?? "未設定ユーザー"}
          </span>
          <span className="role-chip">
            {selectedMembership?.role ?? auth.user?.role}
          </span>
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
  const location = useLocation();
  const organizationId = selectedOrganizationIdFor(location.pathname, auth.user);
  const drivePath = organizationId
    ? `/organizations/${organizationId}/drive`
    : "/drive";
  const trashPath = organizationId
    ? `/organizations/${organizationId}/trash`
    : "/trash";
  const groupPath = organizationId
    ? `/organizations/${organizationId}/settings/group`
    : "/settings/group";
  return (
    <nav className="sidebar" aria-label="メインナビゲーション">
      <NavLink to={drivePath} onClick={onNavigate} className="nav-create">
        <UploadCloud size={18} aria-hidden="true" />
        新規アップロード
      </NavLink>
      <NavLink to={drivePath} onClick={onNavigate}>
        共有ドライブ
      </NavLink>
      <NavLink to={trashPath} onClick={onNavigate}>
        <Trash2 size={18} aria-hidden="true" />
        ゴミ箱
      </NavLink>
      <NavLink to={groupPath} onClick={onNavigate}>
        <Users size={18} aria-hidden="true" />
        グループ
      </NavLink>
      <NavLink to="/settings/user" onClick={onNavigate}>
        <UserRound size={18} aria-hidden="true" />
        ユーザー情報
      </NavLink>
      {canUseAdmin(auth.user, organizationId) ? (
        <NavLink to="/admin" onClick={onNavigate}>
          <Shield size={18} aria-hidden="true" />
          管理画面
        </NavLink>
      ) : null}
    </nav>
  );
}

function selectedOrganizationIdFor(
  pathname: string,
  user: ReturnType<typeof useAuth>["user"],
) {
  const match = /^\/organizations\/(\d+)/.exec(pathname);
  if (match) return Number(match[1]);

  return user?.memberships[0]?.organization.id ?? user?.organization?.id ?? null;
}
