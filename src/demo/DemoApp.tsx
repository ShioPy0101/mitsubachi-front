import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  Navigate,
  RouterProvider,
  createBrowserRouter,
  useLoaderData,
} from "react-router-dom";

import { createAppQueryClient } from "../api/queryClient";
import { Button } from "../components/Button";
import { StatusBadge } from "../components/StatusBadge";
import { useState } from "react";
import { requestDemoEmail } from "./api";
import { DemoLoginEmail } from "./DemoLoginEmail";
import { DemoDrivePage } from "./DemoDrivePage";
import { verifyDemoLoginLink } from "./session";

const router = createBrowserRouter([
  { path: "/login", element: <DemoEntryPage /> },
  { path: "/demo/drive", element: <DemoDrivePage /> },
  {
    path: "/demo/verify",
    loader: ({ request }) =>
      verifyDemoLoginLink(new URL(request.url).searchParams.get("token")),
    element: <DemoVerification />,
  },
  { path: "*", element: <Navigate to="/login" replace /> },
]);
const queryClient = createAppQueryClient();

// デモには通常の AuthProvider・管理画面・実テナント向けルートを組み込まない。
export default function DemoApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

export function DemoEntryPage() {
  const [open, setOpen] = useState(true);
  const query = useQuery({
    queryKey: ["demo", "email"],
    queryFn: requestDemoEmail,
    retry: false,
    gcTime: 0,
    staleTime: Infinity,
  });
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <StatusBadge tone="warning">demo</StatusBadge>
        <h1>デモテナントにログイン</h1>
        <p>認証メール内のリンクからデモ画面へ進んでください。</p>
        {query.isPending && <p role="status">認証メールを準備しています…</p>}
        {query.error && <p role="alert">{query.error.message}</p>}
        <Button
          disabled={query.isPending}
          onClick={() => {
            if (query.error) void query.refetch();
            setOpen(true);
          }}
        >
          認証メールを表示
        </Button>
        <a href="https://mitsubachi.shiosalt.com/login">通常のログイン画面へ</a>
      </section>
      <DemoLoginEmail
        email={open ? (query.data ?? null) : null}
        onClose={() => setOpen(false)}
      />
    </main>
  );
}

// loader で消費し、StrictMode の再描画でリンクを二重検証しない。
function DemoVerification() {
  const verified = useLoaderData<boolean>();
  return verified ? (
    <Navigate to="/demo/drive" replace />
  ) : (
    <main className="state-page">
      <h1>デモ用リンクが無効です</h1>
      <p>有効期限切れ、または使用済みです。ログイン画面から再発行してください。</p>
      <a href="/login">ログイン画面へ</a>
    </main>
  );
}
