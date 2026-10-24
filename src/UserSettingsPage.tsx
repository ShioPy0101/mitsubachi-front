import { useIsFetching, useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, RotateCw, Save, UserRound, XCircle } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { ApiError } from "./api/errors";
import {
  EMAIL_CHANGE_LOGIN_PATH,
  EMAIL_CHANGE_REAUTHENTICATION_TTL,
  hasRecentEmailChangeReauthentication,
  type EmailChangeReauthentication,
} from "./auth/emailChangeFlow";

import type { CurrentUser } from "./api/schemas";
import {
  authKeys,
  cancelEmailChange,
  requestEmailChange,
  updateCurrentUser,
} from "./auth/api";
import { useAuth } from "./auth/useAuth";
import { Button } from "./components/Button";
import { FieldError } from "./components/FieldError";
import { useToast } from "./components/ToastProvider";

const DISPLAY_NAME_MAX_LENGTH = 100;

export function UserSettingsPage() {
  const auth = useAuth();
  const user = auth.user;

  if (!user) return null;

  return (
    <UserSettingsForm
      key={`${user.id}:${user.display_name ?? ""}:${user.email_change_stage ?? ""}`}
      user={user}
    />
  );
}

function UserSettingsForm({ user }: { user: CurrentUser }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const refreshing = useIsFetching({ queryKey: authKeys.me }) > 0;
  const [requiresReauthentication, setRequiresReauthentication] = useState(false);
  const reauthenticated =
    !requiresReauthentication &&
    hasRecentEmailChangeReauthentication(location.state, user.id);
  useEffect(() => {
    if (!hasRecentEmailChangeReauthentication(location.state, user.id)) return;
    const state = location.state as EmailChangeReauthentication;
    const remaining =
      EMAIL_CHANGE_REAUTHENTICATION_TTL -
      (Date.now() - state.emailChangeReauthenticatedAt);
    const timer = window.setTimeout(() => setRequiresReauthentication(true), remaining);
    return () => window.clearTimeout(timer);
  }, [location.state, user.id]);
  const [displayName, setDisplayName] = useState(user.display_name ?? "");
  const [email, setEmail] = useState("");

  const normalizedDisplayName = displayName.trim();
  const displayNameChanged = normalizedDisplayName !== (user.display_name ?? "");
  const displayNameError = useMemo(() => {
    if (!displayNameChanged) return undefined;
    if (!normalizedDisplayName) return "表示名を入力してください。";
    if (normalizedDisplayName.length > DISPLAY_NAME_MAX_LENGTH) {
      return `表示名は${DISPLAY_NAME_MAX_LENGTH}文字以内で入力してください。`;
    }
    return undefined;
  }, [displayNameChanged, normalizedDisplayName]);

  const profileMutation = useMutation({
    mutationFn: () => updateCurrentUser({ displayName: normalizedDisplayName }),
    onSuccess: (updatedUser) => {
      queryClient.setQueryData<CurrentUser>(authKeys.me, updatedUser);
      toast.show({ tone: "success", message: "表示名を保存しました。" });
    },
  });

  const emailMutation = useMutation({
    mutationFn: (nextEmail: string) => requestEmailChange(nextEmail),
    onSuccess: async (response) => {
      setEmail("");
      setRequiresReauthentication(true);
      queryClient.setQueryData<CurrentUser>(authKeys.me, {
        ...user,
        pending_email: null,
        email_change_stage:
          response.email_change_stage ?? "awaiting_old_email_approval",
      });
      await queryClient.invalidateQueries({ queryKey: authKeys.me });
      toast.show({
        tone: "success",
        message: "現在のメールアドレスに変更承認メールを送信しました。",
      });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "reauthentication_required") {
        void navigate(EMAIL_CHANGE_LOGIN_PATH, { replace: true });
      }
    },
  });

  const cancelMutation = useMutation({
    mutationFn: cancelEmailChange,
    onSuccess: async () => {
      setRequiresReauthentication(true);
      queryClient.setQueryData<CurrentUser>(authKeys.me, {
        ...user,
        pending_email: null,
        email_change_stage: null,
      });
      await queryClient.invalidateQueries({ queryKey: authKeys.me });
      toast.show({
        tone: "success",
        message: "メールアドレス変更申請を取り消しました。",
      });
    },
  });

  const stage =
    user.email_change_stage ??
    (user.pending_email ? "awaiting_new_email_confirmation" : null);
  const cancelError =
    cancelMutation.error instanceof Error ? cancelMutation.error.message : undefined;
  const emailError =
    emailMutation.error instanceof Error ? emailMutation.error.message : undefined;
  const profileError =
    profileMutation.error instanceof Error ? profileMutation.error.message : undefined;

  function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!displayNameChanged || displayNameError) return;
    profileMutation.mutate();
  }

  function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextEmail = email.trim();
    if (!nextEmail || emailMutation.isPending) return;
    if (
      !hasRecentEmailChangeReauthentication(location.state, user.id) ||
      requiresReauthentication
    ) {
      void navigate(EMAIL_CHANGE_LOGIN_PATH, { replace: true });
      return;
    }
    emailMutation.mutate(nextEmail);
  }

  return (
    <section className="user-settings" aria-labelledby="user-settings-title">
      <div className="page-header">
        <p className="breadcrumbs">設定 / ユーザー情報</p>
        <h1 id="user-settings-title">ユーザー情報</h1>
      </div>

      <div className="settings-grid">
        <section className="settings-panel" aria-labelledby="display-name-title">
          <div className="settings-panel-header">
            <UserRound size={20} aria-hidden="true" />
            <div>
              <h2 id="display-name-title">表示名</h2>
              <p>ファイル一覧やメンバー表示に使用されます。</p>
            </div>
          </div>

          <form className="form-stack" onSubmit={handleProfileSubmit}>
            <label className="field">
              <span>表示名</span>
              <input
                value={displayName}
                maxLength={DISPLAY_NAME_MAX_LENGTH + 1}
                onChange={(event) => setDisplayName(event.target.value)}
                aria-invalid={Boolean(displayNameError || profileError)}
                aria-describedby="display-name-error"
              />
              <span className="field-hint">
                {normalizedDisplayName.length}/{DISPLAY_NAME_MAX_LENGTH}
              </span>
              <div id="display-name-error">
                <FieldError error={displayNameError ?? profileError} />
              </div>
            </label>

            <div className="settings-actions">
              <Button
                type="submit"
                loading={profileMutation.isPending}
                disabled={!displayNameChanged || Boolean(displayNameError)}
              >
                <Save size={16} aria-hidden="true" />
                保存
              </Button>
            </div>
          </form>
        </section>

        <section className="settings-panel" aria-labelledby="email-title">
          <div className="settings-panel-header">
            <Mail size={20} aria-hidden="true" />
            <div>
              <h2 id="email-title">メールアドレス</h2>
              <p>現在のメールで承認し、新しいメールの確認が完了すると変更されます。</p>
            </div>
          </div>

          <p className="field-hint">現在のメールアドレスは表示していません。</p>
          {stage ? (
            <div className="pending-email-box" role="status">
              <h3>
                {stage === "awaiting_old_email_approval"
                  ? "現在のメールアドレスで承認待ち"
                  : "新しいメールアドレスで確認待ち"}
              </h3>
              <p>
                {stage === "awaiting_old_email_approval"
                  ? "現在のメールに届いた承認リンクを開いてください。承認後、新しいメールアドレスに確認メールが届きます。"
                  : "新しいメールに届いた確認リンクを開くと、メールアドレスの変更が完了します。"}
              </p>
              <p>
                メールが見つからない場合は、申請を取り消して再ログイン後に申請し直してください。
              </p>
              <div className="settings-actions">
                <Button
                  type="button"
                  variant="secondary"
                  loading={refreshing}
                  onClick={() => {
                    void queryClient.invalidateQueries({ queryKey: authKeys.me });
                  }}
                >
                  <RotateCw size={16} aria-hidden="true" />
                  状況を更新
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  loading={cancelMutation.isPending}
                  onClick={() => cancelMutation.mutate()}
                >
                  <XCircle size={16} aria-hidden="true" />
                  申請取消
                </Button>
              </div>
              <FieldError error={cancelError} />
            </div>
          ) : reauthenticated ? (
            <form className="form-stack" onSubmit={handleEmailSubmit}>
              <p id="email-change-help">
                再ログインを確認しました。5分以内に新しいメールアドレスを入力してください。最初に現在のメールへ変更承認メールを送信します。
              </p>
              <label className="field">
                <span>新しいメールアドレス</span>
                <input
                  type="email"
                  value={email}
                  autoComplete="email"
                  onChange={(event) => setEmail(event.target.value)}
                  aria-invalid={Boolean(emailError)}
                  aria-describedby="email-change-help email-change-error"
                  required
                />
              </label>
              <div id="email-change-error">
                <FieldError error={emailError} />
              </div>
              <div className="settings-actions">
                <Button
                  type="submit"
                  loading={emailMutation.isPending}
                  disabled={!email.trim()}
                >
                  <Mail size={16} aria-hidden="true" />
                  変更承認メールを送信
                </Button>
              </div>
            </form>
          ) : (
            <div className="form-stack">
              <p>
                メールアドレスを変更するには、現在のメールアドレスで再ログインしてください。
              </p>
              <Link to={EMAIL_CHANGE_LOGIN_PATH} className="button button-primary">
                再ログインして変更する
              </Link>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
