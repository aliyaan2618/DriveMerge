import { useEffect, useState } from "react";
import { Server } from "./icons";
import { siBox, siDropbox, siFilen, siGoogledrive, siMega, siProtondrive, type SimpleIcon } from "simple-icons";
import { inTauri, rc, useRc } from "./rc";
import { askText, tell } from "./dialogs";
import { invoke } from "@tauri-apps/api/core";
import { POOL, formatBytes, toggleUpstream, upstreams as upstreamList, authorizeArgs } from "./lib";

export type Config = Record<string, Record<string, string>>;
export type About = { total?: number; used?: number; free?: number };

const NAMES: Record<string, string> = {
  drive: "Google Drive", onedrive: "OneDrive", dropbox: "Dropbox", mega: "MEGA", box: "Box", pcloud: "pCloud", koofr: "Koofr", filen: "Filen", jottacloud: "Jottacloud", protondrive: "Proton Drive",
  sftp: "SFTP", webdav: "WebDAV", s3: "S3", ftp: "FTP", alias: "Folder", local: "Local",
};
export const providerName = (type: string) => NAMES[type] ?? type;

// Brand logos (Simple Icons, CC0). Services it doesn't cover get a lettered circle in the brand colour, if known.
const LOGOS: Record<string, SimpleIcon> = { mega: siMega, drive: siGoogledrive, box: siBox, filen: siFilen, protondrive: siProtondrive, dropbox: siDropbox };
const BRAND: Record<string, string> = { onedrive: "#0078D4", pcloud: "#17BED0" };
const SERVERS = new Set(["sftp", "ftp", "webdav", "smb", "s3", "http", "seafile", "swift"]);

export function Badge({ type }: { type: string }) {
  const logo = LOGOS[type];
  if (logo)
    return (
      <span className="badge logo" aria-hidden>
        <svg viewBox="0 0 24 24" width="18" height="18"><path d={logo.path} fill={logo.hex === "000000" ? "var(--text)" : `#${logo.hex}`} /></svg>
      </span>
    );
  if (SERVERS.has(type)) return <span className="badge logo" aria-hidden><Server size={17} color="var(--muted)" /></span>;
  return <span className="badge" style={{ background: BRAND[type] ?? "#64748b" }} aria-hidden>{providerName(type).slice(0, 2).toUpperCase()}</span>;
}

/** All configured accounts (everything except the pool itself) plus the pool's own config. */
const ACCOUNTS_CHANGED = "drivemerge:accounts-changed";
/** Tells every useAccounts() to reload (e.g. after the Add account dialog closes). */
export const accountsChanged = () => window.dispatchEvent(new Event(ACCOUNTS_CHANGED));

export function useAccounts() {
  const { data, error, reload, loading } = useRc<Config>("config/dump");
  useEffect(() => {
    const fn = () => void reload();
    window.addEventListener(ACCOUNTS_CHANGED, fn);
    return () => window.removeEventListener(ACCOUNTS_CHANGED, fn);
  }, [reload]);
  const accounts = Object.entries(data ?? {})
    .filter(([name]) => name !== POOL)
    .map(([name, cfg]) => ({ name, type: cfg.type, oauth: "token" in cfg }));
  return { accounts, pool: data?.[POOL], error, reload, loading };
}

export type Space = About & { error?: string };

// Storage space per remote, shared by every page. Fresh results are reused for a minute; errors that
// mean "stop asking" (rejected sign-in, lock-outs, rate limits) pause that account for 10 minutes so
// DriveMerge doesn't keep sending failed logins.
const spaceCache = new Map<string, { value: Space; at: number }>();
const inflight = new Map<string, Promise<Space>>();
const FRESH_MS = 60_000;
const PAUSE_MS = 10 * 60_000;
export const shouldPause = (error = "") => needsSignIn(error) || /429|too many|login retries|rate.?limit|captcha|human verification/i.test(error);
export const cachedSpace = (fs: string) => spaceCache.get(fs)?.value;

