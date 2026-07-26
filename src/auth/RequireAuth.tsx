import { Link, Navigate, Outlet } from "react-router-dom";

import { API_BASE_URL } from "../api/client";
import { ErrorState } from "../components/ErrorState";
import { LoadingIndicator } from "../components/LoadingIndicator";
import {
  canUseAdmin,
  canUseSystemAdmin,
  hasAllowedRole,
  type Role,
} from "./permissions";
import { useAuth } from "./useAuth";

export function RequireAuth({
  admin = false,
  system = false,
  allowedRoles,
}: {
  admin?: boolean;
  system?: boolean;
  allowedRoles?: Role[];
}) {
  const auth = useAuth();

  if (auth.status === "checking") {
    return <LoadingIndicator label="認証状態を確認しています" />;
  }

  if (auth.status === "error") {
    return (
      <main className="state-page" aria-live="polite">
        <ErrorState
          title="API接続を確認できません"
          message={auth.error?.message ?? "認証状態の確認に失敗しました。"}
          onRetry={auth.retryAuthCheck}
        />
        {import.meta.env.DEV ? (
          <dl className="debug-details" aria-label="開発用APIエラー詳細">
            <div>
              <dt>Request URL</dt>
              <dd>{auth.error?.url ?? `${API_BASE_URL}/api/v1/me`}</dd>
            </div>
            <div>
              <dt>Error Type</dt>
              <dd>{auth.error?.kind ?? "unknown"}</dd>
            </div>
            {auth.error?.status ? (
              <div>
                <dt>HTTP Status</dt>
                <dd>{auth.error.status}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </main>
    );
  }

  if (auth.status === "unauthenticated") {
    return (
      <main className="state-page" aria-live="polite">
        <section className="error-state session-expired-state" role="status">
          <h2>セッションの有効期限が切れました</h2>
          <p>再度ログインしてください。</p>
          <Link to="/login" className="button button-secondary">
            ログイン画面へ
          </Link>
        </section>
      </main>
    );
  }

  if (allowedRoles && !hasAllowedRole(auth.user, allowedRoles)) {
    return <Navigate to="/403" replace />;
  }

  if (system && !canUseSystemAdmin(auth.user)) {
    return <Navigate to="/403" replace />;
  }

  if (admin && !canUseAdmin(auth.user)) {
    return <Navigate to="/403" replace />;
  }

  return <Outlet />;
}
