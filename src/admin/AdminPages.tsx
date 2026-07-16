import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, useSearchParams } from "react-router-dom";

import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { FieldError } from "../components/FieldError";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { Pagination } from "../components/Pagination";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/ToastProvider";
import { canUseSystemAdmin } from "../auth/permissions";
import { useAuth } from "../auth/useAuth";
import {
  adminKeys,
  createOrganization,
  fetchAdminDriveItems,
  fetchAuditLogs,
  fetchDashboard,
  fetchOrganizations,
  fetchUsers,
  suspendUser,
  unsuspendUser,
} from "./api";

export function AdminLayout() {
  return (
    <section className="admin-page">
      <div className="page-header">
        <h1>管理画面</h1>
        <nav className="admin-tabs" aria-label="管理メニュー">
          <NavLink to="/admin">ダッシュボード</NavLink>
          <NavLink to="/admin/organizations">Organization</NavLink>
          <NavLink to="/admin/users">User</NavLink>
          <NavLink to="/admin/drive-items">DriveItem</NavLink>
          <NavLink to="/admin/audit-logs">監査ログ</NavLink>
        </nav>
      </div>
    </section>
  );
}

export function AdminDashboard() {
  const query = useQuery({ queryKey: adminKeys.dashboard(), queryFn: fetchDashboard });
  if (query.isLoading) return <LoadingIndicator label="管理情報を読み込んでいます" />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} />;
  const data = query.data;
  return (
    <AdminFrame title="ダッシュボード">
      <div className="metric-grid">
        <Metric label="Organizations" value={data?.organizations_count} />
        <Metric label="Users" value={data?.users_count} />
        <Metric label="DriveItems" value={data?.drive_items_count} />
        <Metric label="AuditLogs" value={data?.audit_logs_count} />
      </div>
    </AdminFrame>
  );
}

export function AdminSystemPage() {
  const [params, setParams] = useSearchParams();
  const queryString = queryWithDefaults(params);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [organizationName, setOrganizationName] = useState("");
  const [organizationNameError, setOrganizationNameError] = useState<string>();
  const auditQuery = useQuery({
    queryKey: adminKeys.auditLogs(queryString),
    queryFn: () => fetchAuditLogs(queryString),
  });
  const createMutation = useMutation({
    mutationFn: createOrganization,
    onSuccess: async (organization) => {
      setOrganizationName("");
      await queryClient.invalidateQueries({ queryKey: adminKeys.all });
      toast.show({
        tone: "success",
        message: `${organization.name} を作成しました。`,
      });
    },
    onError: (error) => {
      toast.show({ tone: "danger", message: errorMessage(error) });
    },
  });

  return (
    <AdminFrame title="System管理">
      <div className="system-admin-grid">
        <section className="system-admin-panel" aria-labelledby="system-org-create">
          <h2 id="system-org-create">Organization作成</h2>
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              const name = organizationName.trim();
              if (!name) {
                setOrganizationNameError("Organization名を入力してください。");
                return;
              }
              setOrganizationNameError(undefined);
              createMutation.mutate({ name });
            }}
          >
            <label className="field">
              <span>Organization名</span>
              <input
                value={organizationName}
                onChange={(event) => {
                  setOrganizationName(event.target.value);
                  if (organizationNameError) setOrganizationNameError(undefined);
                }}
                aria-invalid={Boolean(organizationNameError)}
                autoComplete="organization"
              />
              <FieldError error={organizationNameError} />
            </label>
            <Button type="submit" loading={createMutation.isPending}>
              作成
            </Button>
          </form>
          {createMutation.isError ? (
            <p className="system-admin-note" role="alert">
              {errorMessage(createMutation.error)}
            </p>
          ) : null}
        </section>

        <section className="system-admin-panel" aria-labelledby="system-audit-logs">
          <h2 id="system-audit-logs">全監査ログ</h2>
          <AdminSearch params={params} setParams={setParams} />
          <AdminTableState query={auditQuery}>
            {auditQuery.data ? (
              <>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th scope="col">ID</th>
                      <th scope="col">Organization</th>
                      <th scope="col">Actor</th>
                      <th scope="col">Action</th>
                      <th scope="col">Target</th>
                      <th scope="col">ChangeSet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditQuery.data.data.map((log) => (
                      <tr key={log.id}>
                        <td>{log.id}</td>
                        <td>{log.organization_name ?? log.organization_id ?? "-"}</td>
                        <td>{log.actor_email ?? log.actor_user_id ?? "-"}</td>
                        <td>{log.action ?? "-"}</td>
                        <td>
                          {log.target_type ?? "-"} {log.target_id ?? ""}
                        </td>
                        <td>
                          <pre className="json-preview">{safeJson(log.change_set)}</pre>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pagination
                  meta={auditQuery.data.meta}
                  onPageChange={(page) => updatePage(params, setParams, page)}
                />
              </>
            ) : null}
          </AdminTableState>
        </section>
      </div>
    </AdminFrame>
  );
}

