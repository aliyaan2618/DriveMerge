import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Cloud, Database, ExternalLink, Layers, Loader2, Pencil, Plus, RotateCw, Search, Trash2 } from "../icons";
import { PageHeader, Stat } from "../ui";
import { ask, askText, tell } from "../dialogs";
import { inTauri, rc } from "../rc";
import { invoke } from "@tauri-apps/api/core";
import { Badge, Usage, accountsChanged, createAccount, providerName, reconnectAccount, renameAccount, savePool, setInPool, useAbout, useAccounts, type About } from "../accounts";
import { NAME_RE, POLICIES, POOL, formatBytes, toggleUpstream, upstreams } from "../lib";

type Option = { Name: string; Help: string; Required: boolean; Advanced: boolean; Hide: number; IsPassword: boolean; Default: unknown; Provider?: string; Examples?: { Value: string; Help: string }[] };
type Provider = { Name: string; Description: string; Options: Option[] };

// Wrapper and local-only backends: not cloud accounts.
const HIDDEN = new Set(["alias", "cache", "chunker", "combine", "compress", "crypt", "hasher", "union", "local", "memory", "tardigrade", "uptobox", "archive"]);
const POPULAR = ["drive", "onedrive", "dropbox", "mega", "box", "pcloud", "sftp", "webdav"];

// Friendly labels for rclone's option names (per service where they differ).
const LABELS: Record<string, string> = {
  user: "Email", username: "Email or username", email: "Email", pass: "Password", password: "Password",
  "2fa": "2FA code", mailbox_password: "Mailbox password", otp_secret_key: "2FA secret key", api_key: "API key", host: "Server", port: "Port", url: "Server URL", endpoint: "Server address", provider: "Service",
};
const LABELS_BY_TYPE: Record<string, Record<string, string>> = {
  koofr: { password: "App password" }, sftp: { user: "Username" }, ftp: { user: "Username" }, webdav: { user: "Username" }, smb: { user: "Username" },
};
const HINTS: Record<string, string> = {
  "2fa": "Only if two-step verification is on. Enter the current 6-digit code.",
  mailbox_password: "Only if your Proton account uses two passwords (a separate mailbox password).",
  otp_secret_key: "Optional: the secret behind your 2FA codes, so DriveMerge can sign in again by itself later.",
};
// Optional fields worth showing up front instead of under "More options".
const PROMOTE = new Set(["2fa"]);
// Advanced options some people need, shown under "More options" (e.g. Proton's two-password accounts).
const ALSO_SHOW = new Set(["mailbox_password"]);

/** Why this service asks for a password here, and anything special it needs. */
// Official web sign-in pages of services that need an email and password typed into DriveMerge.
const SIGNIN_PAGES: Record<string, string> = {
  mega: "https://mega.nz/login",
  protondrive: "https://account.proton.me/login",
  koofr: "https://app.koofr.net/login",
  filen: "https://app.filen.io/#/login",
};
const openExternal = (url: string) => import("@tauri-apps/plugin-opener").then((o) => o.openUrl(url)).catch(() => window.open(url));

function SignInNote({ type }: { type: string }) {
  const page = SIGNIN_PAGES[type];
  return (
    <>
      <SignInText type={type} />
      {page && (
        <div className="row wrap" style={{ gap: 10, marginTop: -6 }}>
          <button type="button" className="btn" onClick={() => openExternal(page)}><ExternalLink size={15} /> Open {providerName(type)} sign-in page</button>
          <span className="small muted">To check your details or 2FA code, or to create a free account first.</span>
        </div>
      )}
    </>
  );
}

