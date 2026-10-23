import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { applyColorMode, getInitialColorMode } from "./app/colorMode";
import { App } from "./app/App";
import "./styles/global.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element was not found.");
}

applyColorMode(getInitialColorMode());

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
