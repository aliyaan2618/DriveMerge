import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { DialogHost } from "./dialogs";
import { applyTheme } from "./pages/Settings";
import { initJobs } from "./jobs";
// Bundled fonts (OFL): Geist for text, Geist Mono for code, Plus Jakarta Sans for numbers.
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@fontsource-variable/plus-jakarta-sans";
import "./styles.css";

applyTheme();
// Render even if the jobs file can't be read; the Sync page then starts empty.
initJobs().catch((e) => console.error("Couldn't load sync jobs", e)).finally(() =>
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    <DialogHost />
    </React.StrictMode>,
  ),
);