/** The error an account is paused for, if it's still paused. */
export function pausedError(fs: string) {
  const c = spaceCache.get(fs);
  return c?.value.error && shouldPause(c.value.error) && Date.now() - c.at < PAUSE_MS ? c.value.error : undefined;
}
/** Records a failure seen elsewhere (e.g. listing) so the account is paused too. */
export function notePause(fs: string, error: string) {
  if (shouldPause(error)) spaceCache.set(fs, { value: { error }, at: Date.now() });
}
/** Forgets cached space (and any pause) for a remote name, or everything. */
export function forgetSpace(name?: string) {
  for (const k of [...spaceCache.keys()]) if (!name || k === `${name}:`) spaceCache.delete(k);
}

export function getSpace(fs: string): Promise<Space> {
  const c = spaceCache.get(fs);
  const maxAge = c?.value.error ? (shouldPause(c.value.error) ? PAUSE_MS : 0) : FRESH_MS;
  if (c && Date.now() - c.at < maxAge) return Promise.resolve(c.value);
  let p = inflight.get(fs);
  if (!p) {
    p = rc<About>("operations/about", { fs }).then((v): Space => v, (e): Space => ({ error: e.message })).then((v) => {
      spaceCache.set(fs, { value: v, at: Date.now() });
      inflight.delete(fs);
      return v;
    });
    inflight.set(fs, p);
  }
  return p;
}

/** `version` re-fetches when it changes, e.g. the pool's upstreams. */
export function useAbout(fs: string | undefined, version?: string) {
  const [about, setAbout] = useState<Space | undefined>(() => (fs ? cachedSpace(fs) : undefined));
  useEffect(() => {
    if (!fs) return;
    let live = true;
    getSpace(fs).then((v) => live && setAbout(v));
    return () => { live = false; };
  }, [fs, version]);
  return about;
}

/** Plain-language reason an account's storage space couldn't be read, and what to do. */
export function spaceProblem(error: string, service: string): { label: string; explain: string; soft?: boolean } {
  if (/not supported|doesn't support|can't get usage|unsupported/i.test(error))
    return { label: "Space not reported", soft: true, explain: `${service} doesn't tell other apps how much space is used or free. Your files still work; the account just doesn't count towards the pool's totals.` };
  if (/login retries|too many login/i.test(error))
    return { label: "Sign-in blocked", explain: `${service} has temporarily blocked sign-ins to this account after several failed attempts. That usually means the password was wrong${service === "Koofr" ? " (Koofr needs an app password from Koofr → Preferences → Password, not your normal password)" : ""}. DriveMerge has paused this account for 10 minutes so it doesn't add more failed attempts. Wait a while, then remove the account and add it again with the right password.` };
  if (/refusing to follow HTTPS to HTTP redirect/i.test(error))
    return { label: "Not working right now", explain: `${service} changed how its servers answer, and the current rclone (the engine DriveMerge uses) can't follow it safely: it would have to send your sign-in over an unencrypted connection, which DriveMerge won't do. This needs a fix in rclone; it should work again after an update. Your account and files are fine.` };
  if (/human verification|captcha|9001|\b422\b/i.test(error))
    return { label: "Needs verification", explain: `${service} asked for a human-verification check (a CAPTCHA) that DriveMerge can't show. Sign in once at ${service}'s website in your browser on this PC, wait a few minutes, then click ↻ (Sign in again) next to the account on the Accounts page. If it keeps happening, remove the account and add it again.` };
  if (/mailbox password|two.password|second password/i.test(error))
    return { label: "Needs mailbox password", explain: `This ${service} account uses a second "mailbox password". Remove the account, add it again, and fill in Mailbox password under More options.` };
  if (needsSignIn(error))
    return { label: "Needs sign-in", explain: `The sign-in for this ${service} account has expired or was revoked. Click ↻ (Sign in again) next to it on the Accounts page.` };
  if (/2fa|two.factor|otp/i.test(error))
    return { label: "Needs 2FA code", explain: `${service} wants a current two-step verification code. Remove the account and add it again with the 2FA code filled in.` };
  if (/timeout|timed out|no such host|connection refused|network/i.test(error))
    return { label: "Couldn't connect", explain: `Couldn't reach ${service}. Check your internet connection; DriveMerge will try again next time.` };
  return { label: "Couldn't read space", explain: `${service} didn't answer the request for its storage space.` };
}

