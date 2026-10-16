import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";
import { useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { approveEmailChange, authKeys } from "./auth/api";
import { EMAIL_CHANGE_LOGIN_PATH } from "./auth/emailChangeFlow";
import { Button } from "./components/Button";

export function EmailChangeApprovePage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const submitting = useRef(false);
  const client = useQueryClient();
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: approveEmailChange,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: authKeys.me });
      void navigate("/settings/email-change/approve", { replace: true });
    },
  });

  if (mutation.isSuccess) {
    return (
      <main className="state-page" aria-live="polite">
        <CheckCircle2 size={36} aria-hidden="true" />
        <h1>現在のメールアドレスで承認しました</h1>
        <p>新しいメールアドレスに確認メールを送信しました。</p>
        <p>
          新しいメール内の確認リンクを開いて、変更を確定してください。現在のメールアドレスはまだ変更されていません。
        </p>
        <Link to="/login">ログイン画面へ</Link>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="state-page">
        <XCircle size={36} aria-hidden="true" />
        <h1>承認リンクが無効です</h1>
        <p>現在のメールアドレスに届いた承認リンクを確認してください。</p>
        <Link to={EMAIL_CHANGE_LOGIN_PATH}>再ログインして申請し直す</Link>
      </main>
    );
  }

  return (
    <main className="state-page" aria-busy={mutation.isPending}>
      <h1>メールアドレス変更を承認しますか？</h1>
      <p>
        承認すると、新しいメールアドレスに確認メールを送信します。新しいメールで確認が完了するまで、現在のメールアドレスは変わりません。
      </p>
      <p>ご自身で申請した場合だけ、承認してください。</p>
      {mutation.isError ? (
        <p role="alert">
          {mutation.error instanceof Error
            ? mutation.error.message
            : "承認できませんでした。リンクの有効期限を確認してください。"}
        </p>
      ) : null}
      <Button
        type="button"
        loading={mutation.isPending}
        onClick={() => {
          // メールscannerやReactの再mountでは送信せず、明示的な一回の操作だけを受け付ける。
          if (submitting.current) return;
          submitting.current = true;
          mutation.mutate(token, {
            onSettled: () => {
              submitting.current = false;
            },
          });
        }}
      >
        変更を承認する
      </Button>
      <Link to="/login">承認せずログイン画面へ戻る</Link>
    </main>
  );
}
