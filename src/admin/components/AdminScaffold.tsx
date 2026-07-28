import type { UseQueryResult } from "@tanstack/react-query";
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";

import { ApiError } from "../../api/errors";
import type { AdminMeta, CurrentUser } from "../../api/schemas";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingIndicator } from "../../components/LoadingIndicator";
import { Pagination } from "../../components/Pagination";
import { canUseAdmin, canUseSystemAdmin } from "../../auth/permissions";
import { adminOrganizationIdFromParam, adminUiPath } from "../api";
import { useAuth } from "../../auth/useAuth";

export function AdminLayout() {
  const auth = useAuth();
  const organizationId = adminOrganizationIdFromParam(useParams().organizationId);
  const systemAdminContext = organizationId === null;
  const currentOrganizationMembership = auth.user?.memberships.find(
    (membership) => membership.organization.id === organizationId,
  );
  const currentOrganization = currentOrganizationMembership?.organization;

  if (systemAdminContext && !canUseSystemAdmin(auth.user)) {
    return <Navigate to="/403" replace />;
  }

  if (!systemAdminContext && !canUseAdmin(auth.user, organizationId)) {
    return <Navigate to={`/organizations/${organizationId}/drive`} replace />;
  }

  return (
    <div
      className={`admin-shell ${
        systemAdminContext ? "system-admin-shell" : "organization-admin-shell"
      }`}
    >
      <header className="admin-header">
        <div className="admin-header-inner">
          <p className="admin-header-kicker">
            {systemAdminContext ? "システム全体" : "組織管理"}
          </p>
          <h1>{systemAdminContext ? "システム管理" : "組織管理"}</h1>
          {systemAdminContext ? (
            <p className="admin-context-label">システム全体を管理しています</p>
          ) : (
            <div className="admin-organization-context">
              <span className="admin-organization-mark" aria-hidden="true">
                {currentOrganization?.name.slice(0, 1) ?? "O"}
              </span>
              <div>
                <strong>
                  {currentOrganization?.name ?? `Organization ${organizationId}`}
                </strong>
                <span>この組織を管理しています</span>
              </div>
              <Link
                className="button button-secondary"
                to={`/organizations/${organizationId}/drive`}
              >
                共有ドライブへ戻る
              </Link>
            </div>
          )}
        </div>
      </header>
      <div className="admin-page">
        <nav className="admin-tabs" aria-label="管理メニュー">
          <NavLink to={adminUiPath(organizationId, "/dashboard")}>
            ダッシュボード
          </NavLink>
          {systemAdminContext ? (
            <NavLink to="/system-admin/organizations">組織</NavLink>
          ) : null}
          <NavLink to={adminUiPath(organizationId, "/users")}>ユーザー</NavLink>
          <NavLink to={adminUiPath(organizationId, "/drive-items")}>ファイル</NavLink>
          <NavLink to={adminUiPath(organizationId, "/operation-logs")}>
            操作履歴
          </NavLink>
          <NavLink to={adminUiPath(organizationId, "/file-access-logs")}>
            ファイルアクセス履歴
          </NavLink>
          <NavLink to={adminUiPath(organizationId, "/system-events")}>
            システムイベント
          </NavLink>
          {systemAdminContext ? (
            <NavLink to="/system-admin/organizations/new">組織作成</NavLink>
          ) : null}
        </nav>
        <AdminBreadcrumbs systemAdminContext={systemAdminContext} />
        <main className="admin-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function AdminBreadcrumbs({ systemAdminContext }: { systemAdminContext: boolean }) {
  const location = useLocation();
  const params = useParams();
  const organizationId = adminOrganizationIdFromParam(params.organizationId);
  const root = systemAdminContext ? "システム管理" : "組織管理";
  const rootPath = adminUiPath(organizationId, "/dashboard");
  const label = adminSectionLabel(location.pathname);

  return (
    <nav className="admin-breadcrumbs" aria-label="パンくず">
      <Link to={rootPath}>{root}</Link>
      {label ? (
        <>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{label}</span>
        </>
      ) : null}
    </nav>
  );
}

function adminSectionLabel(pathname: string) {
  if (pathname.includes("/organizations")) return "組織";
  if (pathname.includes("/users")) return "ユーザー";
  if (pathname.includes("/drive-items")) return "ファイル";
  if (pathname.includes("/operation-logs")) return "操作履歴";
  if (pathname.includes("/file-access-logs")) return "ファイルアクセス履歴";
  if (pathname.includes("/system-events")) return "システムイベント";
  if (pathname.includes("/dashboard")) return "ダッシュボード";
  return "";
}

export function AdminFrame({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <h2>{title}</h2>
        {actions ? <div className="toolbar">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function AdminSearch({
  fields = ["q"],
  busy = false,
}: {
  fields?:
    | Array<{
        name: string;
        label: string;
        type?: string;
        placeholder?: string;
        options?: Array<{ value: string; label: string }>;
      }>
    | string[];
  busy?: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const normalized = fields.map((field) =>
    typeof field === "string" ? { name: field, label: "検索" } : field,
  );

  return (
    <form
      className="admin-search admin-filter-grid"
      aria-label="検索条件"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const next = new URLSearchParams(params);
        normalized.forEach((field) => {
          const value = form.get(field.name);
          if (typeof value === "string" && value.trim()) next.set(field.name, value);
          else next.delete(field.name);
        });
        next.set("page", "1");
        setParams(next);
      }}
    >
      <div className="admin-search-heading">
        <h3>検索条件</h3>
      </div>
      {normalized.map((field) => (
        <label className="field" key={field.name}>
          <span>{field.label}</span>
          {field.options ? (
            <select name={field.name} defaultValue={params.get(field.name) ?? ""}>
              <option value="">すべて</option>
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              name={field.name}
              type={field.type ?? "text"}
              placeholder={field.placeholder}
              defaultValue={params.get(field.name) ?? ""}
            />
          )}
        </label>
      ))}
      <div className="admin-search-actions">
        <Button type="submit" variant="secondary" disabled={busy}>
          {busy ? "検索中" : "適用"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => setParams(new URLSearchParams({ page: "1" }))}
        >
          条件をリセット
        </Button>
      </div>
    </form>
  );
}

export function QueryState<T>({
  query,
  emptyTitle = "条件に一致する項目はありません。",
  children,
}: {
  query: UseQueryResult<T>;
  emptyTitle?: string;
  children: (data: T) => React.ReactNode;
}) {
  if (query.isLoading) return <LoadingIndicator label="読み込んでいます" />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return <EmptyState title="対象が見つかりません。" />;
    }
    return (
      <ErrorState
        message={errorMessage(query.error)}
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  }
  if (!query.data) return <EmptyState title={emptyTitle} />;
  return children(query.data);
}

export function PaginatedState<T extends { data: unknown[]; meta: AdminMeta }>({
  query,
  children,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => React.ReactNode;
}) {
  const [params, setParams] = useSearchParams();
  return (
    <QueryState query={query}>
      {(data) =>
        data.data.length === 0 ? (
          <EmptyState title="条件に一致する項目はありません。" />
        ) : (
          <>
            {children(data)}
            <Pagination
              meta={data.meta}
              onPageChange={(page) => {
                const next = new URLSearchParams(params);
                next.set("page", String(page));
                setParams(next);
              }}
              onPerPageChange={(perPage) => {
                const next = new URLSearchParams(params);
                next.set("page", "1");
                next.set("per_page", String(perPage));
                setParams(next);
              }}
            />
          </>
        )
      }
    </QueryState>
  );
}

export function DetailList({
  items,
}: {
  items: Array<{ label: string; value: React.ReactNode }>;
}) {
  return (
    <dl className="detail-list">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function adminQueryString(params: URLSearchParams) {
  const next = new URLSearchParams(params);
  if (!next.get("page")) next.set("page", "1");
  return `?${next.toString()}`;
}

export function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return `HTTPステータス: ${error.status}。${error.message}`;
  }
  return error instanceof Error ? error.message : "処理に失敗しました。";
}

export function userCanManageSystem(user: CurrentUser | null) {
  return user?.role === "system_admin";
}