/** Short status for an account whose space couldn't be read; click it for the reason and the raw error. */
export function SpaceError({ error, type }: { error: string; type: string }) {
  const p = spaceProblem(error, providerName(type));
  return (
    <button type="button" className={`linkish small ${p.soft ? "muted" : "error"}`} title="Show why"
      onClick={() => tell(p.label, `${p.explain}\n\nDetails: ${error}`)}>
      {p.label}
    </button>
  );
}

export function Usage({ fs, type = "" }: { fs: string; type?: string }) {
  const a = useAbout(fs);
  if (!a) return <span className="small muted">Checking space…</span>;
  if (a.error) return <SpaceError error={a.error} type={type} />;
  const pct = a.total ? ((a.used ?? 0) / a.total) * 100 : 0;
  return (
    <div style={{ width: 180 }}>
      <div className="bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${pct}%` }} /></div>
      <div className="small muted num" style={{ marginTop: 4 }}>{formatBytes(a.used)} of {formatBytes(a.total)}</div>
    </div>
  );
}

/** Creates, updates or removes the union remote so it matches the given upstreams. */
export async function savePool(pool: Record<string, string> | undefined, upstreams: string, policy?: string) {
  await writePool(pool, upstreams, policy);
  forgetSpace(POOL);
  // rclone caches the pool's file system; without this it keeps serving the old set of accounts.
  await rc("fscache/clear");
}

async function writePool(pool: Record<string, string> | undefined, upstreams: string, policy?: string) {
  if (!upstreams) return pool && rc("config/delete", { name: POOL });
  const list = upstreamList(upstreams);
  // rclone's union refuses a single upstream, so a one-account pool is an alias to that account.
  // `upstreams` is kept in both cases so the UI can read the pool's members back.
  const type = list.length > 1 ? "union" : "alias";
  const parameters = { upstreams, create_policy: policy ?? pool?.create_policy ?? "mfs", remote: list[0] };
  const opt = { nonInteractive: true };
  if (pool?.type === type) return rc("config/update", { name: POOL, parameters, opt });
  if (pool) await rc("config/delete", { name: POOL });
  return rc("config/create", { name: POOL, type, parameters, opt });
}

export const setInPool = (pool: Record<string, string> | undefined, name: string, on: boolean) =>
  savePool(pool, toggleUpstream(pool?.upstreams, name, on));

type Option = { Name: string; Help?: string; Default: unknown; Required?: boolean; Examples?: { Value: string }[] };
type OutState = { State?: string; Option?: Option; Error?: string };
const SETUP_OPT = { nonInteractive: true, obscure: true };

