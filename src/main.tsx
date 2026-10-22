import { lazy, Suspense, StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { applyColorMode, getInitialColorMode } from "./app/colorMode";
import { featureFlags, isDemoHost } from "./features/flags";
import { App } from "./app/App";
import "./styles/global.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element was not found.");
}

applyColorMode(getInitialColorMode());

const DemoApp = lazy(() => import("./demo/DemoApp"));

createRoot(root).render(
  <StrictMode>
    {isDemoHost() ? (
      featureFlags.demoTenant ? (
        <Suspense fallback={<p role="status">デモを読み込んでいます…</p>}>
          <DemoApp />
        </Suspense>
      ) : (
        <main className="state-page">
          <h1>デモは現在利用できません</h1>
          <a href="https://mitsubachi.shiosalt.com/login">ログイン画面へ</a>
        </main>
      )
    ) : (
      <App />
    )}
  </StrictMode>,
);
