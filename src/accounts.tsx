import { useEffect, useState } from "react";
import { Server } from "./icons";
import { siBox, siDropbox, siFilen, siGoogledrive, siMega, siProtondrive, type SimpleIcon } from "simple-icons";
import { inTauri, rc, useRc } from "./rc";
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
export function useAccounts() {
  const { data, error, reload, loading } = useRc<Config>("config/dump");
  const accounts = Object.entries(data ?? {})
    .filter(([name]) => name !== POOL)
    .map(([name, cfg]) => ({ name, type: cfg.type, oauth: "token" in cfg }));
  return { accounts, pool: data?.[POOL], error, reload, loading };
}

/** `version` re-fetches when it changes, e.g. the pool's upstreams. */
export function useAbout(fs: string | undefined, version?: string) {
  const [about, setAbout] = useState<About & { error?: string }>();
  useEffect(() => {
    if (!fs) return;
    rc<About>("operations/about", { fs }).then(setAbout, (e) => setAbout({ error: e.message }));
  }, [fs, version]);
  return about;
}

export function Usage({ fs }: { fs: string }) {
  const a = useAbout(fs);
  if (!a) return <span className="small muted">Checking space…</span>;
  if (a.error) return needsSignIn(a.error)
    ? <span className="chip error" title={a.error}>Needs sign-in</span>
    : <span className="small error" title={a.error}>Couldn't read space</span>;
  const pct = a.total ? ((a.used ?? 0) / a.total) * 100 : 0;
  return (
    <div style={{ width: 180 }}>
      <div className="bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${pct}%` }} /></div>
      <div className="small muted" style={{ marginTop: 4 }}>{formatBytes(a.used)} of {formatBytes(a.total)}</div>
    </div>
  );
}

/** Creates, updates or removes the union remote so it matches the given upstreams. */
export async function savePool(pool: Record<string, string> | undefined, upstreams: string, policy?: string) {
  await writePool(pool, upstreams, policy);
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

type Option = { Name: string; Help?: string; Default: unknown; Examples?: { Value: string }[] };
type OutState = { State?: string; Option?: Option; Error?: string };
const SETUP_OPT = { nonInteractive: true, obscure: true };

/** Walks rclone's setup questions using their defaults; the OAuth step opens the browser and waits for sign-in. */
async function answerQuestions(name: string, out: OutState) {
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
      result = options[0] ?? "";
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

export async function createAccount(name: string, type: string, parameters: Record<string, string>) {
  if (type === "drive" && GOOGLE_ID && !parameters.client_id) parameters = { ...parameters, client_id: GOOGLE_ID, client_secret: GOOGLE_SECRET ?? "" };
  await answerQuestions(name, await rc<OutState>("config/create", { name, type, parameters, opt: SETUP_OPT }));
}

/** Signs in again, keeping the account's name and settings. */
export async function reconnectAccount(name: string) {
  await answerQuestions(name, await rc<OutState>("config/update", { name, parameters: {}, opt: SETUP_OPT }));
  await rc("fscache/clear");
}

/** rclone has no rename: copy the saved settings (sign-in token included) to the new name, then remove the old one. */
export async function renameAccount(pool: Record<string, string> | undefined, from: string, to: string) {
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
