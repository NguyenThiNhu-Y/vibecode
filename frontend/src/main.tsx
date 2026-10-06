import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { previewBasePath } from "./api";
import "@fontsource-variable/inter"; // variable font: every weight, Vietnamese subset included
import "./index.css";
import { applyTheme, storedTheme } from "./theme";

applyTheme(storedTheme()); // before first paint: no flash of the wrong theme

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={previewBasePath()}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
