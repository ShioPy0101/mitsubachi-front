import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { authKeys } from "./api";
import { verifyEmailToken } from "./api";

export function VerifyPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const sentRef = useRef(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: verifyEmailToken,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authKeys.me });
      void navigate("/drive", { replace: true });
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
