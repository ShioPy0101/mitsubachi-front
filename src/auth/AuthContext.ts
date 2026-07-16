import { createContext } from "react";

import type { CurrentUser } from "../api/schemas";

export type AuthStatus =
  | "checking"
  | "authenticated"
  | "unauthenticated"
  | "error";

export type AuthErrorInfo = {
  message: string;
  kind: "http" | "network" | "unknown";
  status?: number;
  url?: string;
};

export type AuthContextValue = {
  user: CurrentUser | null;
  status: AuthStatus;
  error: AuthErrorInfo | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  retryAuthCheck: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
