import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation } from "react-router-dom";
import { z } from "zod";

import { ApiError } from "../api/errors";
import { Button } from "../components/Button";
import { FieldError } from "../components/FieldError";
import { useToast } from "../components/ToastProvider";
import { login, registerByInvite } from "./api";

export const AUTH_RETURN_PATH_KEY = "mitsubachi.auth.returnPath";

const authSchema = z.object({
  email: z.string().email("メールアドレスを入力してください。"),
  displayName: z.string().max(50, "表示名は50文字以内で入力してください。").optional(),
  inviteCode: z.string().optional(),
});

type AuthFormValues = {
  email: string;
  displayName?: string;
  inviteCode?: string;
};

export function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const location = useLocation();
  const toast = useToast();
  const form = useForm<AuthFormValues>({
    resolver: zodResolver(authSchema),
    defaultValues: { email: "", displayName: "", inviteCode: "" },
  });
  const mutation = useMutation({
    mutationFn: (values: AuthFormValues) =>
      mode === "login"
        ? login(values.email)
        : registerByInvite(
            values.email,
            values.inviteCode ?? "",
            values.displayName ?? "",
          ),
    onSuccess: () => {
      toast.show({
        tone: "success",
        message: "メールを送信しました。受信したリンクから続行してください。",
      });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        toast.show({
          tone: "danger",
          message:
            "この招待コードでは、すでに登録手続きが進行中です。先に送信されたメールを確認してください。",
        });
        return;
      }
      toast.show({
        tone: "danger",
        message: error instanceof Error ? error.message : "送信に失敗しました。",
      });
    },
  });
  const returnPath = invitationReturnPathFrom(location.state);

  useEffect(() => {
    if (!returnPath) return;
    localStorage.setItem(AUTH_RETURN_PATH_KEY, returnPath);
  }, [returnPath]);

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="brand-mark" aria-hidden="true">
          M
        </div>
        <h1 id="auth-title">{mode === "login" ? "ログイン" : "招待コードで登録"}</h1>
        <p>
          {returnPath
            ? "ログイン後に招待確認画面へ戻ります。"
            : "入力したメールアドレスに確認メールを送信します。"}
        </p>
        <form
          onSubmit={(event) => {
            void form.handleSubmit((values) => {
              if (mode === "register" && !values.inviteCode?.trim()) {
                form.setError("inviteCode", {
                  message: "招待コードを入力してください。",
                });
                return;
              }
              mutation.mutate(values);
            })(event);
          }}
          noValidate
          className="form-stack"
        >
          <label className="field">
            <span>メールアドレス</span>
            <input
              type="email"
              autoComplete="email"
              aria-invalid={Boolean(form.formState.errors.email)}
              {...form.register("email")}
            />
            <FieldError error={form.formState.errors.email?.message} />
          </label>
          {mode === "register" ? (
            <>
              <label className="field">
                <span>表示名</span>
                <input
                  type="text"
                  autoComplete="name"
                  aria-invalid={Boolean(form.formState.errors.displayName)}
                  {...form.register("displayName")}
                />
                <FieldError error={form.formState.errors.displayName?.message} />
              </label>
              <label className="field">
                <span>招待コード</span>
                <input
                  type="text"
                  autoComplete="one-time-code"
                  aria-invalid={Boolean(form.formState.errors.inviteCode)}
                  {...form.register("inviteCode")}
                />
                <FieldError
                  error={
                    typeof form.formState.errors.inviteCode?.message === "string"
                      ? form.formState.errors.inviteCode.message
                      : undefined
                  }
                />
              </label>
            </>
          ) : null}
          <Button type="submit" loading={mutation.isPending}>
            <Mail size={16} aria-hidden="true" />
            メールを送信
          </Button>
        </form>
        <button
          type="button"
          className="text-button"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login" ? "招待コードで登録する" : "ログインへ戻る"}
        </button>
        <Link to="/drive" className="muted-link">
          ログイン済みの場合はドライブへ
        </Link>
        <Link to="/privacy" className="muted-link">
          プライバシーポリシー
        </Link>
      </section>
    </main>
  );
}

function invitationReturnPathFrom(state: unknown) {
  const from = (state as { from?: { pathname?: unknown } } | null)?.from;
  return typeof from?.pathname === "string" &&
    from.pathname.startsWith("/organization-invitations/")
    ? from.pathname
    : null;
}
