import { useEffect, useState } from "react";
import { inTauri, rc, useRc } from "../rc";
import { checkForUpdate, installUpdate } from "../update";

const THEME_KEY = "cloudmerge.theme";
const BW_KEY = "cloudmerge.bwlimit";
type Theme = "system" | "light" | "dark";

export function applyTheme(t?: Theme) {
  try { t ??= (localStorage.getItem(THEME_KEY) as Theme) ?? "system"; } catch { t = "system"; }
  if (t === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  return t;
}

/** Re-applies the saved bandwidth limit after the engine starts (rclone forgets it on restart). */
export function applySavedBandwidth() {
  try {
    const rate = localStorage.getItem(BW_KEY);
    if (rate) rc("core/bwlimit", { rate }).catch(() => {});
  } catch { /* nothing saved */ }
}

export default function Settings() {
  const [theme, setTheme] = useState<Theme>(() => applyTheme());
  const bw = useRc<{ rate: string }>("core/bwlimit");
  const version = useRc<{ version: string }>("core/version");
  const [limit, setLimit] = useState("");
  const [msg, setMsg] = useState("");
  const [autostart, setAutostart] = useState<boolean>();
  const [installDir, setInstallDir] = useState("");
  const [copied, setCopied] = useState(false);
  const [updateMsg, setUpdateMsg] = useState("");

  async function manualCheck() {
    setUpdateMsg("Checking…");
    try {
      const u = await checkForUpdate();
      if (!u) return setUpdateMsg("You have the latest version.");
      if (!confirm(`CloudMerge ${u.version} is available. Install it and restart now?`)) return setUpdateMsg(`Version ${u.version} is available.`);
      setUpdateMsg("Downloading update…");
      await installUpdate(u);
    } catch (e) {
      setUpdateMsg(`Couldn't check for updates: ${(e as Error)?.message ?? e}`);
    }
  }

  useEffect(() => {
    if (!inTauri) return;
    import("@tauri-apps/plugin-autostart").then((a) => a.isEnabled()).then(setAutostart, () => {});
    import("@tauri-apps/api/path").then((p) => p.resourceDir()).then(setInstallDir, () => {});
  }, []);
  // Appends the install folder to the user's PATH (not the system one); no admin rights needed.
  const pathCmd = `[Environment]::SetEnvironmentVariable("Path", [Environment]::GetEnvironmentVariable("Path", "User") + ";${installDir}", "User")`;

  function pick(t: Theme) {
    setTheme(applyTheme(t));
    try { localStorage.setItem(THEME_KEY, t); } catch { /* not persisted */ }
  }

  async function saveLimit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await rc<{ rate: string }>("core/bwlimit", { rate: limit.trim() || "off" });
      try { r.rate === "off" ? localStorage.removeItem(BW_KEY) : localStorage.setItem(BW_KEY, limit.trim()); } catch { /* applies this session only */ }
      setMsg(r.rate === "off" ? "No limit" : `Limited to ${r.rate}/s`);
      setLimit("");
      bw.reload();
    } catch (err) { setMsg((err as Error).message); }
  }

  async function toggleAutostart(on: boolean) {
    const a = await import("@tauri-apps/plugin-autostart");
    try {
      await (on ? a.enable() : a.disable());
      setAutostart(await a.isEnabled());
    } catch (e) { alert((e as Error).message ?? String(e)); }
  }

  return (
    <>
      <section className="card">
        <h2>Appearance</h2>
        <div className="seg" role="group" aria-label="Theme">
          {(["system", "light", "dark"] as const).map((t) => (
            <button key={t} aria-pressed={theme === t} onClick={() => pick(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
          ))}
        </div>
      </section>

      {inTauri && (
        <section className="card">
          <h2>Startup</h2>
          <label className="row">
            <input type="checkbox" checked={!!autostart} disabled={autostart === undefined} onChange={(e) => toggleAutostart(e.target.checked)} />
            Start CloudMerge when I sign in to Windows
          </label>
          <p className="small muted" style={{ marginTop: 8 }}>
            It starts quietly in the system tray. Closing the window also keeps CloudMerge running there; use Quit in the tray menu to exit.
          </p>
        </section>
      )}

      {inTauri && installDir && (
        <section className="card">
          <h2>Command line</h2>
          <p className="small muted">
            Use <code>cloudmerge</code> in a terminal for scripts: run saved syncs by name or any rclone command on your pool.
            To turn it on, run this once in PowerShell, then open a new terminal and type <code>cloudmerge help</code>.
          </p>
          <div className="row" style={{ marginTop: 10 }}>
            <input readOnly value={pathCmd} aria-label="PowerShell command to add CloudMerge to PATH" style={{ fontFamily: "ui-monospace, Consolas, monospace", fontSize: 12 }} />
            <button className="btn" onClick={() => navigator.clipboard.writeText(pathCmd).then(() => setCopied(true))}>{copied ? "Copied" : "Copy"}</button>
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>Examples: <code>cloudmerge jobs</code> · <code>cloudmerge run "Photos backup"</code> · <code>cloudmerge ls pool:</code></p>
        </section>
      )}

      <section className="card">
        <h2>Transfers</h2>
        <form className="row" onSubmit={saveLimit} style={{ maxWidth: 480 }}>
          <label className="field grow">
            <span>Bandwidth limit (e.g. 5M for 5 MB/s, empty for none)</span>
            <input value={limit} onChange={(e) => setLimit(e.target.value)} placeholder={bw.data?.rate ?? "off"} />
          </label>
          <button className="btn" style={{ alignSelf: "end" }}>Apply</button>
        </form>
        {msg && <p className="small muted" style={{ marginTop: 8 }}>{msg}</p>}
        <p className="small muted" style={{ marginTop: 8 }}>Current limit: {bw.data?.rate === "off" || !bw.data ? "none" : `${bw.data.rate}/s`}. Kept after restart.</p>
      </section>

      <section className="card">
        <h2>About</h2>
        <div className="row">
          <p className="grow">CloudMerge {__APP_VERSION__}</p>
          {inTauri && <button className="btn" onClick={manualCheck}>Check for updates</button>}
        </div>
        {updateMsg && <p className="small muted">{updateMsg}</p>}
        <p className="small muted">Powered by rclone {version.data?.version} (MIT licence). See THIRD-PARTY-LICENSES.md in the install folder.</p>
      </section>
    </>
  );
}
