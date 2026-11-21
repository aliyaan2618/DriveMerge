import { useEffect, useState } from "react";
import { ArrowRight, Cloud, Database, HardDrive, Plus, RefreshCw } from "../icons";
import type { PageProps } from "../App";
import { Badge, SpaceError, cachedSpace, getSpace, providerName, useAccounts, type Space } from "../accounts";
import { FREE_TIERS, exactBytes, formatBytes, upstreams } from "../lib";
import { useJobs } from "../jobs";
import { useRc } from "../rc";
import { PageHeader, Stat } from "../ui";
import { addAccount } from "./Accounts";
import { prefetch } from "../listing";

// Segment colours for accounts in the storage bar (distinct, readable in light and dark).
const SEG = ["#5b5bf0", "#f97316", "#14b8a6", "#ec4899", "#eab308", "#0ea5e9", "#84cc16", "#8b5cf6"];


/** Used/total space of each account, fetched in parallel. */
function useSpace(names: string[]) {
  const cached = () => Object.fromEntries(names.flatMap((n) => { const c = cachedSpace(`${n}:`); return c ? [[n, c]] : []; }));
  const [space, setSpace] = useState<Record<string, Space>>(cached);
  const key = names.join(" ");
  useEffect(() => {
    let live = true;
    // Each account fills in as it answers; cached ones show right away.
    for (const n of names) getSpace(`${n}:`).then((v) => live && setSpace((s) => ({ ...s, [n]: v })));
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return space;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

type Done = { name: string; size: number; error: string; completed_at: string };

export default function Dashboard({ go }: PageProps) {
  const { accounts, pool, loading } = useAccounts();
  const jobs = useJobs();
  const members = upstreams(pool?.upstreams).map((u) => u.replace(/:$/, ""));
  const space = useSpace(accounts.map((a) => a.name));
  // Pre-load the pool's top folder so the first visit to Files is instant.
  useEffect(() => prefetch(members), [members.join(" ")]); // eslint-disable-line react-hooks/exhaustive-deps
  const recent = useRc<{ transferred?: Done[] }>("core/transferred");
  const have = accounts.map((a) => a.type);

  const header = (
    <PageHeader title={greeting()} sub={members.length ? `Your pool combines ${members.length} account${members.length === 1 ? "" : "s"} into one storage space.` : "Add cloud accounts to build your storage pool."}>
      <button className="btn primary" onClick={() => addAccount()}><Plus size={16} /> Add account</button>
    </PageHeader>
  );

  if (!loading && !accounts.length)
    return (
      <>
        {header}
        <div className="card center" style={{ padding: 48 }}>
          <h2>Pool all your clouds into one space</h2>
          <p className="muted">Add your Google Drive, OneDrive, Dropbox and other accounts. DriveMerge adds up their free space.</p>
          <button className="btn primary" onClick={() => addAccount()}><Plus size={16} /> Add your first account</button>
        </div>
        <FreeStorage have={have} />
      </>
    );

  // Pool totals from the member accounts (the same numbers the bar below is drawn from).
  const inPool = accounts.filter((a) => members.includes(a.name));
  const total = inPool.reduce((s, a) => s + (space[a.name]?.total ?? 0), 0);
  const used = inPool.reduce((s, a) => s + (space[a.name]?.used ?? 0), 0);
  const free = Math.max(0, total - used);
  const pct = total ? Math.round((used / total) * 100) : 0;
  const next = jobs.map((j) => j.nextRun).filter((n): n is number => !!n).sort()[0];
  const transfers = [...(recent.data?.transferred ?? [])].reverse().slice(0, 5);

  return (
    <>
      {header}

      <section className="card stats" style={{ padding: 0 }}>
        <Stat icon={Database} color="#5b5bf0" label="Pool size" value={<span title={exactBytes(total)}>{formatBytes(total)}</span>} foot={`Across ${inPool.length} account${inPool.length === 1 ? "" : "s"}`} />
        <Stat icon={HardDrive} color="#f97316" label="Used" value={<span title={exactBytes(used)}>{formatBytes(used)}</span>} foot={`${pct}% of your pool`} />
        <Stat icon={Cloud} color="#0ea5e9" label="Free" value={<span title={exactBytes(free)}>{formatBytes(free)}</span>} foot="Ready for new files" />
        <Stat icon={RefreshCw} color="#22a06b" label="Sync jobs" value={String(jobs.length)}
          foot={next ? `Next run ${new Date(next).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}` : "No schedules set"} />
      </section>

      <section className="card">
        <div className="row between">
          <h2 style={{ margin: 0 }}>Storage by account</h2>
          <button className="btn" onClick={() => go("accounts")}>Manage</button>
        </div>
        <p style={{ margin: "14px 0 2px" }}><span className="stat-value" style={{ fontSize: 28 }}>{pct}%</span> <span className="muted">used</span></p>
        <p className="small muted">{formatBytes(used)} of {formatBytes(total)} · {formatBytes(free)} free</p>

        <div className="segbar" role="img" aria-label={`${pct}% of the pool used`}>
          {inPool.map((a, i) => {
            const u = space[a.name]?.used ?? 0;
            return u > 0 && <div key={a.name} title={`${a.name}: ${formatBytes(u)}`} style={{ flexGrow: u, background: SEG[i % SEG.length] }} />;
          })}
          {free > 0 && <div className="seg-free" title={`Free: ${formatBytes(free)}`} style={{ flexGrow: free }} />}
        </div>

        <div className="list" style={{ marginTop: 8 }}>
          {accounts.map((a) => {
            const s = space[a.name];
            const i = inPool.indexOf(a);
            const ap = s?.total ? Math.round(((s.used ?? 0) / s.total) * 100) : 0;
            return (
              <div className="item" key={a.name}>
                <span className="dot" style={{ background: i >= 0 ? SEG[i % SEG.length] : "var(--border)" }} />
                <Badge type={a.type} />
                <div className="grow">
                  <p className="truncate">{a.name}</p>
                  <p className="small muted">{providerName(a.type)}{i < 0 ? " · not in pool" : ""}</p>
                </div>
                {s?.error ? <SpaceError error={s.error} type={a.type} /> : (
                  <>
                    <span className="small muted num">{s ? `${formatBytes(s.used)} / ${formatBytes(s.total)}` : "…"}</span>
                    <span className="num" style={{ width: 48, textAlign: "right" }}>{s ? `${ap}%` : ""}</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card" style={{ padding: 0 }}>
        <div className="row between" style={{ padding: "16px 20px" }}>
          <h2 style={{ margin: 0 }}>Recent transfers</h2>
          <button className="btn" onClick={() => go("activity")}>View activity <ArrowRight size={14} /></button>
        </div>
        {transfers.length ? (
          <table>
            <thead><tr><th>File</th><th style={{ width: 110 }}>Size</th><th style={{ width: 130 }}>Finished</th><th style={{ width: 110 }}>Status</th></tr></thead>
            <tbody>
              {transfers.map((t, i) => (
                <tr key={i}>
                  <td className="truncate" style={{ maxWidth: 360 }}>{t.name}</td>
                  <td className="muted num">{formatBytes(t.size)}</td>
                  <td className="muted">{new Date(t.completed_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</td>
                  <td><span className={`chip ${t.error ? "error" : "ok"}`}>{t.error ? "Failed" : "Done"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted small" style={{ padding: "0 20px 20px" }}>No transfers yet since DriveMerge started.</p>}
      </section>

      <FreeStorage have={have} />
    </>
  );
}

/** Services with a free plan the user can add; shows how many of each they already have. */
function FreeStorage({ have }: { have: string[] }) {
  const total = FREE_TIERS.reduce((sum, t) => sum + t.gb, 0);
  return (
    <section className="card">
      <div className="row between" style={{ alignItems: "baseline" }}>
        <h2>Free storage you can add</h2>
        <p className="small muted">Up to {total} GB free across these services</p>
      </div>
      <p className="small muted" style={{ marginTop: -6, marginBottom: 12 }}>
        Each account adds its free space to your pool. You can add more than one account of the same service, for example several Google accounts.
      </p>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 10 }}>
        {/* Services not added yet first (largest first); ones you already have move to the end. Sort is stable. */}
        {[...FREE_TIERS].sort((a, b) => Number(have.includes(a.type)) - Number(have.includes(b.type))).map((t) => {
          const n = have.filter((x) => x === t.type).length;
          return (
            <div key={t.type} className="row" style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px" }}>
              <Badge type={t.type} />
              <div className="grow" style={{ minWidth: 0 }}>
                <p className="truncate"><strong className="num">{t.gb} GB</strong> <span className="muted">· {providerName(t.type)}</span></p>
                <p className="small muted truncate" title={t.note}>{n ? `You have ${n}` : t.note ?? "Free plan"}</p>
              </div>
              <button className="btn" style={{ height: 30, padding: "0 10px" }} aria-label={`Add ${n ? "another " : ""}${providerName(t.type)} account`}
                onClick={() => addAccount(t.type)}><Plus size={14} /> {n ? "Another" : "Add"}</button>
            </div>
          );
        })}
      </div>
      <div className="row between" style={{ marginTop: 12 }}>
        <p className="small muted">Free amounts as of November 2026; services can change them.</p>
        <button className="btn" onClick={() => addAccount()}>See all 60+ services</button>
      </div>
    </section>
  );
}
