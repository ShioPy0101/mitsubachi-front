import {
  LogOut,
  Menu,
  Moon,
  PlusCircle,
  Shield,
  Sun,
  Trash2,
  UploadCloud,
  UserRound,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { clearCsrfToken } from "../api/client";
import { authKeys, logout } from "../auth/api";
import { canUseAdmin, canUseSystemAdmin } from "../auth/permissions";
import { useAuth } from "../auth/useAuth";
import { IconButton } from "../components/IconButton";
import { useToast } from "../components/ToastProvider";
import {
  applyColorMode,
  getInitialColorMode,
  persistColorMode,
  type ColorMode,
} from "./colorMode";

export function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [switchingOrganizationId, setSwitchingOrganizationId] = useState<number | null>(
    null,
  );
  const [colorMode, setColorMode] = useState<ColorMode>(() => getInitialColorMode());
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
  const isSwitchingOrganization =
    switchingOrganizationId !== null &&
    switchingOrganizationId !== selectedOrganizationId;
  const activeMemberships =
    auth.user?.memberships.filter((membership) => membership.status === "active") ?? [];
  const organizationName = selectedMembership?.organization.name ?? "Organization";
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

  useEffect(() => {
    applyColorMode(colorMode);
    persistColorMode(colorMode);
  }, [colorMode]);

  useEffect(() => {
    if (selectedOrganizationId) {
      window.localStorage.setItem(
        "mitsubachi.currentOrganizationId",
        String(selectedOrganizationId),
      );
    }
  }, [selectedOrganizationId]);

  const nextColorMode = colorMode === "light" ? "dark" : "light";
  const colorModeLabel =
    colorMode === "light" ? "黒モードへ切り替え" : "白モードへ切り替え";

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
          {activeMemberships.length ? (
            <select
              className="organization-switcher"
              aria-label="Organizationを切り替え"
              value={selectedOrganizationId ?? ""}
              disabled={isSwitchingOrganization}
              onChange={(event) => {
                const nextOrganizationId = Number(event.target.value);
                setSwitchingOrganizationId(nextOrganizationId);
                queryClient.removeQueries({ queryKey: ["drive-items"] });
                queryClient.removeQueries({ queryKey: ["group"] });
                window.localStorage.setItem(
                  "mitsubachi.currentOrganizationId",
                  String(nextOrganizationId),
                );
                void navigate(`/organizations/${nextOrganizationId}/drive`);
              }}
            >
              {activeMemberships.map((membership) => (
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
            label={colorModeLabel}
            className="color-mode-toggle"
            aria-pressed={colorMode === "dark"}
            onClick={() => setColorMode(nextColorMode)}
          >
            {colorMode === "light" ? (
              <Moon size={18} aria-hidden="true" />
            ) : (
              <Sun size={18} aria-hidden="true" />
            )}
          </IconButton>
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
          {isSwitchingOrganization ? (
            <div className="content-loading" role="status">
              組織を切り替えています
            </div>
          ) : (
            <Outlet />
          )}
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
  const currentMembership = auth.user?.memberships.find(
    (membership) => membership.organization.id === organizationId,
  );
  const canManageCurrentOrganization =
    currentMembership?.role === "organization_admin" ||
    auth.user?.role === "system_admin";
  return (
    <nav className="sidebar" aria-label="メインナビゲーション">
      <div className="sidebar-section">
        <p className="sidebar-section-title">通常利用</p>
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
        <NavLink to="/organizations/join" onClick={onNavigate}>
          <PlusCircle size={18} aria-hidden="true" />
          新しい組織に参加
        </NavLink>
        {canManageCurrentOrganization && canUseAdmin(auth.user, organizationId) ? (
          <NavLink
            to={
              organizationId
                ? `/organizations/${organizationId}/admin/dashboard`
                : "/system-admin/dashboard"
            }
            onClick={onNavigate}
          >
            <Shield size={18} aria-hidden="true" />
            組織管理
          </NavLink>
        ) : null}
      </div>
      {canUseSystemAdmin(auth.user) ? (
        <div className="sidebar-section">
          <p className="sidebar-section-title">システム管理</p>
          <NavLink to="/system-admin/dashboard" onClick={onNavigate}>
            <Shield size={18} aria-hidden="true" />
            ダッシュボード
          </NavLink>
          <NavLink to="/system-admin/organizations" onClick={onNavigate}>
            組織
          </NavLink>
          <NavLink to="/system-admin/users" onClick={onNavigate}>
            ユーザー
          </NavLink>
          <NavLink to="/system-admin/drive-items" onClick={onNavigate}>
            ファイル
          </NavLink>
          <NavLink to="/system-admin/audit-logs" onClick={onNavigate}>
            監査ログ
          </NavLink>
        </div>
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

  const storedOrganizationId = Number(
    window.localStorage.getItem("mitsubachi.currentOrganizationId"),
  );
  if (
    Number.isFinite(storedOrganizationId) &&
    user?.memberships.some(
      (membership) =>
        membership.status === "active" &&
        membership.organization.id === storedOrganizationId,
    )
  ) {
    return storedOrganizationId;
  }

  return (
    user?.memberships.find((membership) => membership.status === "active")?.organization
      .id ?? null
  );
}
