import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Cloud, Database, Layers, Loader2, Pencil, Plus, RotateCw, Search, Trash2 } from "../icons";
import { PageHeader, Stat } from "../ui";
import { ask, askText, tell } from "../dialogs";
import { rc } from "../rc";
import type { PageProps } from "../App";
import { Badge, Usage, createAccount, providerName, reconnectAccount, renameAccount, savePool, setInPool, useAbout, useAccounts, type About } from "../accounts";
import { NAME_RE, POLICIES, POOL, formatBytes, toggleUpstream, upstreams } from "../lib";

type Option = { Name: string; Help: string; Required: boolean; Advanced: boolean; Hide: number; IsPassword: boolean; Default: unknown };
type Provider = { Name: string; Description: string; Options: Option[] };

// Wrapper and local-only backends: not cloud accounts.
const HIDDEN = new Set(["alias", "cache", "chunker", "combine", "compress", "crypt", "hasher", "union", "local", "memory", "tardigrade", "uptobox", "archive"]);
const POPULAR = ["drive", "onedrive", "dropbox", "mega", "box", "pcloud", "sftp", "webdav"];

export default function Accounts({ addProvider }: PageProps) {
  const { accounts, pool, reload, error } = useAccounts();
  const poolAbout = useAbout(pool ? `${POOL}:` : undefined, pool?.upstreams);
  const dialog = useRef<HTMLDialogElement>(null);
  const inPool = upstreams(pool?.upstreams);
  const [busy, setBusy] = useState("");
  const [key, setKey] = useState(0); // remounts usage bars after a reconnect
  const taken = accounts.map((a) => a.name);

  // Arriving from the Dashboard's free-storage list: open Add account on that service.
  const [initial, setInitial] = useState(addProvider);
  useEffect(() => { if (addProvider) { setInitial(addProvider); dialog.current?.showModal(); } }, [addProvider]);

  async function act(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    try { await fn(); } catch (e) { tell("Something went wrong", (e as Error).message); }
    setBusy("");
    setKey((k) => k + 1);
    reload();
  }

  async function remove(name: string) {
    const about = await rc<About>("operations/about", { fs: `${name}:` }).catch(() => undefined);
    const held = inPool.includes(`${name}:`) && about?.used ? ` Its ${formatBytes(about.used)} of files will no longer appear in your pool.` : "";
    if (!(await ask({ title: `Remove ${name}?`, message: `Nothing is deleted from the cloud; DriveMerge just stops using this account.${held}`, confirm: "Remove account", danger: true }))) return;
    act(`remove ${name}`, async () => {
      await savePool(pool, toggleUpstream(pool?.upstreams, name, false));
      await rc("config/delete", { name });
    });
  }

  async function rename(name: string) {
    const to = await askText({ title: `Rename ${name}`, label: "Account name", value: name, confirm: "Rename",
      validate: (v) => (v === name ? "" : !NAME_RE.test(v) ? "Use letters, numbers, - and _ only." : taken.includes(v) || v === POOL ? "That name is taken." : "") });
    if (!to || to === name) return;
    act(`rename ${name}`, () => renameAccount(pool, name, to));
  }

  return (
    <>
      <PageHeader title="Accounts" sub="Accounts in the pool add their free space to one combined storage.">
        <button className="btn primary" onClick={() => dialog.current?.showModal()}><Plus size={16} /> Add account</button>
      </PageHeader>
      {error && <p className="error">{error}</p>}

      <section className="card stats" style={{ padding: 0 }}>
        <Stat icon={Cloud} color="#5b5bf0" label="Accounts" value={accounts.length} foot={`${new Set(accounts.map((a) => a.type)).size} service(s)`} />
        <Stat icon={Layers} color="#14b8a6" label="In pool" value={inPool.length} foot={inPool.length > 1 ? POLICIES.find((p) => p.id === (pool?.create_policy ?? "mfs"))?.label : "Add 2+ to pool space"} />
        <Stat icon={Database} color="#0ea5e9" label="Pool free" value={pool ? formatBytes(poolAbout?.free) : "—"} foot={pool ? `of ${formatBytes(poolAbout?.total)}` : "No pool yet"} />
      </section>

      <section className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Account</th><th style={{ width: 220 }}>Space</th><th style={{ width: 100 }}>In pool</th><th style={{ width: 120 }}><span hidden>Actions</span></th></tr></thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.name}>
                <td>
                  <span className="row">
                    <Badge type={a.type} />
                    <span style={{ minWidth: 0 }}><span className="truncate" style={{ display: "block" }}>{a.name}</span><span className="small muted">{providerName(a.type)}</span></span>
                  </span>
                </td>
                <td>{busy === `reconnect ${a.name}` ? <span className="small muted row"><Loader2 size={14} className="spin" /> Waiting for sign-in…</span> : <Usage key={key} fs={`${a.name}:`} />}</td>
                <td>
                  <label className="switch">
                    <input type="checkbox" role="switch" checked={inPool.includes(`${a.name}:`)} disabled={!!busy} aria-label={`Include ${a.name} in pool`}
                      onChange={(e) => act("pool", () => setInPool(pool, a.name, e.target.checked))} />
                    <span />
                  </label>
                </td>
                <td>
                  <div className="row" style={{ gap: 0, justifyContent: "flex-end" }}>
                    {a.oauth && <button className="icon-btn" title="Sign in again" aria-label={`Sign in to ${a.name} again`} disabled={!!busy}
                      onClick={() => act(`reconnect ${a.name}`, () => reconnectAccount(a.name))}><RotateCw size={18} /></button>}
                    <button className="icon-btn" title="Rename" aria-label={`Rename ${a.name}`} disabled={!!busy} onClick={() => rename(a.name)}><Pencil size={18} /></button>
                    <button className="icon-btn" title="Remove" aria-label={`Remove ${a.name}`} disabled={!!busy} onClick={() => remove(a.name)}><Trash2 size={18} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!accounts.length && <p className="muted" style={{ padding: 24, textAlign: "center" }}>No accounts yet. Add one to start your pool.</p>}
      </section>

      {pool && inPool.length > 1 && (
        <section className="card">
          <div className="row between">
            <div>
              <h2 style={{ margin: 0 }}>Where new files go</h2>
              <p className="small muted">Uploads and syncs into the pool use this rule to pick an account.</p>
            </div>
          </div>
          <div style={{ height: 12 }} />
          <div className="seg" role="group" aria-label="Where new files go">
            {POLICIES.map((p) => (
              <button key={p.id} aria-pressed={(pool.create_policy ?? "mfs") === p.id} disabled={!!busy}
                onClick={() => act("policy", () => savePool(pool, pool.upstreams, p.id))}>{p.label}</button>
            ))}
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>{POLICIES.find((p) => p.id === (pool.create_policy ?? "mfs"))?.help}</p>
        </section>
      )}

      <dialog ref={dialog} aria-label="Add account" onClose={() => { setInitial(undefined); reload(); }}>
        <AddAccount key={initial ?? ""} initial={initial} taken={taken} onDone={async (name) => {
          await setInPool(pool, name, true);
          dialog.current?.close();
        }} onCancel={() => dialog.current?.close()} />
      </dialog>
    </>
  );
}

