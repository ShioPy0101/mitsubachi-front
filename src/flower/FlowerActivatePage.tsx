import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, KeyRound, ShieldCheck } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { ApiError } from "../api/errors";
import { Button } from "../components/Button";
import { ErrorState } from "../components/ErrorState";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { useToast } from "../components/ToastProvider";
import {
  approveFlowerDeviceAuthorization,
  fetchFlowerActivation,
  flowerKeys,
} from "./api";

export function FlowerActivatePage() {
  const [searchParams] = useSearchParams();
  const userCode = searchParams.get("user_code")?.trim() ?? "";
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const organizationFieldId = useId();
  const toast = useToast();

  const activationQuery = useQuery({
    queryKey: flowerKeys.activation(userCode),
    queryFn: ({ signal }) => fetchFlowerActivation(userCode, { signal }),
    enabled: Boolean(userCode),
    retry: false,
  });

  const organizationId =
    selectedOrganizationId || activationQuery.data?.organizations[0]?.id || "";

  const selectedOrganization = useMemo(
    () =>
      activationQuery.data?.organizations.find(
        (organization) => organization.id === organizationId,
      ) ?? null,
    [activationQuery.data, organizationId],
  );

  const approveMutation = useMutation({
    mutationFn: () =>
      approveFlowerDeviceAuthorization({
        userCode,
        organizationId,
      }),
    onSuccess: () => {
      toast.show({
        tone: "success",
        message: "Flower連携を許可しました。",
      });
    },
    onError: (error) => {
      toast.show({
        tone: "danger",
        message: flowerErrorMessage(error),
      });
    },
  });

  if (!userCode) {
    return (
      <FlowerState
        title="承認コードがありません"
        message="After Effectsに表示されたリンクをもう一度開いてください。"
      />
    );
  }

  if (approveMutation.isSuccess) {
    return (
      <FlowerState
        title="Flower連携を許可しました"
        message="この画面を閉じて、After Effectsへ戻ってください。"
        success
      />
    );
  }

  if (activationQuery.isLoading) {
    return (
      <main className="flower-activate-page">
        <section className="flower-activate-panel" aria-labelledby="flower-title">
          <LoadingIndicator label="Flower連携情報を確認しています" />
        </section>
      </main>
    );
  }

  if (activationQuery.isError) {
    return (
      <main className="flower-activate-page">
        <section className="flower-activate-panel" aria-labelledby="flower-error-title">
          <ErrorState
            title="Flower連携情報を確認できません"
            message={flowerErrorMessage(activationQuery.error)}
            onRetry={() => void activationQuery.refetch()}
          />
        </section>
      </main>
    );
  }

  const activation = activationQuery.data;

  if (!activation || activation.organizations.length === 0) {
    return (
      <FlowerState
        title="連携できる組織がありません"
        message="このアカウントで利用できる組織が見つかりませんでした。管理者へ確認してください。"
      />
    );
  }

  return (
    <main className="flower-activate-page">
      <section className="flower-activate-panel" aria-labelledby="flower-title">
        <div className="flower-activate-mark" aria-hidden="true">
          <ShieldCheck size={22} />
        </div>
        <div className="flower-activate-heading">
          <p>外部アプリ連携</p>
          <h1 id="flower-title">Flower連携を許可</h1>
        </div>

        <div className="flower-code-block">
          <span>ユーザーコード</span>
          <strong>
            <KeyRound size={18} aria-hidden="true" />
            {activation.user_code}
          </strong>
        </div>

        <form
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (!organizationId) return;
            approveMutation.mutate();
          }}
        >
          <label className="field" htmlFor={organizationFieldId}>
            <span>連携する組織</span>
            <select
              id={organizationFieldId}
              value={organizationId}
              onChange={(event) => setSelectedOrganizationId(event.target.value)}
              disabled={approveMutation.isPending}
            >
              {activation.organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flower-activate-summary" aria-live="polite">
            <span>
              許可後、Flowerは選択した組織の画像・動画ファイルを読み取れます。
            </span>
            {selectedOrganization ? <strong>{selectedOrganization.name}</strong> : null}
          </div>

          {approveMutation.isError ? (
            <p className="form-message" role="alert">
              {flowerErrorMessage(approveMutation.error)}
            </p>
          ) : null}

          <div className="flower-activate-actions">
            <Button
              type="submit"
              loading={approveMutation.isPending}
              disabled={!organizationId}
            >
              <CheckCircle2 size={16} aria-hidden="true" />
              Flower連携を許可
            </Button>
            <Link className="button button-secondary" to="/drive">
              ドライブへ戻る
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}

function FlowerState({
  title,
  message,
  success = false,
}: {
  title: string;
  message: string;
  success?: boolean;
}) {
  return (
    <main className="flower-activate-page">
      <section
        className="flower-activate-panel flower-state"
        aria-labelledby="flower-state-title"
      >
        {success ? (
          <CheckCircle2 className="flower-state-icon" size={40} aria-hidden="true" />
        ) : null}
        <h1 id="flower-state-title">{title}</h1>
        <p>{message}</p>
        {!success ? (
          <Link className="button button-secondary" to="/drive">
            ドライブへ戻る
          </Link>
        ) : null}
      </section>
    </main>
  );
}

function flowerErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "ログインが必要です。ログイン後にもう一度承認リンクを開いてください。";
    }
    if (error.code === "expired_token") {
      return "承認コードの期限が切れています。After Effectsで新しいコードを発行してください。";
    }
    if (error.code === "access_denied") {
      return "この連携は拒否済み、または選択した組織では許可できません。";
    }
    if (error.code === "not_found" || error.code === "invalid_grant") {
      return "承認コードが無効か、すでに処理済みです。After Effectsの表示を確認してください。";
    }
    if (error.code === "invalid_request") {
      return "承認リクエストの内容を確認できません。After Effectsからやり直してください。";
    }
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Flower連携の処理に失敗しました。時間をおいて再試行してください。";
}
