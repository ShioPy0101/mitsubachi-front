import { Navigate, Outlet, useLocation } from "react-router-dom";

import { API_BASE_URL } from "../api/client";
import { ErrorState } from "../components/ErrorState";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { canUseAdmin, canUseSystemAdmin } from "./permissions";
import { useAuth } from "./useAuth";

export function RequireAuth({
  admin = false,
  system = false,
}: {
  admin?: boolean;
  system?: boolean;
}) {
  const auth = useAuth();
  const location = useLocation();

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
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (system && !canUseSystemAdmin(auth.user)) {
    return <Navigate to="/403" replace />;
  }

  if (admin && !canUseAdmin(auth.user)) {
    return <Navigate to="/403" replace />;
  }

  return <Outlet />;
}