function AddAccount({ initial, taken, onDone, onCancel }: { initial?: string; taken: string[]; onDone: (name: string) => Promise<unknown>; onCancel: () => void }) {
  const [providers, setProviders] = useState<Provider[]>();
  const [q, setQ] = useState("");
  const [p, setP] = useState<Provider>();
  const [name, setName] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ busy?: boolean; error?: string }>({});
  const [authUrl, setAuthUrl] = useState("");

  useEffect(() => {
    rc<{ providers: Provider[] }>("config/providers").then((r) =>
      setProviders(r.providers.filter((x) => !HIDDEN.has(x.Name)).sort((a, b) => rank(a) - rank(b) || a.Name.localeCompare(b.Name))));
  }, []);

  // While waiting for sign-in, show the link in case the browser didn't open.
  useEffect(() => {
    if (!status.busy) return setAuthUrl("");
    const t = setInterval(() => rc<{ status: string; authUrl?: string }>("config/oauthstatus").then((s) => setAuthUrl(s.authUrl ?? ""), () => {}), 2000);
    return () => clearInterval(t);
  }, [status.busy]);

  function pick(x: Provider) {
    setP(x);
    const base = providerName(x.Name).replace(/[^A-Za-z0-9_-]/g, "");
    let n = base, i = 2;
    while (taken.includes(n) || n === POOL) n = `${base}${i++}`;
    setName(n);
  }

  useEffect(() => {
    const x = initial && providers?.find((pr) => pr.Name === initial);
    if (x) pick(x);
  }, [providers]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!providers) return <p className="muted">Loading providers…</p>;

  if (!p) {
    const shown = providers.filter((x) => `${x.Name} ${x.Description}`.toLowerCase().includes(q.toLowerCase()));
    return (
      <div className="dialog-body">
        <h2>Add a cloud account</h2>
        <label className="row" style={{ position: "relative" }}>
          <Search size={15} style={{ position: "absolute", left: 10 }} className="muted" />
          <input autoFocus placeholder="Search 60+ services" aria-label="Search services" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 32 }} />
        </label>
        <div className="list" style={{ maxHeight: 380, overflow: "auto" }}>
          {shown.map((x) => (
            <button key={x.Name} className="item nav" style={{ color: "var(--text)" }} onClick={() => pick(x)}>
              <Badge type={x.Name} />
              <span className="grow"><span>{providerName(x.Name)}</span><br /><span className="small muted">{x.Description}</span></span>
            </button>
          ))}
        </div>
        <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn" onClick={onCancel}>Cancel</button></div>
      </div>
    );
  }

  const opts = p.Options.filter((o) => !o.Advanced && !o.Hide);
  const required = opts.filter((o) => o.Required);
  const optional = opts.filter((o) => !o.Required);
  const oauth = p.Options.some((o) => o.Name === "token");
  const nameError = !NAME_RE.test(name) ? "Use letters, numbers, - and _ only." : taken.includes(name) || name === POOL ? "That name is taken." : "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (nameError) return;
    setStatus({ busy: true });
    try {
      await createAccount(name, p!.Name, Object.fromEntries(Object.entries(values).filter(([, v]) => v !== "")));
      await onDone(name);
    } catch (err) {
      await rc("config/delete", { name }).catch(() => {});
      setStatus({ error: (err as Error).message });
      return;
    }
    setStatus({});
    setP(undefined);
    setValues({});
  }

  function cancel() {
    // Stops rclone's sign-in server so the pending request returns and the half-made account is removed.
    if (status.busy) rc("config/oauthstop").catch(() => {});
    else onCancel();
  }

  const field = (o: Option) => (
    <label className="field" key={o.Name}>
      <span>{o.Name.replace(/_/g, " ")}{o.Required ? " *" : ""}</span>
      <input type={o.IsPassword ? "password" : "text"} required={o.Required} value={values[o.Name] ?? ""}
        placeholder={o.Default ? String(o.Default) : ""} onChange={(e) => setValues({ ...values, [o.Name]: e.target.value })} />
      <small className="muted small">{o.Help.split("\n")[0]}</small>
    </label>
  );

  return (
    <form className="dialog-body" onSubmit={submit}>
      <div className="row">
        <button type="button" className="icon-btn" aria-label="Back" disabled={status.busy} onClick={() => setP(undefined)}><ArrowLeft size={16} /></button>
        <Badge type={p.Name} />
        <h2 style={{ margin: 0 }}>{providerName(p.Name)}</h2>
      </div>
      <label className="field">
        <span>Account name *</span>
        <input value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!nameError} disabled={status.busy} />
        {nameError && <small className="error small">{nameError}</small>}
      </label>
      {required.map(field)}
      {oauth && <p className="banner small">A browser window will open so you can sign in. DriveMerge never sees your password.</p>}
      {authUrl && <p className="small muted">Browser didn't open? <a href={authUrl} onClick={(e) => { e.preventDefault(); import("@tauri-apps/plugin-opener").then((o) => o.openUrl(authUrl)); }}>Open the sign-in page</a></p>}
      {!!optional.length && (
        <details>
          <summary className="small muted" style={{ cursor: "pointer" }}>{oauth ? "Advanced: use my own API credentials and options" : "More options"}</summary>
          <div className="dialog-body" style={{ marginTop: 12 }}>{optional.map(field)}</div>
        </details>
      )}
      {status.error && <p className="error small">{status.error}</p>}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn" onClick={cancel}>{status.busy && oauth ? "Cancel sign-in" : "Cancel"}</button>
        <button className="btn primary" disabled={status.busy || !!nameError}>
          {status.busy ? <><Loader2 size={15} className="spin" /> {oauth ? "Waiting for sign-in…" : "Connecting…"}</> : oauth ? "Sign in" : "Add account"}
        </button>
      </div>
    </form>
  );
}

const rank = (p: Provider) => (POPULAR.indexOf(p.Name) + 1 || 99);
