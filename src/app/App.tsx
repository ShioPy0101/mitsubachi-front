import {
  Navigate,
  RouterProvider,
  createBrowserRouter,
  useParams,
} from "react-router-dom";

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
import { useAuth } from "../auth/useAuth";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { ToastProvider } from "../components/ToastProvider";
import { DrivePage } from "../drive/DrivePage";
import { EmailChangeVerifyPage } from "../EmailChangeVerifyPage";
import { PublicSharePage } from "../externalShares/PublicSharePage";
import { GroupDashboardPage } from "../GroupDashboardPage";
import { JoinOrganizationPage } from "../organizationInvitations/JoinOrganizationPage";
import {
  OrganizationInvitationJoinedPage,
  OrganizationInvitationPage,
} from "../organizationInvitations/OrganizationInvitationPage";
import { UserSettingsPage } from "../UserSettingsPage";
import { AppLayout } from "./AppLayout";

const queryClient = createAppQueryClient();

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/auth/verify", element: <VerifyPage /> },
  { path: "/settings/email-change/verify", element: <EmailChangeVerifyPage /> },
  { path: "/share/:token", element: <PublicSharePage /> },
  {
    path: "/organization-invitations/:token",
    element: <OrganizationInvitationPage />,
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: "/", element: <NavigateToDrive /> },
          { path: "/organizations/:organizationId/drive", element: <DrivePage /> },
          {
            path: "/organizations/:organizationId/drive/folder/:folderId",
            element: <DrivePage />,
          },
          {
            path: "/organizations/:organizationId/trash",
            element: <DrivePage mode="trash" />,
          },
          {
            path: "/organizations/:organizationId/settings/group",
            element: <GroupDashboardPage />,
          },
          { path: "/drive", element: <DrivePage /> },
          { path: "/drive/folder/:folderId", element: <DrivePage /> },
          { path: "/trash", element: <DrivePage mode="trash" /> },
          { path: "/organizations/join", element: <JoinOrganizationPage /> },
          {
            path: "/organization-invitations/:token/joined",
            element: <OrganizationInvitationJoinedPage />,
          },
          { path: "/settings/user", element: <UserSettingsPage /> },
          { path: "/settings/group", element: <GroupDashboardPage /> },
        ],
      },
      {
        element: <RequireAuth admin />,
        children: [
          {
            element: <AdminLayout />,
            children: [
              {
                path: "/organizations/:organizationId/admin",
                element: <Navigate to="dashboard" replace />,
              },
              {
                path: "/organizations/:organizationId/admin/dashboard",
                element: <AdminDashboardPage />,
              },
              {
                path: "/organizations/:organizationId/admin/users",
                element: <AdminUsersPage />,
              },
              {
                path: "/organizations/:organizationId/admin/users/:userId/edit",
                element: <AdminUserEditPage />,
              },
              {
                path: "/organizations/:organizationId/admin/users/:userId",
                element: <AdminUserDetailPage />,
              },
              {
                path: "/organizations/:organizationId/admin/drive-items",
                element: <AdminDriveItemsPage />,
              },
              {
                path: "/organizations/:organizationId/admin/drive-items/:driveItemId",
                element: <AdminDriveItemDetailPage />,
              },
              {
                path: "/organizations/:organizationId/admin/audit-logs",
                element: <AdminAuditLogsPage />,
              },
              {
                path: "/organizations/:organizationId/admin/audit-logs/:auditLogId",
                element: <AdminAuditLogDetailPage />,
              },
              {
                path: "/organizations/:organizationId/admin/audit-events",
                element: <AdminAuditEventsPage />,
              },
              {
                path: "/organizations/:organizationId/admin/audit-events/:auditEventId",
                element: <AdminAuditEventDetailPage />,
              },
              { path: "/admin", element: <Navigate to="/system-admin" replace /> },
              { path: "/admin/*", element: <NavigateLegacyAdminPath /> },
              { path: "/system-admin", element: <Navigate to="dashboard" replace /> },
              { path: "/system-admin/dashboard", element: <AdminDashboardPage /> },
              {
                path: "/system-admin/organizations",
                element: <AdminOrganizationsPage />,
              },
              {
                path: "/system-admin/organizations/new",
                element: <AdminOrganizationNewPage />,
              },
              {
                path: "/system-admin/organizations/:organizationId/invites/new",
                element: <AdminOrganizationInviteNewPage />,
              },
              {
                path: "/system-admin/organizations/:organizationId/edit",
                element: <AdminOrganizationEditPage />,
              },
              {
                path: "/system-admin/organizations/:organizationId",
                element: <AdminOrganizationDetailPage />,
              },
              { path: "/system-admin/users", element: <AdminUsersPage /> },
              {
                path: "/system-admin/users/:userId/edit",
                element: <AdminUserEditPage />,
              },
              { path: "/system-admin/users/:userId", element: <AdminUserDetailPage /> },
              {
                path: "/system-admin/drive-items",
                element: <AdminDriveItemsPage />,
              },
              {
                path: "/system-admin/drive-items/:driveItemId",
                element: <AdminDriveItemDetailPage />,
              },
              {
                path: "/system-admin/audit-logs",
                element: <Navigate to="/system-admin/audit-events" replace />,
              },
              {
                path: "/system-admin/audit-logs/:auditLogId",
                element: <AdminAuditLogDetailPage />,
              },
              {
                path: "/system-admin/audit-events",
                element: <AdminAuditEventsPage />,
              },
              {
                path: "/system-admin/audit-events/:auditEventId",
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
  const auth = useAuth();
  const organizationId = auth.user?.memberships[0]?.organization.id;

  return (
    <Navigate
      to={organizationId ? `/organizations/${organizationId}/drive` : "/drive"}
      replace
    />
  );
}

function NavigateLegacyAdminPath() {
  const params = useParams();
  return <Navigate to={`/system-admin/${params["*"] ?? "dashboard"}`} replace />;
}

function StatePage({ title, message }: { title: string; message: string }) {
  return (
    <main className="state-page">
      <h1>{title}</h1>
      <p>{message}</p>
    </main>
  );
}
