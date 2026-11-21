import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Activity as ActivityIcon, ChevronRight, Cloud, Folder, LayoutDashboard, Layers, Loader2, RefreshCw, Settings as SettingsIcon } from "./icons";
import { inTauri, notify, rc, ready } from "./rc";
import { formatBytes } from "./lib";
import Dashboard from "./pages/Dashboard";
import Files from "./pages/Files";
import Accounts, { AddAccountHost } from "./pages/Accounts";
import Sync from "./pages/Sync";
import Activity from "./pages/Activity";
import Settings, { applySavedBandwidth } from "./pages/Settings";
import { startScheduler, useRunner } from "./runner";
import { checkForUpdate, installUpdate } from "./update";
import type { Update } from "@tauri-apps/plugin-updater";
import { tell } from "./dialogs";

export type Transfer = { name: string; size: number; bytes: number; percentage: number; speed: number; eta: number | null };
export type Stats = { bytes: number; speed: number; errors: number; lastError?: string; transfers: number; transferring?: Transfer[] };
export type PageProps = { go: (page: PageId) => void; stats?: Stats };

const PAGES = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, Page: Dashboard, group: "Menu" },
  { id: "files", label: "Files", icon: Folder, Page: Files, group: "Menu" },
  { id: "sync", label: "Sync", icon: RefreshCw, Page: Sync, group: "Menu" },
  { id: "accounts", label: "Accounts", icon: Cloud, Page: Accounts, group: "Manage" },
  { id: "activity", label: "Activity", icon: ActivityIcon, Page: Activity, group: "Manage" },
  { id: "settings", label: "Settings", icon: SettingsIcon, Page: Settings, group: "Settings" },
] as const;
export type PageId = (typeof PAGES)[number]["id"];

export default function App() {
  const [page, setPage] = useState<PageId>("dashboard");
  const go = (p: PageId) => setPage(p);
  const [engine, setEngine] = useState<{ version?: string; error?: string }>({});
  const [stats, setStats] = useState<Stats>();
  const [update, setUpdate] = useState<Update | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    ready().then((v) => { setEngine({ version: v.version }); applySavedBandwidth(); }, (e) => setEngine({ error: e.message }));
  }, []);

  useEffect(() => (engine.version ? startScheduler() : undefined), [engine.version]);
  const active = stats?.transferring?.length ?? 0;
  const status = active ? `${active} transfer${active > 1 ? "s" : ""} · ${formatBytes(stats?.speed)}/s` : "Idle";
  const { running } = useRunner();
  const batch = useRef<{ start: number; files: number; bytes: number; errors: number; sync: boolean } | undefined>(undefined);

  // Live status in the tray menu and the tray icon's hover text.
  useEffect(() => { if (inTauri && engine.version) invoke("set_tray_status", { text: status }).catch(() => {}); }, [status, engine.version]);

  // Notify when a batch of uploads/downloads/moves finishes, if it took a while (you've probably looked away).
  // Sync jobs notify on their own, so batches that included one stay quiet here.
  useEffect(() => {
    if (!stats) return;
    const syncing = Object.keys(running).length > 0;
    if (active && !batch.current) batch.current = { start: Date.now(), files: stats.transfers, bytes: stats.bytes, errors: stats.errors, sync: syncing };
    else if (active && syncing && batch.current) batch.current.sync = true;
    else if (!active && batch.current) {
      const b = batch.current;
      batch.current = undefined;
      if (b.sync || Date.now() - b.start < 10_000) return;
      const files = stats.transfers - b.files, errors = stats.errors - b.errors;
      notify(errors ? "Transfers finished with errors" : "Transfers finished",
        `${files} file${files === 1 ? "" : "s"}, ${formatBytes(stats.bytes - b.bytes)}${errors ? ` · ${errors} error${errors === 1 ? "" : "s"}` : ""}`);
    }
  }, [stats]); // eslint-disable-line react-hooks/exhaustive-deps

  // Offline or no release yet: stay quiet; Settings has a manual check that shows errors.
  useEffect(() => void checkForUpdate().then(setUpdate, () => {}), []);

  useEffect(() => {
    if (!engine.version) return;
    const t = setInterval(() => rc<Stats>("core/stats").then(setStats, () => {}), 1000);
    return () => clearInterval(t);
  }, [engine.version]);

  if (!engine.version)
    return (
      <div className="center">
        {engine.error ? (
          <div>
            <h2>The storage engine didn't start</h2>
            <p className="muted">{engine.error}</p>
          </div>
        ) : (
          <p className="muted row"><Loader2 size={16} className="spin" /> Starting…</p>
        )}
      </div>
    );

  const current = PAGES.find((p) => p.id === page)!;

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <span className="brand-mark"><Layers size={15} /></span> DriveMerge
        </div>
        {(["Menu", "Manage", "Settings"] as const).map((group) => (
          <div key={group} className="nav-group" style={group === "Settings" ? { marginTop: "auto" } : undefined}>
            <p className="nav-label">{group}</p>
            {PAGES.filter((p) => p.group === group).map(({ id, label, icon: Icon }) => (
              <button key={id} className="nav" aria-current={id === page ? "page" : undefined} onClick={() => go(id)}>
                <Icon size={16} strokeWidth={1.75} /> <span className="grow">{label}</span>
                {id === "activity" && active > 0 && <span className="nav-count">{active}</span>}
              </button>
            ))}
          </div>
        ))}
        <div className="sidebar-foot small muted">Powered by rclone {engine.version}</div>
      </nav>
      <div className="main">
        <header className="topbar">
          <nav className="crumbs" aria-label="Breadcrumb">
            <span className="muted">DriveMerge</span> <ChevronRight size={14} className="muted" /> <span aria-current="page">{current.label}</span>
          </nav>
          <div className="row">
          {update && (
            <button className="btn primary" disabled={installing} title={update.body ?? ""}
              onClick={() => { setInstalling(true); installUpdate(update).catch((e) => { setInstalling(false); tell("Update failed", String(e?.message ?? e)); }); }}>
              {installing ? <><Loader2 size={15} className="spin" /> Updating…</> : `Update to ${update.version}`}
            </button>
          )}
          <button className="btn ghost" onClick={() => go("activity")} aria-label="Open activity">
            {active ? <Loader2 size={15} className="spin" /> : <ActivityIcon size={15} />}
            {status}
          </button>
          </div>
        </header>
        <main className="content">
          <current.Page go={go} stats={stats} />
        </main>
        <AddAccountHost />
      </div>
    </div>
  );
}
