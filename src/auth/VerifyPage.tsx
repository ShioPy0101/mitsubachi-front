import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { authKeys, fetchCurrentUser, verifyEmailToken } from "./api";
import { AUTH_RETURN_PATH_KEY } from "./LoginPage";

export function VerifyPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const sentRef = useRef(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (rawToken: string) => {
      // 未ログイン時の初回 /me がmagic link検証後に401を返すと、作成済みsessionを
      // unauthenticated状態で上書きするため、検証前に古い認証確認を確実に止める。
      await queryClient.cancelQueries({ queryKey: authKeys.me });
      await verifyEmailToken(rawToken);

      // 新しいsessionでの /me 成功を確認してから保護画面へ進み、通信順序によって
      // 「セッション期限切れ」が表示される競合を防ぐ。
      return queryClient.fetchQuery({
        queryKey: authKeys.me,
        queryFn: ({ signal }) => fetchCurrentUser({ signal }),
        staleTime: 0,
      });
    },
    onSuccess: () => {
      const returnPath = localStorage.getItem(AUTH_RETURN_PATH_KEY);
      if (returnPath) {
        localStorage.removeItem(AUTH_RETURN_PATH_KEY);
      }
      void navigate(returnPath ?? "/drive", { replace: true });
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
        <h1>検証リンクが無効です</h1>
        <p>メール内のリンクをもう一度確認してください。</p>
        <Link to="/login">ログインリンクを再発行する</Link>
      </main>
    );
  }

  return (
    <main className="state-page" aria-busy={mutation.isPending}>
      <h1>メールリンクを確認しています</h1>
      {mutation.isError ? (
        <>
          <p>リンクを確認できませんでした。期限切れの可能性があります。</p>
          <Link to="/login">ログインリンクを再発行する</Link>
        </>
      ) : (
        <p>確認が終わるまでこの画面でお待ちください。</p>
      )}
    </main>
  );
}
