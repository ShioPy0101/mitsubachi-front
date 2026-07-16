import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

import { clearCsrfToken } from "../api/client";

afterEach(() => {
  clearCsrfToken();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
