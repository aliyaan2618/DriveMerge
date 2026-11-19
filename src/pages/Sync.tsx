import { useRef, useState } from "react";
import { ArrowRight, Activity, Clock, Download, Eye, FileText, FolderOpen, Loader2, Pencil, Play, Plus, Trash2, Upload, X } from "../icons";
import { inTauri, rc } from "../rc";
import { POOL, SYNC_MODES, formatBytes, nextRun, type Repeat, type Schedule, type SyncJob } from "../lib";
import { exportJobs, getJobs, importJobs, saveJobs, useJobs } from "../jobs";
import { runJob, useRunner, type Progress } from "../runner";
import { PageHeader, Stat } from "../ui";

type Report = { job: SyncJob; preview?: Progress };

const blank = (): SyncJob => ({ id: crypto.randomUUID(), name: "", src: "", dst: `${POOL}:`, mode: "update", include: "", exclude: "", minSize: "", maxSize: "", maxAge: "" });
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const when = (t: number) => new Date(t).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

async function pickFolder() {
  if (!inTauri) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  return (await open({ directory: true })) as string | null;
}

export default function Sync() {
  const jobs = useJobs();
  const { running, progress } = useRunner();
  const [editing, setEditing] = useState<SyncJob>();
  const [report, setReport] = useState<Report>();
  const [msg, setMsg] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const reportDialog = useRef<HTMLDialogElement>(null);

  const save = (j: SyncJob[]) => saveJobs(j).catch((e) => alert(`Couldn't save sync jobs: ${e?.message ?? e}`));

  async function preview(job: SyncJob) {
    try {
      const stats = await runJob(job, true);
      if (stats) { setReport({ job, preview: stats }); reportDialog.current?.showModal(); }
    } catch (e) { alert((e as Error).message); }
  }

  const open = (job: SyncJob) => { setEditing(job); dialog.current?.showModal(); };

  async function doExport() {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({ defaultPath: "drivemerge-sync-jobs.json", filters: [{ name: "JSON", extensions: ["json"] }] });
    if (path) await exportJobs(path).then(() => setMsg(`Exported ${jobs.length} job(s).`), (e) => alert(e));
  }
  async function doImport() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ filters: [{ name: "JSON", extensions: ["json"] }] });
    if (typeof path === "string") await importJobs(path).then((n) => setMsg(`Imported ${n} job(s). Their schedules are kept.`), (e) => alert(e));
  }

  return (
    <>
      <PageHeader title="Sync" sub="Keep folders on this PC and your pool in step, on demand or on a schedule.">
        {inTauri && <>
          <button className="icon-btn" aria-label="Import sync jobs" title="Import" onClick={doImport}><Upload size={18} /></button>
          <button className="icon-btn" aria-label="Export sync jobs" title="Export" onClick={doExport} disabled={!jobs.length}><Download size={18} /></button>
        </>}
        <button className="btn primary" onClick={() => open(blank())}><Plus size={16} /> New sync</button>
      </PageHeader>
      {msg && <p className="small muted">{msg}</p>}

      {!!jobs.length && (() => {
        const next = jobs.map((j) => j.nextRun).filter((n): n is number => !!n).sort()[0];
        const failed = jobs.filter((j) => j.lastRun && !j.lastRun.ok).length;
        return (
          <section className="card stats" style={{ padding: 0 }}>
            <Stat icon={Activity} color="#5b5bf0" label="Sync jobs" value={jobs.length} foot={`${Object.keys(running).length} running now`} />
            <Stat icon={Clock} color="#f97316" label="Scheduled" value={jobs.filter((j) => j.schedule).length} foot={next ? `Next ${when(next)}` : "No upcoming runs"} />
            <Stat icon={X} color={failed ? "#e5484d" : "#22a06b"} label="Last run failed" value={failed} foot={failed ? "Open a job's Report to see why" : "All good"} />
          </section>
        );
      })()}

      {!jobs.length && <div className="card center" style={{ padding: 48 }}><p className="muted">No sync jobs yet.</p></div>}

      {jobs.map((job) => {
        const jobid = running[job.id];
        const p = progress[job.id];
        const pct = p?.totalBytes ? (p.bytes / p.totalBytes) * 100 : 0;
        return (
          <section className="card" key={job.id}>
            <div className="row">
              <div className="grow">
                <div className="row" style={{ gap: 8 }}>
                  <h2 style={{ margin: 0 }}>{job.name || "Untitled sync"}</h2>
                  <span className="chip">{SYNC_MODES.find((m) => m.id === job.mode)?.label}</span>
                  {job.schedule && <span className="chip" title={describe(job.schedule)}><Clock size={12} /> {job.nextRun ? `Next: ${when(job.nextRun)}` : "Schedule ended"}</span>}
                </div>
                <p className="row small muted truncate" style={{ gap: 6, marginTop: 4 }}>{job.src} <ArrowRight size={13} /> {job.dst}</p>
              </div>
              {!jobid && <>
                <button className="icon-btn" aria-label={`Edit ${job.name}`} title="Edit" onClick={() => open(job)}><Pencil size={16} /></button>
                <button className="icon-btn" aria-label={`Delete ${job.name}`} title="Delete" onClick={() => confirm(`Delete the sync job "${job.name}"? Your files are not touched.`) && save(jobs.filter((j) => j.id !== job.id))}><Trash2 size={16} /></button>
                <button className="btn" onClick={() => preview(job)}><Eye size={15} /> Preview</button>
                <button className="btn" onClick={() => runJob(job)}><Play size={15} /> Run now</button>
              </>}
              {jobid && <button className="btn" onClick={() => rc("job/stop", { jobid })}>Stop</button>}
            </div>
            {jobid ? (
              <div style={{ marginTop: 14 }}>
                <div className="bar"><div style={{ width: `${pct}%` }} /></div>
                <p className="small muted row" style={{ marginTop: 6 }}><Loader2 size={13} className="spin" /> {formatBytes(p?.bytes)} of {formatBytes(p?.totalBytes)}</p>
              </div>
            ) : job.lastRun && (
              <div className="row small" style={{ marginTop: 10 }}>
                <p className={job.lastRun.ok ? "ok" : "error"}>
                  {job.lastRun.ok ? `Completed: ${job.lastRun.count ?? 0} file(s), ${formatBytes(job.lastRun.bytes ?? 0)}` : `Failed: ${job.lastRun.error}`}
                </p>
                <span className="muted">· {new Date(job.lastRun.at).toLocaleString()}</span>
                <button className="btn" style={{ height: 26, marginLeft: "auto" }} onClick={() => { setReport({ job }); reportDialog.current?.showModal(); }}><FileText size={14} /> Report</button>
              </div>
            )}
          </section>
        );
      })}

      <dialog ref={dialog} aria-label="Sync job" onClose={() => setEditing(undefined)}>
        {editing && <Editor job={editing} onCancel={() => dialog.current?.close()} onSave={(j) => {
          const all = getJobs();
          const withNext = { ...j, nextRun: j.schedule ? nextRun(j.schedule, new Date()) : undefined };
          save(all.some((x) => x.id === j.id) ? all.map((x) => (x.id === j.id ? withNext : x)) : [...all, withNext]);
          dialog.current?.close();
        }} />}
      </dialog>

      <dialog ref={reportDialog} aria-label="Sync report" onClose={() => setReport(undefined)}>
        {report && <ReportView job={getJobs().find((j) => j.id === report.job.id) ?? report.job} preview={report.preview}
          onClose={() => reportDialog.current?.close()} onRun={() => { reportDialog.current?.close(); runJob(report.job); }} />}
      </dialog>
    </>
  );
}