function SignInText({ type }: { type: string }) {
  const link = (url: string, text: string) => (
    <a href={url} onClick={(e) => { e.preventDefault(); openExternal(url); }}>{text}</a>
  );
  switch (type) {
    case "mega": return <p className="banner small">MEGA doesn't offer browser sign-in to other apps (your password also unlocks your encrypted files), so enter your MEGA email and password here.</p>;
    case "protondrive": return (
      <>
        <p className="banner warn small"><strong>Proton Drive isn't working with DriveMerge right now.</strong> Proton changed how its servers answer, and the current rclone engine can't connect safely yet. You can add it, but its files won't show until an update fixes this.</p>
        <p className="banner small">Proton doesn't offer browser sign-in to other apps (your password also unlocks your encrypted files), so enter your Proton email and password here.</p>
      </>
    );
    case "koofr": return <p className="banner small">Koofr needs an <strong>app password</strong>, not your normal one. Create it at {link("https://app.koofr.net/app/admin/preferences/password", "Koofr → Preferences → Password")}, then paste it below.</p>;
    case "filen": return <p className="banner small">Filen needs an <strong>API key</strong>: install the {link("https://github.com/FilenCloudDienste/filen-cli", "Filen CLI")}, sign in with it, run <code>filen export-api-key</code> and paste the key below.</p>;
    default: return null;
  }
}

/** rclone marks some options as belonging to certain sub-services ("koofr", "!other", "a,b"). */
const appliesTo = (o: Option, provider: string) => !o.Provider || o.Provider.split(",").some((x) => (x.startsWith("!") ? x.slice(1) !== provider : x === provider));

// Add account is one dialog for the whole app (mounted once in App), so any page can open it and stay put.
let openAdd: ((provider?: string) => void) | undefined;
/** Opens Add account, optionally straight on one service (e.g. "mega"). */
export const addAccount = (provider?: string) => openAdd?.(provider);

export function AddAccountHost() {
  const { accounts, pool } = useAccounts();
  const ref = useRef<HTMLDialogElement>(null);
  const [initial, setInitial] = useState<string>();
  const [round, setRound] = useState(0); // fresh form each time it opens
  useEffect(() => {
    openAdd = (provider) => { setInitial(provider); setRound((r) => r + 1); ref.current?.showModal(); };
    return () => { openAdd = undefined; };
  }, []);
  return (
    <dialog ref={ref} aria-label="Add account" onClose={() => { setInitial(undefined); accountsChanged(); }}>
      <AddAccount key={round} initial={initial} taken={accounts.map((a) => a.name)} onDone={async (name) => {
        await setInPool(pool, name, true);
        ref.current?.close();
      }} onCancel={() => ref.current?.close()} />
    </dialog>
  );
}

