import { useEffect, useRef, useState } from "react";
import { appCacheDir, downloadDir, join } from "@tauri-apps/api/path";
import { ChevronRight, Copy, Download, Play, ExternalLink, File, Folder, FolderInput, FolderPlus, Link, Loader2, Pencil, RefreshCw, Search, Trash2, Upload, X } from "../icons";
import type { PageProps } from "../App";
import { inTauri, rc, upload, useRc } from "../rc";
import { useAccounts } from "../accounts";
import { PageHeader } from "../ui";
import { MEDIA, PLAYABLE, streamUrl } from "../stream";
import { POOL, formatBytes, joinPath, upstreams } from "../lib";

type Item = { Path: string; Name: string; Size: number; ModTime: string; IsDir: boolean };
type View = { kind: "browse" } | { kind: "search"; q: string } | { kind: "dupes" };
const FS = `${POOL}:`;
const accountOf = (upstream: string) => upstream.replace(/:$/, "");

export default function Files({ go }: PageProps) {
  const { pool, loading } = useAccounts();
  const members = upstreams(pool?.upstreams).map(accountOf);
  const isUnion = members.length > 1;
  const [path, setPath] = useState("");
  const [view, setView] = useState<View>({ kind: "browse" });
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const [drag, setDrag] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moving, setMoving] = useState<Item[]>();
  const [playing, setPlaying] = useState<{ item: Item; url: string; error?: string }>();
  const playDialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const moveDialog = useRef<HTMLDialogElement>(null);
  const listing = useRc<{ list: Item[] }>("operations/list", { fs: FS, remote: path });
  const sources = useSources(isUnion ? members : [], path, listing.data);
  const [found, setFound] = useState<{ items?: Item[]; error?: string }>();

  useEffect(() => setSelected(new Set()), [path, view]);

  useEffect(() => {
    if (view.kind === "browse") return;
    setFound(undefined);
    const params = view.kind === "search"
      ? { fs: FS, remote: "", opt: { recurse: true }, _filter: { IncludeRule: [`*${view.q}*`], IgnoreCase: true } }
      : { fs: FS, remote: "", opt: { recurse: true, filesOnly: true } };
    rc<{ list: Item[] }>("operations/list", params).then(({ list }) => {
      if (view.kind === "search") {
        // Folders are always listed while recursing; keep only the ones whose own name matches.
        const q = view.q.toLowerCase();
        setFound({ items: list.filter((i) => !i.IsDir || i.Name.toLowerCase().includes(q)) });
      } else setFound({ items: duplicates(list) });
    }, (e) => setFound({ error: e.message }));
  }, [view]);

  if (!loading && !pool)
    return (
      <div className="card center" style={{ padding: 56 }}>
        <h2>No pool yet</h2>
        <p className="muted">Add an account and include it in your pool to start storing files.</p>
        <button className="btn primary" onClick={() => go("accounts")}>Go to Accounts</button>
      </div>
    );

  const refresh = () => (view.kind === "browse" ? listing.reload() : setView({ ...view }));

  async function run(msg: string, fn: () => Promise<unknown>, done?: string) {
    setToast(msg);
    try {
      await fn();
      setToast(done ?? "");
      if (done) setTimeout(() => setToast(""), 3500);
    } catch (e) {
      setToast("");
      alert((e as Error).message);
    }
    refresh();
  }

  /** Accounts that hold this path (for share links and moves between accounts). */
  async function locate(p: string) {
    if (!isUnion) return members;
    const hits = await Promise.all(members.map((a) => rc<{ item: Item | null }>("operations/stat", { fs: `${a}:`, remote: p }).then((r) => (r.item ? a : ""), () => "")));
    return hits.filter(Boolean);
  }

  const doUpload = (files: FileList | null) =>
    files?.length && run(`Uploading ${files.length} file${files.length > 1 ? "s" : ""}…`, () => upload(FS, path, files), "Upload finished");

  async function download(items: Item[]) {
    if (!inTauri) return alert("Downloads work in the desktop app.");
    const dir = await downloadDir();
    await run("Starting download…", () => Promise.all(items.map((it) =>
      it.IsDir
        ? rc("sync/copy", { srcFs: `${FS}${it.Path}`, dstFs: `${dir}/${it.Name}`, _async: true })
        : rc("operations/copyfile", { srcFs: FS, srcRemote: it.Path, dstFs: dir, dstRemote: it.Name, _async: true }))),
      `Downloading to ${dir}. Progress is in Activity.`);
  }

  async function open(it: Item) {
    if (it.IsDir) return view.kind === "browse" ? setPath(it.Path) : (setView({ kind: "browse" }), setPath(it.Path));
    if (!inTauri) return alert("Opening files works in the desktop app.");
    await run(`Opening ${it.Name}…`, async () => {
      // Downloads into the app's cache folder, then opens with the program Windows uses for that file type.
      const dir = await join(await appCacheDir(), "open");
      await rc("operations/copyfile", { srcFs: FS, srcRemote: it.Path, dstFs: dir, dstRemote: it.Name });
      const { openPath } = await import("@tauri-apps/plugin-opener");
      await openPath(await join(dir, it.Name));
    });
  }

  async function share(it: Item) {
    await run("Creating link…", async () => {
      const [account] = await locate(it.Path);
      if (!account) throw new Error("Couldn't find which account holds this file.");
      const { url } = await rc<{ url: string }>("operations/publiclink", { fs: `${account}:`, remote: it.Path });
      await navigator.clipboard.writeText(url);
    }, "Link copied. Anyone with the link can download this.");
  }

  function rename(it: Item) {
    const name = prompt("New name", it.Name)?.trim();
    if (!name || name === it.Name) return;
    if (/[\\/]/.test(name)) return alert("Names can't contain / or \\.");
    const to = joinPath(it.Path.split("/").slice(0, -1).join("/"), name);
    run("Renaming…", () =>
      it.IsDir
        ? rc("sync/move", { srcFs: `${FS}${it.Path}`, dstFs: `${FS}${to}`, deleteEmptySrcDirs: true })
        : rc("operations/movefile", { srcFs: FS, srcRemote: it.Path, dstFs: FS, dstRemote: to }));
  }

  function remove(items: Item[]) {
    const what = items.length === 1 ? `"${items[0].Name}"${items[0].IsDir ? " and everything in it" : ""}` : `${items.length} items`;
    if (!confirm(`Delete ${what}? This can't be undone.`)) return;
    run("Deleting…", () => Promise.all(items.map((it) => rc(it.IsDir ? "operations/purge" : "operations/deletefile", { fs: FS, remote: it.Path }))));
  }

  function mkdir() {
    const name = prompt("Folder name")?.trim();
    if (name && !/[\\/]/.test(name)) run("Creating folder…", () => rc("operations/mkdir", { fs: FS, remote: joinPath(path, name) }));
  }

  const startMove = (items: Item[]) => { setMoving(items); moveDialog.current?.showModal(); };

  const crumbs = path ? path.split("/") : [];
  const items = view.kind === "browse"
    ? (listing.data?.list ?? []).filter((i) => i.Name.toLowerCase().includes(filter.toLowerCase())).sort(byName)
    : (found?.items ?? []);
  const loadingList = view.kind === "browse" ? !listing.data && !listing.error : !found;
  const error = view.kind === "browse" ? listing.error : found?.error;
  const chosen = items.filter((i) => selected.has(i.Path));
  const toggle = (p: string) => setSelected((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; });

  async function play(it: Item) {
    try {
      setPlaying({ item: it, url: await streamUrl(pool?.upstreams ?? "", it.Path) });
      playDialog.current?.showModal();
    } catch (e) { alert(`Couldn't start streaming: ${(e as Error).message}`); }
  }

  const actions = (it: Item) => (
    <div className="actions">
      {MEDIA.test(it.Name) && <button className="icon-btn" title="Play without downloading" aria-label={`Play ${it.Name}`} onClick={() => play(it)}><Play size={16} /></button>}
      {!it.IsDir && <button className="icon-btn" title="Open" aria-label={`Open ${it.Name}`} onClick={() => open(it)}><ExternalLink size={16} /></button>}
      <button className="icon-btn" title="Download" aria-label={`Download ${it.Name}`} onClick={() => download([it])}><Download size={16} /></button>
      {!it.IsDir && <button className="icon-btn" title="Copy share link" aria-label={`Copy share link for ${it.Name}`} onClick={() => share(it)}><Link size={16} /></button>}
      <button className="icon-btn" title="Move or copy" aria-label={`Move or copy ${it.Name}`} onClick={() => startMove([it])}><FolderInput size={16} /></button>
      <button className="icon-btn" title="Rename" aria-label={`Rename ${it.Name}`} onClick={() => rename(it)}><Pencil size={16} /></button>
      <button className="icon-btn" title="Delete" aria-label={`Delete ${it.Name}`} onClick={() => remove([it])}><Trash2 size={16} /></button>
    </div>
  );

  return (
    <>
      <PageHeader title="Files" sub={isUnion ? `Everything in your pool, across ${members.length} accounts.` : "Everything in your pool."}>
        <button className="btn" onClick={mkdir}><FolderPlus size={16} /> New folder</button>
        <button className="btn primary" onClick={() => input.current?.click()}><Upload size={16} /> Upload</button>
      </PageHeader>

      <div className="row wrap">
        <div className="seg" role="group" aria-label="View">
          <button aria-pressed={view.kind === "browse"} onClick={() => setView({ kind: "browse" })}>Browse</button>
          <button aria-pressed={view.kind === "dupes"} onClick={() => setView({ kind: "dupes" })}>Duplicates</button>
        </div>
        <form className="row grow" style={{ position: "relative", minWidth: 240 }} onSubmit={(e) => { e.preventDefault(); if (query.trim()) setView({ kind: "search", q: query.trim() }); }}>
          <Search size={15} style={{ position: "absolute", left: 10 }} className="muted" />
          <input placeholder="Search all files in your pool, then press Enter" aria-label="Search all files" value={query} onChange={(e) => setQuery(e.target.value)} style={{ paddingLeft: 32 }} />
        </form>
        <button className="icon-btn" title="Refresh" aria-label="Refresh" onClick={refresh}><RefreshCw size={16} /></button>
        <input ref={input} type="file" multiple hidden onChange={(e) => { doUpload(e.target.files); e.target.value = ""; }} />
      </div>

      <div className="row" style={{ minHeight: 34 }}>
        {view.kind === "browse" ? (
          <>
            <nav className="row grow small" aria-label="Folder path" style={{ gap: 4 }}>
              <button className="btn" style={{ border: 0, padding: "0 8px" }} onClick={() => setPath("")}>Pool</button>
              {crumbs.map((c, i) => (
                <span className="row" key={i} style={{ gap: 4 }}>
                  <ChevronRight size={14} className="muted" />
                  <button className="btn" style={{ border: 0, padding: "0 8px" }} onClick={() => setPath(crumbs.slice(0, i + 1).join("/"))}>{c}</button>
                </span>
              ))}
            </nav>
            <input placeholder="Filter this folder" aria-label="Filter this folder" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 200 }} />
          </>
        ) : (
          <p className="grow muted small">
            {view.kind === "search" ? `Results for "${view.q}" across all accounts` : "Files with the same name and size, grouped together"}
            {found?.items && ` · ${found.items.length} found`}
          </p>
        )}
        {view.kind !== "browse" && <button className="btn" onClick={() => setView({ kind: "browse" })}><X size={15} /> Close</button>}
      </div>

      {!!chosen.length && (
        <div className="card row" style={{ padding: "8px 16px" }}>
          <p className="grow small">{chosen.length} selected</p>
          <button className="btn" onClick={() => download(chosen)}><Download size={15} /> Download</button>
          <button className="btn" onClick={() => startMove(chosen)}><FolderInput size={15} /> Move or copy</button>
          <button className="btn danger" onClick={() => remove(chosen)}><Trash2 size={15} /> Delete</button>
          <button className="icon-btn" aria-label="Clear selection" onClick={() => setSelected(new Set())}><X size={16} /></button>
        </div>
      )}

      <section className={`card${drag ? " dropzone" : ""}`} style={{ padding: 0 }}
        onDragOver={(e) => { if (view.kind === "browse") { e.preventDefault(); setDrag(true); } }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); doUpload(e.dataTransfer.files); }}>
        {error ? <p className="error" style={{ padding: 20 }}>{error}</p> : loadingList ? (
          <p className="muted row" style={{ padding: 32, justifyContent: "center" }}><Loader2 size={16} className="spin" /> {view.kind === "browse" ? "Loading…" : "Scanning all accounts. Large pools can take a while…"}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" aria-label="Select all" checked={!!items.length && chosen.length === items.length}
                    onChange={(e) => setSelected(new Set(e.target.checked ? items.map((i) => i.Path) : []))} />
                </th>
                <th>Name</th>
                {isUnion && view.kind === "browse" && <th style={{ width: 160 }}>Stored in</th>}
                <th style={{ width: 100 }}>Size</th>
                <th style={{ width: 170 }}>Modified</th>
                <th style={{ width: 200 }}><span hidden>Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const groupStart = view.kind === "dupes" && i > 0 && dupeKey(items[i - 1]) !== dupeKey(it);
                return (
                  <tr key={`${i}:${it.Path}`} onDoubleClick={() => open(it)} style={groupStart ? { borderTop: "2px solid var(--border)" } : undefined}>
                    <td><input type="checkbox" aria-label={`Select ${it.Name}`} checked={selected.has(it.Path)} onChange={() => toggle(it.Path)} /></td>
                    <td>
                      <span className="row" style={{ gap: 10 }}>
                        {it.IsDir ? <Folder size={17} color="var(--accent)" /> : <File size={17} className="muted" />}
                        <span style={{ minWidth: 0 }}>
                          {it.IsDir ? <button className="nav" style={{ padding: 0, color: "var(--text)" }} onClick={() => open(it)}>{it.Name}</button> : <span>{it.Name}</span>}
                          {view.kind !== "browse" && <span className="small muted truncate" style={{ display: "block" }}>{it.Path.split("/").slice(0, -1).join("/") || "Pool"}</span>}
                        </span>
                      </span>
                    </td>
                    {isUnion && view.kind === "browse" && <td className="small muted truncate">{sources[it.Name]?.join(", ") ?? ""}</td>}
                    <td className="muted">{it.IsDir ? "—" : formatBytes(it.Size)}</td>
                    <td className="muted" style={{ whiteSpace: "nowrap" }}>{new Date(it.ModTime).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</td>
                    <td>{actions(it)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!loadingList && !error && !items.length && (
          <p className="muted" style={{ padding: 32, textAlign: "center" }}>
            {view.kind === "search" ? "No matches." : view.kind === "dupes" ? "No duplicates found." : filter ? "No matches." : "This folder is empty. Drop files here to upload."}
          </p>
        )}
      </section>

      <dialog ref={playDialog} aria-label="Player" onClose={() => setPlaying(undefined)} style={{ width: "min(960px, calc(100vw - 32px))" }}>
        {playing && (
          <div className="dialog-body">
            <div className="row between">
              <h2 className="truncate" style={{ margin: 0 }}>{playing.item.Name}</h2>
              <button className="icon-btn" aria-label="Close player" onClick={() => playDialog.current?.close()}><X size={18} /></button>
            </div>
            {PLAYABLE.test(playing.item.Name) && !playing.error ? (
              /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)$/i.test(playing.item.Name)
                ? <audio controls autoPlay src={playing.url} style={{ width: "100%" }} onError={() => setPlaying({ ...playing, error: "This audio format can't be played here." })} />
                : <video controls autoPlay src={playing.url} style={{ width: "100%", maxHeight: "70vh", borderRadius: 10, background: "#000" }} onError={() => setPlaying({ ...playing, error: "This video format can't be played here." })} />
            ) : (
              <p className="banner small">{playing.error ?? "DriveMerge's built-in player can't play this format."} Copy the stream link and open it in VLC (Media → Open Network Stream).</p>
            )}
            <div className="row between">
              <p className="small muted">Streams from your pool while DriveMerge is running. Nothing is downloaded.</p>
              <button className="btn" onClick={() => navigator.clipboard.writeText(playing.url).then(() => setToast("Stream link copied"))}><Link size={15} /> Copy stream link</button>
            </div>
          </div>
        )}
      </dialog>

      <dialog ref={moveDialog} aria-label="Move or copy" onClose={() => setMoving(undefined)}>
        {moving && <MoveDialog items={moving} accounts={isUnion ? members : []} startPath={path} locate={locate}
          onClose={() => moveDialog.current?.close()}
          onDone={(msg) => { moveDialog.current?.close(); setSelected(new Set()); setToast(msg); setTimeout(() => setToast(""), 3500); refresh(); }} />}
      </dialog>
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

function MoveDialog({ items, accounts, startPath, locate, onClose, onDone }: {
  items: Item[]; accounts: string[]; startPath: string; locate: (p: string) => Promise<string[]>;
  onClose: () => void; onDone: (msg: string) => void;
}) {
  const [copy, setCopy] = useState(false);
  const [dest, setDest] = useState(startPath);
  const [account, setAccount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const to = dest.trim().replace(/^\/+|\/+$/g, "");
    try {
      for (const it of items) {
        const target = joinPath(to, it.Name);
        // Without a chosen account the pool decides where it lands; with one, go account to account.
        const src = account ? (await locate(it.Path)).find((a) => a !== account) : undefined;
        if (account && !src) continue; // already only in that account
        if (!account && target === it.Path) continue;
        const srcFs = src ? `${src}:` : FS;
        const dstFs = account ? `${account}:` : FS;
        if (it.IsDir) await rc(copy ? "sync/copy" : "sync/move", { srcFs: `${srcFs}${it.Path}`, dstFs: `${dstFs}${target}`, deleteEmptySrcDirs: true, _async: true });
        else await rc(copy ? "operations/copyfile" : "operations/movefile", { srcFs, srcRemote: it.Path, dstFs, dstRemote: target, _async: true });
      }
      onDone(`${copy ? "Copying" : "Moving"} ${items.length} item(s). Progress is in Activity.`);
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  return (
    <form className="dialog-body" onSubmit={submit}>
      <h2>{items.length === 1 ? `Move or copy "${items[0].Name}"` : `Move or copy ${items.length} items`}</h2>
      <div className="seg" role="group" aria-label="Action">
        <button type="button" aria-pressed={!copy} onClick={() => setCopy(false)}>Move</button>
        <button type="button" aria-pressed={copy} onClick={() => setCopy(true)}><Copy size={13} style={{ verticalAlign: -2 }} /> Copy</button>
      </div>
      <label className="field">
        <span>To folder in your pool</span>
        <input value={dest} onChange={(e) => setDest(e.target.value)} placeholder="Leave empty for the top level" />
      </label>
      {!!accounts.length && (
        <label className="field">
          <span>Account</span>
          <select value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">Let the pool decide</option>
            {accounts.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <small className="small muted">Pick an account to move files into it, for example to free up space in another one.</small>
        </label>
      )}
      {error && <p className="error small">{error}</p>}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy}>{busy && <Loader2 size={15} className="spin" />} {copy ? "Copy" : "Move"}</button>
      </div>
    </form>
  );
}

/** For each name in the current folder, which pool accounts hold it. */
function useSources(accounts: string[], path: string, listing: unknown) {
  const [map, setMap] = useState<Record<string, string[]>>({});
  const key = accounts.join(" ");
  useEffect(() => {
    if (!accounts.length) return setMap({});
    Promise.all(accounts.map((a) =>
      rc<{ list: Item[] }>("operations/list", { fs: `${a}:`, remote: path }).then((r) => r.list.map((i) => [i.Name, a] as const), () => []),
    )).then((all) => {
      const m: Record<string, string[]> = {};
      for (const [name, a] of all.flat()) (m[name] ??= []).push(a);
      setMap(m);
    });
  }, [key, path, listing]); // eslint-disable-line react-hooks/exhaustive-deps
  return map;
}

const byName = (a: Item, b: Item) => Number(b.IsDir) - Number(a.IsDir) || a.Name.localeCompare(b.Name);
const dupeKey = (i: Item) => `${i.Name.toLowerCase()}|${i.Size}`;

/** Files sharing a name and size, grouped next to each other. */
function duplicates(list: Item[]) {
  const groups = new Map<string, Item[]>();
  for (const i of list) groups.set(dupeKey(i), [...(groups.get(dupeKey(i)) ?? []), i]);
  return [...groups.values()].filter((g) => g.length > 1).flat();
}