export function AdminOrganizationsPage() {
  const [params, setParams] = useSearchParams();
  const queryString = queryWithDefaults(params);
  const query = useQuery({
    queryKey: adminKeys.organizations(queryString),
    queryFn: () => fetchOrganizations(queryString),
  });
  return (
    <AdminFrame title="Organization管理">
      <AdminSearch params={params} setParams={setParams} />
      <AdminTableState query={query}>
        {query.data ? (
          <>
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Name</th>
                  <th scope="col">Detail</th>
                </tr>
              </thead>
              <tbody>
                {query.data.data.map((organization) => (
                  <tr key={organization.id}>
                    <td>{organization.id}</td>
                    <td>{organization.name}</td>
                    <td>
                      <Link to={`/admin/organizations/${organization.id}`}>詳細</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              meta={query.data.meta}
              onPageChange={(page) => updatePage(params, setParams, page)}
            />
          </>
        ) : null}
      </AdminTableState>
    </AdminFrame>
  );
}

export function AdminUsersPage() {
  const [params, setParams] = useSearchParams();
  const queryString = queryWithDefaults(params);
  const queryClient = useQueryClient();
  const toast = useToast();
  const query = useQuery({
    queryKey: adminKeys.users(queryString),
    queryFn: () => fetchUsers(queryString),
  });
  const suspendMutation = useMutation({
    mutationFn: ({ id, suspended }: { id: number; suspended: boolean }) =>
      suspended ? unsuspendUser(id) : suspendUser(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.users(queryString) });
      await queryClient.invalidateQueries({ queryKey: adminKeys.dashboard() });
      toast.show({ tone: "success", message: "User状態を更新しました。" });
    },
    onError: (error) => toast.show({ tone: "danger", message: errorMessage(error) }),
  });
  return (
    <AdminFrame title="User管理">
      <AdminSearch params={params} setParams={setParams} />
      <AdminTableState query={query}>
        {query.data ? (
          <>
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                {query.data.data.map((user) => (
                  <tr key={user.id}>
                    <td>{user.id}</td>
                    <td>{user.email}</td>
                    <td>{user.role}</td>
                    <td>
                      <StatusBadge tone={user.suspended ? "danger" : "success"}>
                        {user.suspended ? "停止中" : "有効"}
                      </StatusBadge>
                    </td>
                    <td>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          suspendMutation.mutate({
                            id: user.id,
                            suspended: user.suspended,
                          })
                        }
                      >
                        {user.suspended ? "停止解除" : "停止"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              meta={query.data.meta}
              onPageChange={(page) => updatePage(params, setParams, page)}
            />
          </>
        ) : null}
      </AdminTableState>
    </AdminFrame>
  );
}

export function AdminDriveItemsPage() {
  const [params, setParams] = useSearchParams();
  const queryString = queryWithDefaults(params);
  const query = useQuery({
    queryKey: adminKeys.driveItems(queryString),
    queryFn: () => fetchAdminDriveItems(queryString),
  });
  return (
    <AdminFrame title="DriveItem管理">
      <AdminSearch params={params} setParams={setParams} />
      <AdminTableState query={query}>
        {query.data ? (
          <>
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Name</th>
                  <th scope="col">Type</th>
                  <th scope="col">Deleted</th>
                </tr>
              </thead>
              <tbody>
                {query.data.data.map((item) => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td>{item.name}</td>
                    <td>{item.item_type}</td>
                    <td>
                      {item.deleted_at ? (
                        <StatusBadge tone="warning">削除済み</StatusBadge>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              meta={query.data.meta}
              onPageChange={(page) => updatePage(params, setParams, page)}
            />
          </>
        ) : null}
      </AdminTableState>
    </AdminFrame>
  );
}

export function AdminAuditLogsPage() {
  const [params, setParams] = useSearchParams();
  const queryString = queryWithDefaults(params);
  const query = useQuery({
    queryKey: adminKeys.auditLogs(queryString),
    queryFn: () => fetchAuditLogs(queryString),
  });
  return (
    <AdminFrame title="管理監査ログ">
      <AdminSearch params={params} setParams={setParams} />
      <AdminTableState query={query}>
        {query.data ? (
          <>
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Action</th>
                  <th scope="col">Target</th>
                  <th scope="col">Metadata</th>
                </tr>
              </thead>
              <tbody>
                {query.data.data.map((log) => (
                  <tr key={log.id}>
                    <td>{log.id}</td>
                    <td>{log.action ?? "-"}</td>
                    <td>
                      {log.target_type ?? "-"} {log.target_id ?? ""}
                    </td>
                    <td>
                      <pre className="json-preview">{safeJson(log.change_set)}</pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              meta={query.data.meta}
              onPageChange={(page) => updatePage(params, setParams, page)}
            />
          </>
        ) : null}
      </AdminTableState>
    </AdminFrame>
  );
}

function AdminFrame({ title, children }: { title: string; children: React.ReactNode }) {
  const auth = useAuth();
  return (
    <section className="admin-page">
      <div className="page-header">
        <h1>{title}</h1>
        <nav className="admin-tabs" aria-label="管理メニュー">
          <NavLink to="/admin">ダッシュボード</NavLink>
          <NavLink to="/admin/organizations">Organization</NavLink>
          <NavLink to="/admin/users">User</NavLink>
          <NavLink to="/admin/drive-items">DriveItem</NavLink>
          <NavLink to="/admin/audit-logs">監査ログ</NavLink>
          {canUseSystemAdmin(auth.user) ? (
            <NavLink to="/admin/system">System管理</NavLink>
          ) : null}
        </nav>
      </div>
      {children}
    </section>
  );
}

function AdminSearch({
  params,
  setParams,
}: {
  params: URLSearchParams;
  setParams: (params: URLSearchParams) => void;
}) {
  return (
    <form
      className="admin-search"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const next = new URLSearchParams(params);
        const q = form.get("q");
        next.set("q", typeof q === "string" ? q : "");
        next.set("page", "1");
        setParams(next);
      }}
    >
      <label>
        <Search size={16} aria-hidden="true" />
        <span className="visually-hidden">検索</span>
        <input name="q" defaultValue={params.get("q") ?? ""} placeholder="検索" />
      </label>
      <Button type="submit" variant="secondary">
        検索
      </Button>
    </form>
  );
}

function AdminTableState({
  query,
  children,
}: {
  query: {
    isLoading: boolean;
    isError: boolean;
    error: unknown;
    data?: { data: unknown[] };
  };
  children: React.ReactNode;
}) {
  if (query.isLoading) return <LoadingIndicator label="一覧を読み込んでいます" />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} />;
  if (query.data?.data.length === 0)
    return <EmptyState title="条件に一致する項目はありません。" />;
  return children;
}

function Metric({ label, value }: { label: string; value?: number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value ?? "-"}</strong>
    </div>
  );
}

function queryWithDefaults(params: URLSearchParams) {
  const next = new URLSearchParams(params);
  if (!next.get("page")) next.set("page", "1");
  return `?${next.toString()}`;
}

function updatePage(
  params: URLSearchParams,
  setParams: (params: URLSearchParams) => void,
  page: number,
) {
  const next = new URLSearchParams(params);
  next.set("page", String(page));
  setParams(next);
}

function safeJson(value: unknown) {
  if (value === undefined || value === null) return "-";
  return JSON.stringify(value, null, 2);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "処理に失敗しました。";
}