/** Walks rclone's setup questions using their defaults; the OAuth step opens the browser and waits for sign-in. */
/** `answers` are values the user gave in the form for rclone's setup questions, by question name (e.g. config_login_token). */
async function answerQuestions(name: string, out: OutState, answers: Record<string, string> = {}) {
  // The last multiple-choice answer, so a choice rclone rejects (e.g. an unusable OneDrive drive) can be retried with the next option.
  let choice: { state: string; left: string[] } | undefined;
  // rclone reports a rejected answer either in the reply or as an HTTP error; treat both the same.
  const step = (state: string, result: string) =>
    rc<OutState>("config/update", { name, parameters: {}, opt: { ...SETUP_OPT, continue: true, state, result } }).catch((e): OutState => ({ Error: (e as Error).message }));
  for (let i = 0; (out.State || out.Error) && i < 20; i++) {
    if (out.Error) {
      const next = choice?.left.shift();
      if (!choice || next === undefined) throw new Error(out.Error);
      out = await step(choice.state, next);
      continue;
    }
    const o = out.Option;
    const options = [...new Set([o?.Default, ...(o?.Examples ?? []).map((e) => e.Value)].filter((v) => v != null && v !== "").map(String))];
    choice = options.length > 1 && out.State ? { state: out.State, left: options.slice(1) } : undefined;
    // shortcut: rclone's shared Google client_id is being retired in 2026; we accept it when the user gave no client_id. Ship our own client_id before release.
    let result: string;
    if (o?.Name === "config_is_local") {
      // In the desktop app, sign in through `rclone authorize` (DriveMerge's success page, app comes back to front).
      result = inTauri ? "false" : "true";
    } else if (o?.Name === "config_token") {
      result = await invoke<string>("authorize", { args: authorizeArgs(o.Help ?? "") });
    } else if (o?.Name === "config_shared_client_id") {
      result = "true";
    } else {
      result = answers[o?.Name ?? ""] ?? options[0] ?? "";
      // A required question DriveMerge can't answer by itself: ask the user rather than send an empty answer.
      if (!result && o?.Required) {
        const typed = await askText({ title: "One more detail", message: (o.Help ?? "").trim(), label: o.Name.replace(/^config_/, "").replace(/_/g, " "), confirm: "Continue" });
        if (typed === null) throw new Error("Setup was cancelled.");
        result = typed;
      }
    }
    // Only automatic picks are worth retrying; sign-in and yes/no answers above are not choices.
    if (o?.Name === "config_token" || o?.Name === "config_is_local" || o?.Name === "config_shared_client_id") choice = undefined;
    out = await step(out.State!, result);
  }
  if (out.Error) throw new Error(out.Error);
}

// DriveMerge's own Google login, baked in at build time (GitHub secrets). A desktop app's client secret
// is not confidential per Google's docs for installed apps; it only identifies the app.
const GOOGLE_ID = import.meta.env.VITE_GDRIVE_CLIENT_ID as string | undefined;
const GOOGLE_SECRET = import.meta.env.VITE_GDRIVE_CLIENT_SECRET as string | undefined;

export async function createAccount(name: string, type: string, parameters: Record<string, string>, answers?: Record<string, string>) {
  if (type === "drive" && GOOGLE_ID && !parameters.client_id) parameters = { ...parameters, client_id: GOOGLE_ID, client_secret: GOOGLE_SECRET ?? "" };
  await answerQuestions(name, await rc<OutState>("config/create", { name, type, parameters, opt: SETUP_OPT }), answers);
}

/** Signs in again, keeping the account's name and settings. */
export async function reconnectAccount(name: string) {
  forgetSpace(name);
  await answerQuestions(name, await rc<OutState>("config/update", { name, parameters: {}, opt: SETUP_OPT }));
  await rc("fscache/clear");
}

/** rclone has no rename: copy the saved settings (sign-in token included) to the new name, then remove the old one. */
export async function renameAccount(pool: Record<string, string> | undefined, from: string, to: string) {
  forgetSpace(from);
  const { type, ...parameters } = await rc<Record<string, string>>("config/get", { name: from });
  // nonInteractive returns the first setup question without running it; the settings are already saved by then.
  await rc("config/create", { name: to, type, parameters, opt: { nonInteractive: true, noObscure: true } });
  const saved = await rc<Record<string, string>>("config/get", { name: to });
  if (saved.type !== type) throw new Error("Rename failed: the new account wasn't saved.");
  const members = upstreamList(pool?.upstreams);
  if (members.includes(`${from}:`)) await savePool(pool, members.map((u) => (u === `${from}:` ? `${to}:` : u)).join(" "));
  await rc("config/delete", { name: from });
  await rc("fscache/clear");
}

/** True when an rclone error means the account's sign-in expired or was revoked. */
export const needsSignIn = (error = "") => /token|reconnect|oauth|invalid_grant|unauthori[sz]ed|401/i.test(error);
