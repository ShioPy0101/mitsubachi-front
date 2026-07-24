import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, RotateCw, Save, UserRound, XCircle } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

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
      key={`${user.id}:${user.email}:${user.display_name ?? ""}:${user.pending_email ?? ""}`}
      user={user}
    />
  );
}

function UserSettingsForm({ user }: { user: CurrentUser }) {
  const queryClient = useQueryClient();
  const toast = useToast();
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authKeys.me });
      setEmail("");
      toast.show({ tone: "success", message: "確認メールを送信しました。" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: cancelEmailChange,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authKeys.me });
      toast.show({
        tone: "success",
        message: "メールアドレス変更申請を取り消しました。",
      });
    },
  });

  const pendingEmail = user.pending_email ?? null;
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
    if (!nextEmail) return;
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
              <FieldError error={displayNameError ?? profileError} />
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
              <p>確認リンクを開くまで現在のメールアドレスは変わりません。</p>
            </div>
          </div>

          <dl className="settings-detail-list">
            <div>
              <dt>現在のメールアドレス</dt>
              <dd>{user.email}</dd>
            </div>
            {pendingEmail ? (
              <div>
                <dt>変更予定のメールアドレス</dt>
                <dd>
                  <span>{pendingEmail}</span>
                  <span className="status-badge status-badge-warning">確認待ち</span>
                </dd>
              </div>
            ) : null}
          </dl>

          {pendingEmail ? (
            <div className="pending-email-box" role="status">
              <p>{pendingEmail} に確認メールを送信しました。</p>
              <p>メール内のリンクを開くまで変更は確定しません。</p>
              <div className="settings-actions">
                <Button
                  type="button"
                  variant="secondary"
                  loading={emailMutation.isPending}
                  onClick={() => emailMutation.mutate(pendingEmail)}
                >
                  <RotateCw size={16} aria-hidden="true" />
                  再送
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
            </div>
          ) : null}

          <form className="form-stack" onSubmit={handleEmailSubmit}>
            <label className="field">
              <span>新しいメールアドレス</span>
              <input
                type="email"
                value={email}
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={Boolean(emailError)}
              />
              <FieldError error={emailError} />
            </label>
            <div className="settings-actions">
              <Button
                type="submit"
                loading={emailMutation.isPending}
                disabled={!email.trim()}
              >
                <Mail size={16} aria-hidden="true" />
                確認メールを送信
              </Button>
            </div>
          </form>
        </section>
      </div>
    </section>
  );
}
