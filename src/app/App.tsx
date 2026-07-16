import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";

import { QueryClientProvider } from "@tanstack/react-query";

import { createAppQueryClient } from "../api/queryClient";
import {
  AdminAuditLogsPage,
  AdminDashboard,
  AdminDriveItemsPage,
  AdminOrganizationsPage,
  AdminSystemPage,
  AdminUsersPage,
} from "../admin/AdminPages";
import { AuthProvider } from "../auth/AuthProvider";
import { LoginPage } from "../auth/LoginPage";
import { RequireAuth } from "../auth/RequireAuth";
import { VerifyPage } from "../auth/VerifyPage";
import { ToastProvider } from "../components/ToastProvider";
import { DrivePage } from "../drive/DrivePage";
import { AppLayout } from "./AppLayout";

const queryClient = createAppQueryClient();

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/auth/verify", element: <VerifyPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: "/", element: <NavigateToDrive /> },
          { path: "/drive", element: <DrivePage /> },
          { path: "/drive/folder/:folderId", element: <DrivePage /> },
          { path: "/trash", element: <DrivePage mode="trash" /> },
          {
            element: <RequireAuth admin />,
            children: [
              { path: "/admin", element: <AdminDashboard /> },
              {
                element: <RequireAuth system />,
                children: [{ path: "/admin/system", element: <AdminSystemPage /> }],
              },
              { path: "/admin/organizations", element: <AdminOrganizationsPage /> },
              {
                path: "/admin/organizations/:organizationId",
                element: <AdminOrganizationsPage />,
              },
              { path: "/admin/users", element: <AdminUsersPage /> },
              { path: "/admin/users/:userId", element: <AdminUsersPage /> },
              { path: "/admin/drive-items", element: <AdminDriveItemsPage /> },
              {
                path: "/admin/drive-items/:driveItemId",
                element: <AdminDriveItemsPage />,
              },
              { path: "/admin/audit-logs", element: <AdminAuditLogsPage /> },
              {
                path: "/admin/audit-logs/:auditLogId",
                element: <AdminAuditLogsPage />,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    path: "/403",
    element: <StatePage title="403" message="この画面を利用する権限がありません。" />,
  },
  { path: "*", element: <StatePage title="404" message="ページが見つかりません。" /> },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

function NavigateToDrive() {
  return <Navigate to="/drive" replace />;
}

function StatePage({ title, message }: { title: string; message: string }) {
  return (
    <main className="state-page">
      <h1>{title}</h1>
      <p>{message}</p>
    </main>
  );
}
