import { useState } from "react";
import type { PageProps } from "../App";
import { rc, useRc } from "../rc";
import { formatBytes } from "../lib";

type Done = { name: string; size: number; error: string; completed_at: string };

export default function Activity({ stats }: PageProps) {
  const [tab, setTab] = useState<"active" | "recent">("active");
  const recent = useRc<{ transferred: Done[] }>("core/transferred");
  const active = stats?.transferring ?? [];

  async function stopAll() {
    const { jobids } = await rc<{ jobids: number[] }>("job/list");
    await Promise.all(jobids.map((jobid) => rc("job/stop", { jobid }).catch(() => {})));
  }

  return (
    <>
      <div className="row between">
        <div className="seg" role="group" aria-label="Show">
          <button aria-pressed={tab === "active"} onClick={() => setTab("active")}>Active ({active.length})</button>
          <button aria-pressed={tab === "recent"} onClick={() => { setTab("recent"); recent.reload(); }}>Recent</button>
        </div>
        <div className="row">
          <span className="muted small">{formatBytes(stats?.speed)}/s · {formatBytes(stats?.bytes)} moved this session</span>
          {tab === "active" && <button className="btn" onClick={stopAll} disabled={!active.length}>Stop all</button>}
        </div>
      </div>
      {!!stats?.errors && <p className="banner warn small">{stats.errors} error(s). Last: {stats.lastError}</p>}

      <section className="card">
        <div className="list">
          {tab === "active" && active.map((t) => (
            <div className="item" key={t.name}>
              <div className="grow">
                <p className="truncate">{t.name}</p>
                <div className="bar" style={{ marginTop: 6 }}><div style={{ width: `${t.percentage}%` }} /></div>
              </div>
              <p className="small muted" style={{ width: 200, textAlign: "right" }}>
                {formatBytes(t.bytes)} of {formatBytes(t.size)} · {formatBytes(t.speed)}/s{t.eta != null ? ` · ${t.eta}s left` : ""}
              </p>
            </div>
          ))}
          {tab === "active" && !active.length && <p className="muted">Nothing is transferring.</p>}
          {tab === "recent" && [...(recent.data?.transferred ?? [])].reverse().map((t, i) => (
            <div className="item" key={i}>
              <p className="grow truncate">{t.name}</p>
              <span className={`chip ${t.error ? "error" : "ok"}`}>{t.error ? "Failed" : "Done"}</span>
              <p className="small muted" style={{ width: 160, textAlign: "right" }}>{formatBytes(t.size)} · {new Date(t.completed_at).toLocaleTimeString()}</p>
            </div>
          ))}
          {tab === "recent" && !recent.data?.transferred?.length && <p className="muted">No transfers yet this session.</p>}
        </div>
      </section>
    </>
  );
}
