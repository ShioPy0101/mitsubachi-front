import { execFileSync } from "node:child_process";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

function sourceCommit() {
  if (process.env.VITE_GIT_COMMIT_SHA) return process.env.VITE_GIT_COMMIT_SHA;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

export default defineConfig(({ mode }) => ({
  define: {
    __BUILD_INFO__: JSON.stringify({
      component: "frontend",
      environment: mode,
      commit: sourceCommit(),
      built_at: process.env.VITE_BUILD_TIMESTAMP || new Date().toISOString(),
    }),
  },
  plugins: [react()],
  server: {
    host: "127.0.0.1",
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
}));