function describe(s: Schedule) {
  const at = `at ${s.time}`;
  switch (s.repeat) {
    case "once": return `Once on ${s.date} ${at}`;
    case "daily": return `Every day ${at}`;
    case "weekly": return `Every ${(s.days ?? []).map((d) => DAYS[d]).join(", ")} ${at}`;
    case "monthly": return `Every month on day ${s.day} ${at}`;
  }
}

function ReportView({ job, preview, onClose, onRun }: { job: SyncJob; preview?: Progress; onClose: () => void; onRun: () => void }) {
  const r = job.lastRun;
  const counters: [string, string | number][] = preview
    ? [["To copy", preview.transfers ?? 0], ["To delete", preview.deletes ?? 0], ["Size", formatBytes(preview.totalBytes || preview.bytes)], ["Checked", preview.checks ?? 0]]
    : [["Copied", r?.count ?? 0], ["Size", formatBytes(r?.bytes ?? 0)], ["Failed", r?.failed?.length ?? (r?.ok ? 0 : 1)]];
  return (
    <div className="dialog-body">
      <h2>{preview ? `Preview: ${job.name}` : `Report: ${job.name}`}</h2>
      <p className={`banner small ${!preview && !r?.ok ? "warn" : ""}`}>
        {preview ? "Nothing has changed yet. This is what Run now would do." : r?.ok ? `Completed ${new Date(r.at).toLocaleString()}` : `Failed: ${r?.error}`}
      </p>
      <div className="grid cols-4">
        {counters.map(([label, value]) => (
          <div key={label}><p className="small muted">{label}</p><p className="stat-value">{value}</p></div>
        ))}
      </div>
      {!!r?.failed?.length && !preview && (
        <div className="list" style={{ maxHeight: 220, overflow: "auto" }}>
          {r.failed.map((f, i) => (
            <div className="item small" key={i}><span className="grow truncate">{f.name}</span><span className="error truncate" style={{ maxWidth: 260 }}>{f.error}</span></div>
          ))}
        </div>
      )}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={onClose}>Close</button>
        <button className="btn primary" onClick={onRun}><Play size={15} /> {preview ? "Run now" : "Run again"}</button>
      </div>
    </div>
  );
}

