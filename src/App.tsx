import { useEffect, useState } from "react";
import { Activity as ActivityIcon, Cloud, Folder, LayoutDashboard, Layers, Loader2, RefreshCw, Settings as SettingsIcon } from "lucide-react";
import { rc, ready } from "./rc";
import { formatBytes } from "./lib";
import Dashboard from "./pages/Dashboard";
import Files from "./pages/Files";
import Accounts from "./pages/Accounts";
import Sync from "./pages/Sync";
import Activity from "./pages/Activity";
import Settings, { applySavedBandwidth } from "./pages/Settings";
import { startScheduler } from "./runner";
import { checkForUpdate, installUpdate } from "./update";
import type { Update } from "@tauri-apps/plugin-updater";

export type Transfer = { name: string; size: number; bytes: number; percentage: number; speed: number; eta: number | null };
export type Stats = { bytes: number; speed: number; errors: number; lastError?: string; transfers: number; transferring?: Transfer[] };
/** `addProvider` opens Accounts with the Add dialog on that service (from the Dashboard's free-storage list). */
export type PageProps = { go: (page: PageId, addProvider?: string) => void; stats?: Stats; addProvider?: string };

const PAGES = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, Page: Dashboard },
  { id: "files", label: "Files", icon: Folder, Page: Files },
  { id: "sync", label: "Sync", icon: RefreshCw, Page: Sync },
  { id: "accounts", label: "Accounts", icon: Cloud, Page: Accounts },
  { id: "activity", label: "Activity", icon: ActivityIcon, Page: Activity },
  { id: "settings", label: "Settings", icon: SettingsIcon, Page: Settings },
] as const;
export type PageId = (typeof PAGES)[number]["id"];

export default function App() {
  const [page, setPage] = useState<PageId>("dashboard");
  const [addProvider, setAddProvider] = useState<string>();
  const go = (p: PageId, provider?: string) => { setAddProvider(provider); setPage(p); };
  const [engine, setEngine] = useState<{ version?: string; error?: string }>({});
  const [stats, setStats] = useState<Stats>();
  const [update, setUpdate] = useState<Update | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    ready().then((v) => { setEngine({ version: v.version }); applySavedBandwidth(); }, (e) => setEngine({ error: e.message }));
  }, []);

  useEffect(() => (engine.version ? startScheduler() : undefined), [engine.version]);
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
  const active = stats?.transferring?.length ?? 0;

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <span className="brand-mark"><Layers size={15} /></span> DriveMerge
        </div>
        {PAGES.map(({ id, label, icon: Icon }) => (
          <button key={id} className="nav" aria-current={id === page ? "page" : undefined} onClick={() => go(id)}>
            <Icon size={17} strokeWidth={1.75} /> {label}
          </button>
        ))}
        <div className="sidebar-foot small muted">Powered by rclone {engine.version}</div>
      </nav>
      <div className="main">
        <header className="topbar">
          <h1>{current.label}</h1>
          <div className="row">
          {update && (
            <button className="btn primary" disabled={installing} title={update.body ?? ""}
              onClick={() => { setInstalling(true); installUpdate(update).catch((e) => { setInstalling(false); alert(`Update failed: ${e?.message ?? e}`); }); }}>
              {installing ? <><Loader2 size={15} className="spin" /> Updating…</> : `Update to ${update.version}`}
            </button>
          )}
          <button className="btn" onClick={() => go("activity")} aria-label="Open activity">
            {active ? <Loader2 size={15} className="spin" /> : <ActivityIcon size={15} />}
            {active ? `${active} transfer${active > 1 ? "s" : ""} · ${formatBytes(stats?.speed)}/s` : "Idle"}
          </button>
          </div>
        </header>
        <main className="content">
          <current.Page go={go} stats={stats} addProvider={addProvider} />
        </main>
      </div>
    </div>
  );
}