export default function Accounts() {
  const { accounts, pool, reload, error } = useAccounts();
  const poolAbout = useAbout(pool ? `${POOL}:` : undefined, pool?.upstreams);
  const inPool = upstreams(pool?.upstreams);
  const [busy, setBusy] = useState("");
  const [key, setKey] = useState(0); // remounts usage bars after a reconnect
  const taken = accounts.map((a) => a.name);

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
        <button className="btn primary" onClick={() => addAccount()}><Plus size={16} /> Add account</button>
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
                <td>{busy === `reconnect ${a.name}` ? <span className="small muted row"><Loader2 size={14} className="spin" /> Waiting for sign-in…</span> : <Usage key={key} fs={`${a.name}:`} type={a.type} />}</td>
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
    const poll = () => inTauri
      ? invoke<string | null>("authorize_url").then((u) => setAuthUrl(u ?? ""), () => {})
      : rc<{ status: string; authUrl?: string }>("config/oauthstatus").then((s) => setAuthUrl(s.authUrl ?? ""), () => {});
    const t = setInterval(poll, 2000);
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

  const providerOpt = p.Options.find((o) => o.Name === "provider" && o.Examples?.length);
  const provider = values.provider ?? providerOpt?.Examples?.[0]?.Value ?? "";
  const opts = p.Options.filter((o) => (!o.Advanced || ALSO_SHOW.has(o.Name)) && !o.Hide && o.Name !== "provider" && appliesTo(o, provider));
  const required = opts.filter((o) => o.Required || PROMOTE.has(o.Name));
  const optional = opts.filter((o) => !o.Required && !PROMOTE.has(o.Name));
  const oauth = p.Options.some((o) => o.Name === "token");
  const hasPassword = opts.some((o) => o.IsPassword);
  const nameError = !NAME_RE.test(name) ? "Use letters, numbers, - and _ only." : taken.includes(name) || name === POOL ? "That name is taken." : "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (nameError) return;
    setStatus({ busy: true });
    try {
      const params = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ""));
      if (providerOpt) params.provider = provider;
      await createAccount(name, p!.Name, params);
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
    if (status.busy) (inTauri ? invoke("cancel_authorize") : rc("config/oauthstop")).catch(() => {});
    else onCancel();
  }

  const label = (n: string) => LABELS_BY_TYPE[p.Name]?.[n] ?? LABELS[n] ?? n.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  const field = (o: Option) => (
    <label className="field" key={o.Name}>
      <span>{label(o.Name)}{o.Required ? " *" : ""}</span>
      <input type={o.IsPassword ? "password" : "text"} required={o.Required} value={values[o.Name] ?? ""}
        autoComplete={o.IsPassword ? "current-password" : o.Name === "2fa" ? "one-time-code" : undefined}
        inputMode={o.Name === "2fa" ? "numeric" : undefined}
        placeholder={o.Default ? String(o.Default) : ""} onChange={(e) => setValues({ ...values, [o.Name]: e.target.value })} />
      {(HINTS[o.Name] || !LABELS[o.Name]) && <small className="muted small">{HINTS[o.Name] ?? o.Help.split("\n")[0]}</small>}
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
      <SignInNote type={p.Name} />
      {providerOpt && (providerOpt.Examples?.length ?? 0) > 1 && (
        <label className="field">
          <span>{label("provider")}</span>
          <select value={provider} onChange={(e) => setValues({ ...values, provider: e.target.value })}>
            {providerOpt.Examples!.map((x) => <option key={x.Value} value={x.Value}>{x.Help.split("\n")[0] || x.Value}</option>)}
          </select>
        </label>
      )}
      {required.map(field)}
      {oauth && <p className="banner small">Your browser opens {providerName(p.Name)}'s own sign-in page. Sign in there and click Allow; DriveMerge comes back to the front when you're done. DriveMerge never sees your password.</p>}
      {!oauth && hasPassword && <p className="small muted">Your password is stored scrambled on this PC and only sent to {providerName(p.Name)}.</p>}
      {authUrl && <p className="small muted">Browser didn't open? <a href={authUrl} onClick={(e) => { e.preventDefault(); import("@tauri-apps/plugin-opener").then((o) => o.openUrl(authUrl)); }}>Open the sign-in page</a></p>}
      {!!optional.length && (
        <details>
          <summary className="small muted" style={{ cursor: "pointer" }}>{oauth ? "Advanced: use my own API credentials and options" : "More options"}</summary>
          <div className="dialog-body" style={{ marginTop: 12 }}>{optional.map(field)}</div>
        </details>
      )}
      {status.error && (
        <div className="banner warn small" role="alert">
          <p>{friendlyError(status.error, providerName(p.Name))}</p>
          <details style={{ marginTop: 6 }}>
            <summary style={{ cursor: "pointer" }} className="muted">Show details</summary>
            <p className="mono" style={{ marginTop: 6, wordBreak: "break-word", fontSize: 11 }}>{status.error}</p>
          </details>
        </div>
      )}
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

/** A plain-language first line for rclone's setup errors; the raw text stays under "Show details". */
function friendlyError(raw: string, service: string) {
  if (/cancelled|didn't finish/i.test(raw)) return "Sign-in was cancelled. Click Sign in to try again.";
  if (/couldn't decrypt|incorrect password|login failed|wrong password|401|403|unauthori[sz]ed|forbidden/i.test(raw))
    return `${service} didn't accept those details. Check the email and password (and 2FA code, if you use one).`;
  if (/timeout|timed out|no such host|connection refused|network/i.test(raw)) return `Couldn't reach ${service}. Check your internet connection and try again.`;
  if (/failed to query root|objecthandle|drive/i.test(raw)) return `Signed in, but ${service} wouldn't open your drive. Try again in a minute; if it keeps happening, sign in at ${service}'s website once first.`;
  return `Couldn't finish setting up ${service}.`;
}
