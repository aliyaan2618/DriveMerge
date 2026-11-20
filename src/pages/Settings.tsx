import { useEffect, useState } from "react";
import { inTauri, rc, useRc } from "../rc";
import { checkForUpdate, installUpdate } from "../update";
import { PageHeader } from "../ui";
import { runWhenClosed, setRunWhenClosed } from "../tasks";
import { getJobs } from "../jobs";

const THEME_KEY = "drivemerge.theme";
const BW_KEY = "drivemerge.bwlimit";
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
  const [whenClosed, setWhenClosed] = useState(runWhenClosed);
  const [taskMsg, setTaskMsg] = useState("");

  async function toggleWhenClosed(on: boolean) {
    setTaskMsg(on ? "Adding Windows scheduled tasks…" : "Removing Windows scheduled tasks…");
    try {
      await setRunWhenClosed(on, getJobs());
      setWhenClosed(on);
      const n = getJobs().filter((j) => j.schedule).length;
      setTaskMsg(on ? `${n} scheduled job(s) added to Windows Task Scheduler.` : "Removed from Windows Task Scheduler.");
    } catch (e) { setTaskMsg(`Couldn't change Windows scheduled tasks: ${(e as Error)?.message ?? e}`); }
  }

  async function manualCheck() {
    setUpdateMsg("Checking…");
    try {
      const u = await checkForUpdate();
      if (!u) return setUpdateMsg("You have the latest version.");
      if (!confirm(`DriveMerge ${u.version} is available. Install it and restart now?`)) return setUpdateMsg(`Version ${u.version} is available.`);
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
      <PageHeader title="Settings" sub="How DriveMerge looks, starts and moves your files." />

      <section className="card settings">
        <Row title="Theme" desc="Follow Windows, or always use light or dark.">
          <div className="seg" role="group" aria-label="Theme">
            {(["system", "light", "dark"] as const).map((t) => (
              <button key={t} aria-pressed={theme === t} onClick={() => pick(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
            ))}
          </div>
        </Row>
        {inTauri && (
          <Row title="Start with Windows" desc="Starts quietly in the system tray. Closing the window also keeps DriveMerge there; use Quit in the tray menu to exit.">
            <label className="switch">
              <input type="checkbox" role="switch" aria-label="Start DriveMerge when I sign in to Windows" checked={!!autostart} disabled={autostart === undefined} onChange={(e) => toggleAutostart(e.target.checked)} />
              <span />
            </label>
          </Row>
        )}
        {inTauri && (
          <Row title="Run schedules when DriveMerge is closed" desc="Adds a Windows scheduled task for each scheduled sync job, so it still runs when DriveMerge isn't open (you need to be signed in to Windows). A run missed while the PC was off happens when it's next on. Turning this off removes the tasks.">
            <label className="switch">
              <input type="checkbox" role="switch" aria-label="Run schedules when DriveMerge is closed" checked={whenClosed} onChange={(e) => toggleWhenClosed(e.target.checked)} />
              <span />
            </label>
            {taskMsg && <p className="small muted" style={{ marginTop: 6 }}>{taskMsg}</p>}
          </Row>
        )}
        <Row title="Bandwidth limit" desc={`For example 5M for 5 MB/s. Leave empty for no limit. Now: ${bw.data?.rate === "off" || !bw.data ? "no limit" : `${bw.data.rate}/s`}. Kept after restart.`}>
          <form className="row" onSubmit={saveLimit}>
            <input value={limit} onChange={(e) => setLimit(e.target.value)} placeholder={bw.data?.rate ?? "off"} aria-label="Bandwidth limit" style={{ width: 140 }} />
            <button className="btn">Apply</button>
          </form>
          {msg && <p className="small muted" style={{ marginTop: 6 }}>{msg}</p>}
        </Row>
      </section>

      {inTauri && installDir && (
        <section className="card settings">
          <Row title="Command line" desc={<>Run saved syncs by name, or any rclone command on your pool, from a terminal. Run this once in PowerShell, then open a new terminal and type <code>drivemerge help</code>.</>}>
            <div className="row" style={{ width: "100%" }}>
              <input readOnly value={pathCmd} aria-label="PowerShell command to add DriveMerge to PATH" className="mono" style={{ fontSize: 12 }} />
              <button className="btn" onClick={() => navigator.clipboard.writeText(pathCmd).then(() => setCopied(true))}>{copied ? "Copied" : "Copy"}</button>
            </div>
            <p className="small muted" style={{ marginTop: 6 }}>Examples: <code>drivemerge jobs</code> · <code>drivemerge run "Photos backup"</code> · <code>drivemerge ls pool:</code></p>
          </Row>
        </section>
      )}

      <section className="card settings">
        <Row title={`DriveMerge ${__APP_VERSION__}`} desc={`Powered by rclone ${version.data?.version ?? ""} (MIT licence). Licences are in THIRD-PARTY-LICENSES.md in the install folder.`}>
          {inTauri && <button className="btn" onClick={manualCheck}>Check for updates</button>}
          {updateMsg && <p className="small muted" style={{ marginTop: 6 }}>{updateMsg}</p>}
        </Row>
      </section>
    </>
  );
}

/** A settings row: label and help on the left, the control on the right. */
function Row({ title, desc, children }: { title: string; desc: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="setting">
      <div><p style={{ fontWeight: 500 }}>{title}</p><p className="small muted">{desc}</p></div>
      <div>{children}</div>
    </div>
  );
}
