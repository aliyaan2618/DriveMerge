import { Plus } from "lucide-react";
import type { PageProps } from "../App";
import { Badge, Usage, providerName, useAbout, useAccounts } from "../accounts";
import { FREE_TIERS, POOL, formatBytes, upstreams } from "../lib";
import { getJobs } from "../jobs";

function Ring({ pct }: { pct: number }) {
  const r = 52, c = 2 * Math.PI * r;
  return (
    <svg width="132" height="132" viewBox="0 0 132 132" role="img" aria-label={`${Math.round(pct)}% used`}>
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7b7bff" /><stop offset="1" stopColor="#5b5bf0" /></linearGradient>
      </defs>
      <circle cx="66" cy="66" r={r} fill="none" stroke="var(--hover)" strokeWidth="12" />
      {pct > 0 && <circle cx="66" cy="66" r={r} fill="none" stroke="url(#g)" strokeWidth="12" strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 66 66)" />}
      <text x="66" y="72" textAnchor="middle" fontSize="20" fontWeight="600" fill="var(--text)">{Math.round(pct)}%</text>
    </svg>
  );
}

/** Services with a free plan the user can add; shows how many of each they already have. */
function FreeStorage({ go, have }: { go: PageProps["go"]; have: string[] }) {
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
        {FREE_TIERS.map((t) => {
          const n = have.filter((x) => x === t.type).length;
          return (
            <div key={t.type} className="row" style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px" }}>
              <Badge type={t.type} />
              <div className="grow" style={{ minWidth: 0 }}>
                <p className="truncate"><strong>{t.gb} GB</strong> <span className="muted">· {providerName(t.type)}</span></p>
                <p className="small muted truncate" title={t.note}>{n ? `You have ${n}` : t.note ?? "Free plan"}</p>
              </div>
              <button className="btn" style={{ height: 30, padding: "0 10px" }} aria-label={`Add ${n ? "another " : ""}${providerName(t.type)} account`}
                onClick={() => go("accounts", t.type)}><Plus size={14} /> {n ? "Another" : "Add"}</button>
            </div>
          );
        })}
      </div>
      <div className="row between" style={{ marginTop: 12 }}>
        <p className="small muted">Free amounts as of November 2026; services can change them.</p>
        <button className="btn" onClick={() => go("accounts", "all")}>See all 60+ services</button>
      </div>
    </section>
  );
}

export default function Dashboard({ go, stats }: PageProps) {
  const { accounts, pool, loading } = useAccounts();
  const about = useAbout(pool ? `${POOL}:` : undefined, pool?.upstreams);
  const inPool = upstreams(pool?.upstreams);

  const have = accounts.map((a) => a.type);

  if (!loading && !accounts.length)
    return (
      <>
        <div className="card center" style={{ padding: 56 }}>
          <h2>Pool all your clouds into one space</h2>
          <p className="muted">Add your Google Drive, OneDrive, Dropbox and other accounts. DriveMerge adds up their free space.</p>
          <button className="btn primary" onClick={() => go("accounts")}><Plus size={16} /> Add your first account</button>
        </div>
        <FreeStorage go={go} have={have} />
      </>
    );

  const pct = about?.total ? ((about.used ?? 0) / about.total) * 100 : 0;
  return (
    <>
      <section className="card row" style={{ gap: 32 }}>
        <Ring pct={pct} />
        <div className="grow">
          <p className="muted">Your pool</p>
          <p className="stat-value" style={{ fontSize: 28 }}>
            {pool ? `${formatBytes(about?.used)} of ${formatBytes(about?.total)}` : "No pool yet"}
          </p>
          <p className="muted">
            {pool ? `${formatBytes(about?.free)} free across ${inPool.length} account${inPool.length === 1 ? "" : "s"}` : "Include accounts in your pool on the Accounts page."}
          </p>
        </div>
        <button className="btn" onClick={() => go("files")}>Open files</button>
      </section>

      <section className="grid cols-4">
        {[
          ["Accounts", accounts.length],
          ["In pool", inPool.length],
          ["Active transfers", stats?.transferring?.length ?? 0],
          ["Sync jobs", getJobs().length],
        ].map(([label, value]) => (
          <div className="card" key={label}>
            <p className="small muted">{label}</p>
            <p className="stat-value">{value}</p>
          </div>
        ))}
      </section>

      <section className="card">
        <div className="row between"><h2>Accounts</h2><button className="btn" onClick={() => go("accounts")}>Manage</button></div>
        <div className="list">
          {accounts.map((a) => (
            <div className="item" key={a.name}>
              <Badge type={a.type} />
              <div className="grow">
                <p>{a.name}</p>
                <p className="small muted">{providerName(a.type)}{inPool.includes(`${a.name}:`) ? " · in pool" : ""}</p>
              </div>
              <Usage fs={`${a.name}:`} />
            </div>
          ))}
        </div>
      </section>

      <FreeStorage go={go} have={have} />
    </>
  );
}
