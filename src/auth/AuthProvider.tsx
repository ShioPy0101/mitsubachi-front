import { useQuery } from "@tanstack/react-query";

import { ApiError, ApiNetworkError } from "../api/errors";
import { authKeys, fetchCurrentUser } from "./api";
import { AuthContext, type AuthErrorInfo, type AuthStatus } from "./AuthContext";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const meQuery = useQuery({
    queryKey: authKeys.me,
    queryFn: ({ signal }) => fetchCurrentUser({ signal }),
    retry: false,
    staleTime: 30_000,
  });

  const user = meQuery.data ?? null;
  const authError = toAuthErrorInfo(meQuery.error);
  const status: AuthStatus = meQuery.isLoading
    ? "checking"
    : user
      ? "authenticated"
      : authError?.status === 401
        ? "unauthenticated"
        : authError
          ? "error"
          : "unauthenticated";

  return (
    <AuthContext.Provider
      value={{
        user,
        status,
        error: authError?.status === 401 ? null : authError,
        isLoading: status === "checking",
        isAuthenticated: status === "authenticated",
        retryAuthCheck: () => void meQuery.refetch(),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function toAuthErrorInfo(error: unknown): AuthErrorInfo | null {
  if (!error) return null;

  if (error instanceof ApiNetworkError) {
    return {
      message: error.message,
      kind: "network",
      url: error.url,
    };
  }

  if (error instanceof ApiError) {
    return {
      message: error.message,
      kind: "http",
      status: error.status,
      url: error.url,
    };
  }

  return {
    message:
      error instanceof Error ? error.message : "認証状態を確認できませんでした。",
    kind: "unknown",
  };
}
