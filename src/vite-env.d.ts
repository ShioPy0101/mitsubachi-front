/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FEATURE_DEMO_TENANT?: string;
  readonly VITE_GIT_COMMIT_SHA?: string;
  readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
