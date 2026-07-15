import { Navigate, Outlet, useLocation } from "react-router-dom";

import { LoadingIndicator } from "../components/LoadingIndicator";
import { canUseAdmin, useAuth } from "./AuthProvider";

export function RequireAuth({ admin = false }: { admin?: boolean }) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.isLoading) {
    return <LoadingIndicator label="認証状態を確認しています" />;
  }

  if (auth.meUnavailable) {
    return (
      <main className="state-page">
        <h1>Backend API Gaps</h1>
        <p>GET /api/v1/me が確認できないため、認証ガードを完了できません。</p>
      </main>
    );
  }

  if (!auth.isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (admin && !canUseAdmin(auth.user)) {
    return <Navigate to="/403" replace />;
  }

  return <Outlet />;
}
