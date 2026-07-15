import { useQuery } from "@tanstack/react-query";
import { createContext, useContext } from "react";

import { ApiError } from "../api/errors";
import type { CurrentUser } from "../api/schemas";
import { authKeys, fetchCurrentUser } from "./api";

type AuthContextValue = {
  user: CurrentUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  meUnavailable: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const meQuery = useQuery({
    queryKey: authKeys.me,
    queryFn: fetchCurrentUser,
    retry: false,
  });

  const user = meQuery.data ?? null;
  const meUnavailable =
    meQuery.error instanceof ApiError && [404, 501].includes(meQuery.error.status);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading: meQuery.isLoading,
        isAuthenticated: Boolean(user),
        meUnavailable,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

export function canUseAdmin(user: CurrentUser | null) {
  return user?.role === "organization_admin" || user?.role === "system_admin";
}
