import { useState } from "react";
import type { PageProps } from "../App";
import { Activity as ActivityIcon, Download, X, RefreshCw } from "../icons";
import { rc, useRc } from "../rc";
import { formatBytes } from "../lib";
import { PageHeader, Stat } from "../ui";

type Done = { name: string; size: number; error: string; completed_at: string };

export default function Activity({ stats }: PageProps) {
  const [tab, setTab] = useState<"active" | "recent">("active");
  const recent = useRc<{ transferred?: Done[] }>("core/transferred");
  const active = stats?.transferring ?? [];
  const done = [...(recent.data?.transferred ?? [])].reverse();

  async function stopAll() {
    const { jobids } = await rc<{ jobids: number[] }>("job/list");
    await Promise.all(jobids.map((jobid) => rc("job/stop", { jobid }).catch(() => {})));
  }

  return (
    <>
      <PageHeader title="Activity" sub="Uploads, downloads and syncs since DriveMerge started.">
        <button className="btn" onClick={stopAll} disabled={!active.length}><X size={16} /> Stop all</button>
      </PageHeader>

      <section className="card stats" style={{ padding: 0 }}>
        <Stat icon={ActivityIcon} color="#5b5bf0" label="Speed now" value={`${formatBytes(stats?.speed)}/s`} foot={active.length ? `${active.length} transferring` : "Idle"} />
        <Stat icon={Download} color="#0ea5e9" label="Moved" value={formatBytes(stats?.bytes)} foot="This session" />
        <Stat icon={RefreshCw} color="#22a06b" label="Files done" value={done.filter((d) => !d.error).length} foot={`${done.length} in total`} />
        <Stat icon={X} color="#e5484d" label="Errors" value={stats?.errors ?? 0} foot={stats?.lastError ? <span className="truncate" title={stats.lastError} style={{ display: "block" }}>{stats.lastError}</span> : "None"} />
      </section>

      <section className="card" style={{ padding: 0 }}>
        <div className="row between" style={{ padding: "14px 20px" }}>
          <div className="seg" role="group" aria-label="Show">
            <button aria-pressed={tab === "active"} onClick={() => setTab("active")}>Active ({active.length})</button>
            <button aria-pressed={tab === "recent"} onClick={() => { setTab("recent"); recent.reload(); }}>Recent</button>
          </div>
        </div>
        {tab === "active" ? (
          active.length ? (
            <table>
              <thead><tr><th>File</th><th style={{ width: 240 }}>Progress</th><th style={{ width: 110 }}>Speed</th><th style={{ width: 90 }}>Time left</th></tr></thead>
              <tbody>
                {active.map((t) => (
                  <tr key={t.name}>
                    <td className="truncate" style={{ maxWidth: 360 }}>{t.name}</td>
                    <td>
                      <div className="bar"><div style={{ width: `${t.percentage}%` }} /></div>
                      <span className="small muted mono">{formatBytes(t.bytes)} / {formatBytes(t.size)}</span>
                    </td>
                    <td className="mono muted">{formatBytes(t.speed)}/s</td>
                    <td className="mono muted">{t.eta != null ? `${t.eta}s` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="muted" style={{ padding: "8px 20px 24px" }}>Nothing is transferring.</p>
        ) : done.length ? (
          <table>
            <thead><tr><th>File</th><th style={{ width: 110 }}>Size</th><th style={{ width: 120 }}>Finished</th><th style={{ width: 100 }}>Status</th></tr></thead>
            <tbody>
              {done.map((t, i) => (
                <tr key={i}>
                  <td className="truncate" style={{ maxWidth: 360 }} title={t.error || undefined}>{t.name}</td>
                  <td className="mono muted">{formatBytes(t.size)}</td>
                  <td className="muted">{new Date(t.completed_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</td>
                  <td><span className={`chip ${t.error ? "error" : "ok"}`}>{t.error ? "Failed" : "Done"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted" style={{ padding: "8px 20px 24px" }}>No transfers yet this session.</p>}
      </section>
    </>
  );
}
