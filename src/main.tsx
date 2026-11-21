import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { DialogHost } from "./dialogs";
import { applyTheme } from "./pages/Settings";
import { initJobs } from "./jobs";
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
