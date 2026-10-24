import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";
import { useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { authKeys, verifyEmailChange } from "./auth/api";
import { EMAIL_CHANGE_LOGIN_PATH } from "./auth/emailChangeFlow";
import { Button } from "./components/Button";

export function EmailChangeVerifyPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const submitting = useRef(false);
  const client = useQueryClient();
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: verifyEmailChange,
    onSuccess: async () => {
      // メール変更後はサーバーの旧sessionが無効になる。遅れた/meや他アカウントの
      // query結果でログイン済み表示へ戻さないよう、全queryを止めて古いデータを破棄する。
      await client.cancelQueries();
      client.removeQueries();
      client.setQueryData(authKeys.me, null);
      void navigate("/settings/email-change/verify", { replace: true });
    },
  });

  if (mutation.isSuccess) {
    return (
      <main className="state-page email-change-page" aria-live="polite">
        <CheckCircle2 size={36} aria-hidden="true" />
        <h1>メールアドレスを変更しました</h1>
        <p>変更前のメールアドレスに完了通知を送信しました。</p>
        <p>新しいメールアドレスでログインし直してください。</p>
        <Link to="/login" className="button button-primary">
          ログイン画面へ
        </Link>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="state-page email-change-page">
        <XCircle size={36} aria-hidden="true" />
        <h1>確認リンクが無効です</h1>
        <p>新しいメールアドレスに届いた確認リンクを確認してください。</p>
        <Link to={EMAIL_CHANGE_LOGIN_PATH}>再ログインして申請し直す</Link>
      </main>
    );
  }

  return (
    <main className="state-page email-change-page" aria-busy={mutation.isPending}>
      <h1>メールアドレスの変更を確定しますか？</h1>
      <p>
        新しいメールアドレスへ変更する場合は、下のボタンで確定してください。変更前のメールアドレスへ完了通知を送信します。
      </p>
      <p>変更後は新しいメールアドレスでの再ログインが必要です。</p>
      {mutation.isError ? (
        <p role="alert">
          {mutation.error instanceof Error
            ? mutation.error.message
            : "変更できませんでした。確認リンクの有効期限を確認してください。"}
        </p>
      ) : null}
      <Button
        type="button"
        loading={mutation.isPending}
        onClick={() => {
          if (submitting.current) return;
          submitting.current = true;
          mutation.mutate(token, {
            onSettled: () => {
              submitting.current = false;
            },
          });
        }}
      >
        メールアドレスの変更を確定する
      </Button>
      <Link to="/login">確定せずログイン画面へ戻る</Link>
    </main>
  );
}
