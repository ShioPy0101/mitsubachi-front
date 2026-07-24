import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { authKeys, verifyEmailChange } from "./auth/api";

export function EmailChangeVerifyPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const sentRef = useRef(false);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: verifyEmailChange,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authKeys.me });
    },
  });

  useEffect(() => {
    if (!token || sentRef.current) return;
    sentRef.current = true;
    mutation.mutate(token);
  }, [mutation, token]);

  if (!token) {
    return (
      <main className="state-page">
        <XCircle size={36} aria-hidden="true" />
        <h1>確認リンクが無効です</h1>
        <p>メール内のリンクをもう一度確認してください。</p>
        <Link to="/settings/user">ユーザー情報へ戻る</Link>
      </main>
    );
  }

  if (mutation.isSuccess) {
    return (
      <main className="state-page">
        <CheckCircle2 size={36} aria-hidden="true" />
        <h1>メールアドレスを変更しました</h1>
        <p>次回以降は新しいメールアドレスでログインできます。</p>
        <Link to="/login">ログイン画面へ</Link>
      </main>
    );
  }

  return (
    <main className="state-page" aria-busy={mutation.isPending}>
      {mutation.isError ? (
        <>
          <XCircle size={36} aria-hidden="true" />
          <h1>メールアドレスを変更できませんでした</h1>
          <p>
            {mutation.error instanceof Error
              ? mutation.error.message
              : "確認リンクを確認できませんでした。"}
          </p>
          <Link to="/settings/user">ユーザー情報へ戻る</Link>
        </>
      ) : (
        <>
          <h1>メールアドレス変更を確認しています</h1>
          <p>確認が終わるまでこの画面でお待ちください。</p>
        </>
      )}
    </main>
  );
}
