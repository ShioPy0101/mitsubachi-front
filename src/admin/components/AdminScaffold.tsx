import type { UseQueryResult } from "@tanstack/react-query";
import { NavLink, Outlet, useSearchParams } from "react-router-dom";

import { ApiError } from "../../api/errors";
import type { AdminMeta, CurrentUser } from "../../api/schemas";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingIndicator } from "../../components/LoadingIndicator";
import { Pagination } from "../../components/Pagination";
import { canUseSystemAdmin } from "../../auth/permissions";
import { useAuth } from "../../auth/useAuth";

export function AdminLayout() {
  const auth = useAuth();
  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="admin-header-inner">
          <p className="admin-header-kicker">Mitsubachi</p>
          <h1>管理画面</h1>
        </div>
      </header>
      <div className="admin-page">
        <nav className="admin-tabs" aria-label="管理メニュー">
          <NavLink to="/admin/dashboard">ダッシュボード</NavLink>
          <NavLink to="/admin/organizations">組織</NavLink>
          <NavLink to="/admin/users">ユーザー</NavLink>
          <NavLink to="/admin/drive-items">ファイル</NavLink>
          <NavLink to="/admin/audit-logs">操作履歴</NavLink>
          <NavLink to="/admin/audit-events">システムイベント</NavLink>
          {canUseSystemAdmin(auth.user) ? (
            <NavLink to="/admin/organizations/new">組織作成</NavLink>
          ) : null}
        </nav>
        <main className="admin-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
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