function Editor({ job, onSave, onCancel }: { job: SyncJob; onSave: (j: SyncJob) => void; onCancel: () => void }) {
  const [j, set] = useState(job);
  const [error, setError] = useState("");
  const f = (k: keyof SyncJob) => ({ value: j[k] as string, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set({ ...j, [k]: e.target.value }) });
  const browse = (k: "src" | "dst") => pickFolder().then((p) => p && set((x) => ({ ...x, [k]: p })));
  const path = (k: "src" | "dst", label: string, placeholder: string) => (
    <label className="field">
      <span>{label} *</span>
      <div className="row" style={{ gap: 8 }}>
        <input required {...f(k)} placeholder={placeholder} />
        {inTauri && <button type="button" className="btn" onClick={() => browse(k)}><FolderOpen size={15} /> Browse…</button>}
      </div>
    </label>
  );
  const s = j.schedule;
  const setS = (patch: Partial<Schedule>) => set({ ...j, schedule: { ...(s ?? { repeat: "daily", time: "02:00" }), ...patch } });
  const repeat = (r: Repeat | "off") => r === "off"
    ? set({ ...j, schedule: undefined })
    : setS({ repeat: r, date: s?.date ?? new Date().toLocaleDateString("en-CA"), days: s?.days ?? [new Date().getDay()], day: s?.day ?? new Date().getDate() });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (s?.repeat === "weekly" && !s.days?.length) return setError("Pick at least one day.");
    if (s && !nextRun(s, new Date())) return setError("That date and time has already passed.");
    onSave(j);
  }

  return (
    <form className="dialog-body" onSubmit={submit}>
      <h2>{job.name ? "Edit sync" : "New sync"}</h2>
      <label className="field"><span>Name *</span><input required {...f("name")} placeholder="Photos backup" /></label>
      {path("src", "From", "C:\\Users\\you\\Pictures")}
      {path("dst", "To", "pool:Pictures")}
      <small className="small muted" style={{ marginTop: -8 }}>Use a folder on this PC, or pool:folder for your pool.</small>
      <div className="field">
        <span>Mode</span>
        <div className="seg" role="group" aria-label="Mode">
          {SYNC_MODES.map((m) => <button type="button" key={m.id} aria-pressed={j.mode === m.id} onClick={() => set({ ...j, mode: m.id })}>{m.label}</button>)}
        </div>
        <small className={`small ${j.mode === "mirror" ? "warn" : "muted"}`}>{SYNC_MODES.find((m) => m.id === j.mode)?.help}</small>
      </div>

      <div className="field">
        <span>Schedule</span>
        <div className="seg" role="group" aria-label="Repeat">
          {(["off", "once", "daily", "weekly", "monthly"] as const).map((r) => (
            <button type="button" key={r} aria-pressed={(s?.repeat ?? "off") === r} onClick={() => repeat(r)}>{r === "off" ? "Off" : r[0].toUpperCase() + r.slice(1)}</button>
          ))}
        </div>
        {s && (
          <div className="row wrap" style={{ marginTop: 4 }}>
            {s.repeat === "once" && <input type="date" aria-label="Date" value={s.date} onChange={(e) => setS({ date: e.target.value })} style={{ width: 160 }} />}
            {s.repeat === "weekly" && (
              <div className="seg" role="group" aria-label="Days">
                {DAYS.map((d, i) => (
                  <button type="button" key={d} aria-pressed={!!s.days?.includes(i)}
                    onClick={() => setS({ days: s.days?.includes(i) ? s.days.filter((x) => x !== i) : [...(s.days ?? []), i].sort() })}>{d}</button>
                ))}
              </div>
            )}
            {s.repeat === "monthly" && (
              <label className="row small" style={{ gap: 6 }}>Day
                <input type="number" min={1} max={31} value={s.day} onChange={(e) => setS({ day: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })} style={{ width: 70 }} />
              </label>
            )}
            <label className="row small" style={{ gap: 6 }}>at <input type="time" aria-label="Time" required value={s.time} onChange={(e) => setS({ time: e.target.value })} style={{ width: 120 }} /></label>
          </div>
        )}
        <small className="small muted">
          {s ? `${describe(s)}. DriveMerge must be running (it can stay in the tray); a run missed while it was closed happens when it next starts.` : "Runs only when you click Run now."}
        </small>
      </div>

      <details>
        <summary className="small muted" style={{ cursor: "pointer" }}>Filters</summary>
        <div className="dialog-body" style={{ marginTop: 12 }}>
          <label className="field"><span>Only include (one pattern per line)</span><textarea {...f("include")} placeholder="*.jpg" /></label>
          <label className="field"><span>Exclude (one pattern per line)</span><textarea {...f("exclude")} placeholder="*.tmp" /></label>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <label className="field"><span>Min size</span><input {...f("minSize")} placeholder="10K" /></label>
            <label className="field"><span>Max size</span><input {...f("maxSize")} placeholder="2G" /></label>
            <label className="field"><span>Changed within</span><input {...f("maxAge")} placeholder="30d" /></label>
          </div>
        </div>
      </details>
      {error && <p className="error small">{error}</p>}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn primary">Save</button>
      </div>
    </form>
  );
}
