import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";

import { QueryClientProvider } from "@tanstack/react-query";

import { createAppQueryClient } from "../api/queryClient";
import { AdminAuditEventDetailPage } from "../admin/audit-events/AdminAuditEventDetailPage";
import { AdminAuditEventsPage } from "../admin/audit-events/AdminAuditEventsPage";
import { AdminAuditLogDetailPage } from "../admin/audit-logs/AdminAuditLogDetailPage";
import { AdminAuditLogsPage } from "../admin/audit-logs/AdminAuditLogsPage";
import { AdminLayout } from "../admin/components/AdminScaffold";
import { AdminDashboardPage } from "../admin/dashboard/AdminDashboardPage";
import { AdminDriveItemDetailPage } from "../admin/drive-items/AdminDriveItemDetailPage";
import { AdminDriveItemsPage } from "../admin/drive-items/AdminDriveItemsPage";
import { AdminOrganizationDetailPage } from "../admin/organizations/AdminOrganizationDetailPage";
import { AdminOrganizationEditPage } from "../admin/organizations/AdminOrganizationEditPage";
import { AdminOrganizationInviteNewPage } from "../admin/organizations/AdminOrganizationInviteNewPage";
import { AdminOrganizationNewPage } from "../admin/organizations/AdminOrganizationNewPage";
import { AdminOrganizationsPage } from "../admin/organizations/AdminOrganizationsPage";
import { AdminUserDetailPage } from "../admin/users/AdminUserDetailPage";
import { AdminUserEditPage } from "../admin/users/AdminUserEditPage";
import { AdminUsersPage } from "../admin/users/AdminUsersPage";
import { AuthProvider } from "../auth/AuthProvider";
import { LoginPage } from "../auth/LoginPage";
import { RequireAuth } from "../auth/RequireAuth";
import { VerifyPage } from "../auth/VerifyPage";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { ToastProvider } from "../components/ToastProvider";
import { DrivePage } from "../drive/DrivePage";
import { PublicSharePage } from "../externalShares/PublicSharePage";
import { GroupDashboardPage } from "../GroupDashboardPage";
import { AppLayout } from "./AppLayout";

const queryClient = createAppQueryClient();

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/auth/verify", element: <VerifyPage /> },
  { path: "/share/:token", element: <PublicSharePage /> },
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
          { path: "/settings/group", element: <GroupDashboardPage /> },
        ],
      },
      {
        element: <RequireAuth admin />,
        children: [
          {
            element: <AdminLayout />,
            children: [
              { path: "/admin", element: <Navigate to="/admin/dashboard" replace /> },
              {
                path: "/admin/system",
                element: <Navigate to="/admin/dashboard" replace />,
              },
              { path: "/admin/dashboard", element: <AdminDashboardPage /> },
              { path: "/admin/organizations", element: <AdminOrganizationsPage /> },
              {
                element: <RequireAuth allowedRoles={["system_admin"]} />,
                children: [
                  {
                    path: "/admin/organizations/new",
                    element: <AdminOrganizationNewPage />,
                  },
                ],
              },
              {
                path: "/admin/organizations/:organizationId/invites/new",
                element: <AdminOrganizationInviteNewPage />,
              },
              {
                path: "/admin/organizations/:organizationId/edit",
                element: <AdminOrganizationEditPage />,
              },
              {
                path: "/admin/organizations/:organizationId",
                element: <AdminOrganizationDetailPage />,
              },
              { path: "/admin/users", element: <AdminUsersPage /> },
              { path: "/admin/users/:userId/edit", element: <AdminUserEditPage /> },
              { path: "/admin/users/:userId", element: <AdminUserDetailPage /> },
              { path: "/admin/drive-items", element: <AdminDriveItemsPage /> },
              {
                path: "/admin/drive-items/:driveItemId",
                element: <AdminDriveItemDetailPage />,
              },
              { path: "/admin/audit-logs", element: <AdminAuditLogsPage /> },
              {
                path: "/admin/audit-logs/:auditLogId",
                element: <AdminAuditLogDetailPage />,
              },
              { path: "/admin/audit-events", element: <AdminAuditEventsPage /> },
              {
                path: "/admin/audit-events/:auditEventId",
                element: <AdminAuditEventDetailPage />,
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
          <ErrorBoundary>
            <RouterProvider router={router} />
          </ErrorBoundary>
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
