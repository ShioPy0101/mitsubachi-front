/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FEATURE_DEMO_TENANT?: string;
  readonly VITE_GIT_COMMIT_SHA?: string;
  readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Vite がビルド時に固定する。画面表示時の日時・Git HEAD から再計算しない。
declare const __BUILD_INFO__: {
  component: string;
  environment: string;
  commit: string | null;
  built_at: string;
};
