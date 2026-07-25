import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, LogOut, Mail, Users } from "lucide-react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";

import { authKeys, logout } from "../auth/api";
import { useAuth } from "../auth/useAuth";
import { Button } from "../components/Button";
import { ErrorState } from "../components/ErrorState";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { useToast } from "../components/ToastProvider";
import {
  acceptOrganizationInvitation,
  fetchOrganizationInvitation,
  organizationInvitationKeys,
} from "./api";

export function OrganizationInvitationPage() {
  const { token = "" } = useParams();
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const invitationQuery = useQuery({
    queryKey: organizationInvitationKeys.detail(token),
    queryFn: ({ signal }) => fetchOrganizationInvitation(token, { signal }),
    enabled: Boolean(token),
    retry: false,
  });
  const acceptMutation = useMutation({
    mutationFn: () => acceptOrganizationInvitation(token),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: authKeys.me });
      toast.show({ tone: "success", message: "組織に参加しました。" });
      void navigate(`/organization-invitations/${encodeURIComponent(token)}/joined`, {
        replace: true,
        state: { membership: result.membership },
      });
    },
  });
  const invitation = invitationQuery.data;
  const emailMismatch =
    Boolean(invitation?.email && auth.user?.email) &&
    invitation?.email?.toLowerCase() !== auth.user?.email.toLowerCase();

  if (!token) {
    return <Navigate to="/organizations/join" replace />;
  }

  if (auth.status === "checking" || invitationQuery.isLoading) {
    return <LoadingIndicator label="招待を確認しています" />;
  }

  if (invitationQuery.isError || !invitation) {
    return (
      <main className="state-page">
        <ErrorState
          title="招待を確認できません"
          message={
            invitationQuery.error instanceof Error
              ? invitationQuery.error.message
              : "招待が見つからないか、有効期限が切れています。"
          }
          onRetry={() => void invitationQuery.refetch()}
        />
        <Link to="/organizations/join">招待コードを入力する</Link>
      </main>
    );
  }

  if (auth.status === "unauthenticated") {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: { pathname: `/organization-invitations/${token}` } }}
      />
    );
  }

  if (auth.status === "error") {
    return (
      <main className="state-page">
        <ErrorState
          title="認証状態を確認できません"
          message={auth.error?.message ?? "ログイン状態の確認に失敗しました。"}
          onRetry={auth.retryAuthCheck}
        />
      </main>
    );
  }

  if (emailMismatch) {
    return (
      <InvitationShell title="アカウントが一致しません">
        <div className="notice-panel danger">
          <AlertTriangle size={20} aria-hidden="true" />
          <p>
            この招待は {invitation.email} 宛てです。現在は {auth.user?.email}
            でログインしています。
          </p>
        </div>
        <InvitationDetails invitation={invitation} currentEmail={auth.user?.email} />
        <div className="action-row">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void (async () => {
                await logout();
                await queryClient.invalidateQueries({ queryKey: authKeys.me });
                void navigate("/login", {
                  state: {
                    from: {
                      pathname: `/organization-invitations/${token}`,
                    },
                  },
                });
              })();
            }}
          >
            <LogOut size={16} aria-hidden="true" />
            別アカウントでログイン
          </Button>
          <Link className="button button-ghost" to="/organizations/join">
            キャンセル
          </Link>
        </div>
      </InvitationShell>
    );
  }

  return (
    <InvitationShell title="組織への招待">
      <InvitationDetails invitation={invitation} currentEmail={auth.user?.email} />
      {acceptMutation.isError ? (
        <div className="notice-panel danger" role="alert">
          <AlertTriangle size={20} aria-hidden="true" />
          <p>
            {acceptMutation.error instanceof Error
              ? acceptMutation.error.message
              : "組織への参加に失敗しました。"}
          </p>
        </div>
      ) : null}
      <div className="action-row">
        <Button
          type="button"
          onClick={() => acceptMutation.mutate()}
          loading={acceptMutation.isPending}
        >
          <Users size={16} aria-hidden="true" />
          この組織に参加する
        </Button>
        <Link className="button button-ghost" to="/drive">
          キャンセル
        </Link>
      </div>
    </InvitationShell>
  );
}

export function OrganizationInvitationJoinedPage() {
  const location = useLocation();
  const membership = (
    location.state as {
      membership?: { organization?: { id: number; name: string } };
    } | null
  )?.membership;
  const organization = membership?.organization;

  return (
    <main className="state-page invitation-success">
      <CheckCircle2 size={40} aria-hidden="true" />
      <h1>組織に参加しました</h1>
      <div className="action-row">
        <Link
          className="button button-primary"
          to={organization ? `/organizations/${organization.id}/drive` : "/drive"}
        >
          この組織を開く
        </Link>
        <Link className="button button-secondary" to="/settings/user">
          所属組織一覧へ
        </Link>
      </div>
    </main>
  );
}

function InvitationShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="invitation-page">
      <section className="invitation-panel" aria-labelledby="invitation-title">
        <h1 id="invitation-title">{title}</h1>
        {children}
      </section>
    </main>
  );
}

function InvitationDetails({
  invitation,
  currentEmail,
}: {
  invitation: Awaited<ReturnType<typeof fetchOrganizationInvitation>>;
  currentEmail?: string;
}) {
  return (
    <dl className="detail-list invitation-details">
      <div>
        <dt>組織名</dt>
        <dd>{invitation.organization.name}</dd>
      </div>
      <div>
        <dt>招待者</dt>
        <dd>{invitation.invited_by?.display_name ?? "未設定"}</dd>
      </div>
      <div>
        <dt>付与予定ロール</dt>
        <dd>{roleLabel(invitation.role)}</dd>
      </div>
      <div>
        <dt>招待先メールアドレス</dt>
        <dd>{invitation.email ?? "未指定"}</dd>
      </div>
      <div>
        <dt>有効期限</dt>
        <dd>{formatDateTime(invitation.expires_at)}</dd>
      </div>
      <div>
        <dt>現在ログイン中のアカウント</dt>
        <dd>
          <Mail size={14} aria-hidden="true" />
          {currentEmail ?? "未ログイン"}
        </dd>
      </div>
    </dl>
  );
}

function roleLabel(role: "member" | "organization_admin") {
  return role === "organization_admin" ? "organization_admin" : "member";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
